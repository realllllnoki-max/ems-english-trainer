/* 障害注入テストの共通ヘルパー。
 * 本番の Supabase / Stripe には一切アクセスせず、ルートインターセプトで
 * 遮断・偽装する。SDK は tests/vendor にベンダリングした実物を配る。 */
const path = require("path");

const SUPABASE_REF = "widfjtfhqjpnjdfsnlnx";
const SUPABASE_HOST = `${SUPABASE_REF}.supabase.co`;
const SDK_PATH = path.join(__dirname, "vendor", "supabase-js-2.min.js");

const TEST_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version, accept-profile, content-profile, prefer",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// CDN の supabase-js をローカルのベンダリング版で置き換える（ネット不要で決定的に）
async function serveVendoredSdk(context) {
  await context.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", (route) =>
    route.fulfill({ path: SDK_PATH, headers: { "Content-Type": "application/javascript" } })
  );
}

// ログイン済みセッションを localStorage に事前注入する
async function seedSession(context) {
  const session = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: TEST_USER,
  };
  await context.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
  }, [`sb-${SUPABASE_REF}-auth-token`, JSON.stringify(session)]);
}

/* Supabase API を偽装する。opts:
 *   isPro: () => boolean   … profiles.is_pro の応答（呼び出しごとに評価）
 *   checkout: (route) => … … create-checkout-session の応答（省略時 404）
 */
async function stubSupabase(context, opts = {}) {
  const isPro = opts.isPro || (() => false);

  await context.route(`https://${SUPABASE_HOST}/**`, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;

    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 200, headers: CORS, body: "ok" });
    }
    if (p === "/auth/v1/user") {
      return jsonResponse(route, TEST_USER);
    }
    if (p === "/auth/v1/token") {
      return jsonResponse(route, {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: TEST_USER,
      });
    }
    if (p.startsWith("/rest/v1/profiles")) {
      const wantsObject = (req.headers()["accept"] || "").includes("pgrst.object");
      const row = { is_pro: isPro() };
      return jsonResponse(route, wantsObject ? row : [row]);
    }
    if (p.startsWith("/rest/v1/user_progress")) {
      return jsonResponse(route, [], req.method() === "GET" ? 200 : 201);
    }
    if (p.startsWith("/rest/v1/app_events")) {
      return jsonResponse(route, [], 201);
    }
    if (p.startsWith("/functions/v1/create-checkout-session")) {
      if (opts.checkout) return opts.checkout(route);
      return jsonResponse(route, { error: "not_stubbed" }, 404);
    }
    return jsonResponse(route, {}, 200);
  });
}

module.exports = { SUPABASE_HOST, TEST_USER, CORS, jsonResponse, serveVendoredSdk, seedSession, stubSupabase };
