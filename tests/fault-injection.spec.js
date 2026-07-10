/* 実運用の障害シナリオを再現する自動テスト。
 * 本番には一切アクセスしない（Supabase / Stripe / CDN はすべて遮断 or 偽装）。
 *
 * シナリオ一覧:
 *   1. Supabase 全断（+ CDN 断）でもゲストとしてアプリが動く
 *   2. 決済成功リターン → Webhook 反映が遅延 → ポーリングで Pro 反映
 *   3. 決済成功リターン → 反映されずタイムアウト → 「再度試す」で復帰
 *   4. create-checkout-session が 500 → エラー表示＋リトライ導線
 *   5. 既に Pro のユーザーの二重決済 → already_pro ガードの案内
 *   6. is_pro 取得が通信断 → Pro 表示を維持（誤ロックしない）
 */
const { test, expect } = require("@playwright/test");
const { SUPABASE_HOST, jsonResponse, serveVendoredSdk, seedSession, stubSupabase } = require("./helpers");

// ポーリング間隔を短縮してテストを速くする
async function fastPoll(context, ms = 150) {
  await context.addInitScript((v) => { window.__EMS_POLL_MS = v; }, ms);
}

test("1. Supabase全断 + CDN断でもゲストとしてホームが動く", async ({ context, page }) => {
  await context.route(`https://${SUPABASE_HOST}/**`, (route) => route.abort());
  await context.route("https://cdn.jsdelivr.net/**", (route) => route.abort());

  await page.goto("/index.html");
  // 新規ユーザーのホーム（ようこそ + 一覧トグル）が描画される
  await expect(page.locator("#browseToggle")).toBeVisible({ timeout: 10000 });
  // 一覧を開くとシナリオカードが並ぶ（オフラインでも操作可能）
  await page.locator("#browseToggle").click();
  await expect(page.locator("#grid")).toBeVisible();
  const gridCount = await page.locator("#grid > *").count();
  expect(gridCount).toBeGreaterThan(0);
  // ローカルストレージ動作（進捗保存）が生きている
  const storageOk = await page.evaluate(async () => {
    await window.storage.set("__test__", "1");
    const r = await window.storage.get("__test__");
    return r && r.value === "1";
  });
  expect(storageOk).toBe(true);
});

test("2. 決済成功リターン → Webhook反映遅延 → ポーリングでPro反映", async ({ context, page }) => {
  await serveVendoredSdk(context);
  await seedSession(context);
  await fastPoll(context, 250);
  // Webhook 反映の遅延を時間で再現（ページ読込から2.5秒後に is_pro=true になる）
  const start = Date.now();
  await stubSupabase(context, { isPro: () => Date.now() - start > 2500 });

  await page.goto("/index.html?checkout=success");
  await expect(page.locator("#payOv")).toHaveClass(/on/);
  await expect(page.locator("#payMsg")).toContainText("反映中", { timeout: 5000 });
  await expect(page.locator("#payMsg")).toContainText("Proが有効になりました", { timeout: 15000 });
});

test("3. 決済成功リターン → 反映タイムアウト → 再度試すで復帰", async ({ context, page }) => {
  await serveVendoredSdk(context);
  await seedSession(context);
  await fastPoll(context);
  let proNow = false;
  await stubSupabase(context, { isPro: () => proNow });

  await page.goto("/index.html?checkout=success");
  // 12回のポーリングが尽きるとエラー表示＋リトライボタン
  await expect(page.locator("#payMsg")).toContainText("反映に時間がかかっています", { timeout: 20000 });
  await expect(page.locator("#payRetry")).toBeVisible();

  // Webhook がようやく反映された想定に切り替えて「再度試す」
  proNow = true;
  await page.locator("#payRetry").click();
  await expect(page.locator("#payMsg")).toContainText("Proが有効になりました", { timeout: 15000 });
});

test("4. 決済準備APIが500 → エラー表示とリトライ導線", async ({ context, page }) => {
  await serveVendoredSdk(context);
  await seedSession(context);
  await stubSupabase(context, {
    checkout: (route) => jsonResponse(route, { error: "boom" }, 500),
  });

  await page.goto("/index.html");
  await page.waitForFunction(() => window.EMSAuth && window.EMSAuth.user);
  await page.evaluate(() => window.emsOpenPay("upgrade"));
  await page.locator("#payAgreeChk").check();
  await page.locator("#payGo").click();

  await expect(page.locator("#payMsg")).toContainText("決済準備に失敗しました", { timeout: 15000 });
  await expect(page.locator("#payRetry")).toBeVisible();
  // ボタンが busy のまま固まっていない
  await expect(page.locator("#payGo")).toBeEnabled();
});

test("5. 既にProのユーザーの二重決済 → already_proガード", async ({ context, page }) => {
  await serveVendoredSdk(context);
  await seedSession(context);
  await stubSupabase(context, {
    checkout: (route) => jsonResponse(route, { error: "already_pro" }, 409),
  });

  await page.goto("/index.html");
  await page.waitForFunction(() => window.EMSAuth && window.EMSAuth.user);
  await page.evaluate(() => window.emsOpenPay("upgrade"));
  await page.locator("#payAgreeChk").check();
  await page.locator("#payGo").click();

  await expect(page.locator("#payMsg")).toContainText("すでにProプランをご利用中です", { timeout: 15000 });
});

test("6. is_pro取得が通信断 → Pro表示を維持し誤ロックしない", async ({ context, page }) => {
  await serveVendoredSdk(context);
  await seedSession(context);
  await stubSupabase(context); // その他のAPIは通常応答
  // profiles だけ個別ルートで上書き（Playwright は後に登録したルートが優先）
  let networkDown = false;
  await context.route(`https://${SUPABASE_HOST}/rest/v1/profiles**`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    if (networkDown) return route.abort();
    const wantsObject = (route.request().headers()["accept"] || "").includes("pgrst.object");
    return jsonResponse(route, wantsObject ? { is_pro: true } : [{ is_pro: true }]);
  });

  await page.goto("/index.html");
  await page.waitForFunction(() => window.EMS_PRO === true, null, { timeout: 15000 });

  // ここから profiles への通信が断絶。従来は catch で即 false（誤ロック）になっていた
  networkDown = true;
  const stillPro = await page.evaluate(() => window.EMSAuth.refreshPro());
  expect(stillPro).toBe(true);
  const flag = await page.evaluate(() => window.EMS_PRO);
  expect(flag).toBe(true);
});
