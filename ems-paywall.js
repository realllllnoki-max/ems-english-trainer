/* ================= EMS PAYWALL =================
 * 課金ロック/解放のフロント側。
 *  - 無料枠（非Pro）: 1日につき「シナリオ1問＋単語クイズ1回」。
 *    同じ日に始めたシナリオの再挑戦は無料枠を消費しない（クリア再挑戦OK）。
 *  - テストモードと2回目以降のプレイは Pro 限定。
 *  - startScene / startQuiz / startTest をラップして枠切れ・Pro限定をペイウォールへ。
 *  - 「このプランで続ける」をクリック時のみログイン & Checkout。
 *  - 決済からの戻り（?checkout=success）を検知して is_pro を再取得。
 * 依存: ems-app.js（startScene等, SCENES）, ems-auth.js（window.EMSAuth, window.EMS_PRO）
 * ============================================== */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function pro() { return !!window.EMS_PRO; }
  function auth() { return window.EMSAuth; }
  function track(ev, p) { try { if (window.emsTrack) window.emsTrack(ev, p); } catch (e) {} }
  // SCENES は ems-data.js の const（window には載らないが、クラシックスクリプト間で
  // グローバル字句スコープを共有するため bare 参照で取得できる）
  function scenes() {
    try { return (typeof SCENES !== "undefined" && SCENES) ? SCENES : []; } catch (e) { return []; }
  }

  // 無料枠のおすすめ導線に使うフォールバック（レベル1の先頭）
  function freeScene() {
    var l1 = scenes().filter(function (s) { return s && s.lv === 1; });
    return l1[0] || scenes()[0] || null;
  }

  /* ---------- 無料枠（1日: シナリオ1問＋単語クイズ1回） ---------- */
  var QUOTA_KEY = "ems_free_quota_v1";
  function quotaDay() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function quota() {
    var q = null;
    try { q = JSON.parse(localStorage.getItem(QUOTA_KEY) || "null"); } catch (e) {}
    if (!q || q.day !== quotaDay()) q = { day: quotaDay(), sceneId: null, quiz: false };
    return q;
  }
  function saveQuota(q) { try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch (e) {} }
  // 今日まだ枠が残っているか。今日すでに始めたシナリオ自身は再挑戦OK
  function canPlayScene(s) { var q = quota(); return !q.sceneId || (s && q.sceneId === s.id); }
  function useSceneQuota(s) { var q = quota(); if (!q.sceneId && s) { q.sceneId = s.id; saveQuota(q); } }
  function canPlayQuiz() { return !quota().quiz; }
  function useQuizQuota() { var q = quota(); if (!q.quiz) { q.quiz = true; saveQuota(q); } }
  // ホーム画面などから残り枠を参照する
  window.emsQuotaInfo = function () {
    var q = quota();
    return { scene: !q.sceneId, sceneId: q.sceneId, quiz: !q.quiz };
  };

  // カード描画(ems-app.js cardHTML)から参照する課金ステータス
  // 戻り: null（枠あり or Pro）/ "free"（今日の1問=再挑戦OK）/ "locked"（枠切れ）
  window.emsSceneStatus = function (s) {
    if (pro()) return null;
    var q = quota();
    if (!q.sceneId) return null;
    return (s && s.id === q.sceneId) ? "free" : "locked";
  };

  /* ---------- エントリーをラップして課金ゲート ---------- */
  var _startScene = window.startScene;
  if (typeof _startScene === "function") {
    window.startScene = function (s) {
      if (!pro() && s) {
        if (!canPlayScene(s)) { openPay("scene_quota"); return; }
        useSceneQuota(s);
      }
      return _startScene.apply(this, arguments);
    };
  }
  var _startQuiz = window.startQuiz;
  if (typeof _startQuiz === "function") {
    window.startQuiz = function () {
      if (!pro()) {
        if (!canPlayQuiz()) { openPay("quiz_quota"); return; }
        useQuizQuota();
      }
      return _startQuiz.apply(this, arguments);
    };
  }
  var _startTest = window.startTest;
  if (typeof _startTest === "function") {
    window.startTest = function () {
      if (!pro()) { openPay("test"); return; }
      return _startTest.apply(this, arguments);
    };
  }

  /* ---------- ペイウォール モーダル ---------- */
  var _lastRetryFn = null; // エラー時のリトライ用
  var _payReason = "upgrade"; // 直近にペイウォールを開いた理由（無料導線の出し分けに使う）
  // 開いた理由ごとに、上部の文言と「無料枠へ逃がす」ボタンを出し分ける。
  // 逃がし先は「まだ残っている方の無料枠」（例: クイズ枠切れ→シナリオ枠へ誘導）
  function applyPayVariant(reason) {
    _payReason = reason || "upgrade";
    var free = $("payFree"), or = $("payOr"), title = $("payTitle"), sub = $("paySub");
    var q = quota();
    var showFree = false, freeLabel = "";
    if (reason === "scene_quota") {
      if (title) title.textContent = "今日の無料シナリオは終了 🚑";
      if (sub) sub.textContent = "無料枠は1日1問。また明日プレイできます。Proなら全シナリオが使い放題。";
      if (!q.quiz) { showFree = true; freeLabel = "今日の無料単語クイズを試す 🔤"; }
    } else if (reason === "quiz_quota") {
      if (title) title.textContent = "今日の無料クイズは終了 🔤";
      if (sub) sub.textContent = "単語クイズの無料枠は1日1回。Proなら回数無制限で使えます。";
      if (!q.sceneId) { showFree = true; freeLabel = "今日の無料シナリオ1問を試す 🚑"; }
    } else if (reason === "test") {
      if (title) title.textContent = "テストモードはPro限定 ⚡";
      if (sub) sub.textContent = "実戦テストで実力チェックするにはProプランが必要です。";
      if (!q.sceneId) { showFree = true; freeLabel = "先に今日の無料1問を試す 🚑"; }
    } else {
      if (title) title.textContent = "Proで全機能を解放 🚑";
      if (sub) sub.textContent = "無料では毎日シナリオ1問＋単語クイズ1回。Proで使い放題に。";
      if (!q.sceneId) { showFree = true; freeLabel = "無料で1問試してみる 🎯"; }
    }
    if (free) { free.style.display = showFree ? "" : "none"; if (showFree) free.textContent = freeLabel; }
    if (or) or.style.display = showFree ? "" : "none";
    // 未ログインのゲストには「決済せず無料アカウントだけ作る」導線を出す
    // （決済ボタン経由でしか登録できないと無料ユーザーが増えないため）
    var fs = $("payFreeSignup");
    if (fs) fs.style.display = (auth() && auth().user) ? "none" : "";
  }
  function openPay(reason) {
    var ov = $("payOv");
    if (ov) { setPayMsg(""); applyPayVariant(reason); ov.classList.add("on"); }
    track("paywall_view", { reason: reason || "upgrade", pro: pro() });
  }
  // ホームの料金リンクなど、外部からペイウォールを開くための窓口
  window.emsOpenPay = openPay;
  function closePay() { var ov = $("payOv"); if (ov) ov.classList.remove("on"); }
  function setPayMsg(t, cls, retryFn) {
    var m = $("payMsg");
    if (!m) return;
    m.textContent = t || "";
    m.className = "auth-msg" + (cls ? " " + cls : "");
    _lastRetryFn = retryFn || null;
    // リトライボタンを追加/削除
    var existing = m.nextElementSibling;
    if (existing && existing.id === "payRetry") existing.remove();
    if (retryFn) {
      var btn = document.createElement("button");
      btn.id = "payRetry";
      btn.className = "b3 b3-blue b3-md";
      btn.style.marginTop = "10px";
      btn.textContent = "再度試す";
      btn.onclick = function () { retryFn(); };
      m.parentNode.insertBefore(btn, m.nextSibling);
    }
  }

  /* ---------- プラン選択 ---------- */
  var selectedPlan = "year"; // 既定は最安の1年プラン（HTML側の .on と一致）
  function wirePlanOpts() {
    var box = $("planOpts"); if (!box) return;
    var opts = box.querySelectorAll(".plan-opt");
    for (var i = 0; i < opts.length; i++) {
      opts[i].addEventListener("click", function () {
        for (var j = 0; j < opts.length; j++) opts[j].classList.remove("on");
        this.classList.add("on");
        selectedPlan = this.getAttribute("data-plan") || "year";
      });
    }
    var on = box.querySelector(".plan-opt.on");
    if (on) selectedPlan = on.getAttribute("data-plan") || selectedPlan;
  }

  function baseUrl() { return location.origin + location.pathname; }

  function agreed() {
    var chk = $("payAgreeChk");
    return !!(chk && chk.checked);
  }

  var _checkoutBusy = false; // 二重Checkout防止
  async function startCheckout() {
    if (_checkoutBusy) return;
    if (!agreed()) { setPayMsg("利用規約とプライバシーポリシーへの同意が必要です", "err"); return; }
    var a = auth();
    if (!a || !a.client) { setPayMsg("ログイン機能を読み込めませんでした", "err"); return; }
    var go = $("payGo"), goOld = go ? go.textContent : "";
    function busy(on) {
      _checkoutBusy = on;
      if (go) { go.disabled = on; go.textContent = on ? "準備中…" : goOld; }
    }
    busy(true);
    setPayMsg("決済ページを準備しています…");
    track("checkout_start", { plan: selectedPlan });
    try {
      var sres = await a.client.auth.getSession();
      var session = sres && sres.data && sres.data.session;
      if (!session) {
        busy(false);
        savePending(); // ログイン完了後（メール確認でページが変わっても）自動で決済を再開
        closePay(); // ペイウォールを閉じてからログインを開く（重ね順で裏に隠れて「固まった」ように見えるのを防ぐ）
        a.open("checkout"); // ログインモーダル開く（決済コンテキスト）
        return;
      }
      var r = await a.client.functions.invoke("create-checkout-session", {
        body: { returnUrl: baseUrl(), plan: selectedPlan },
        headers: { Authorization: "Bearer " + session.access_token }
      });
      if (r.error) {
        // サーバーが返した理由コードを取り出す（already_pro = 二重課金ガード）
        var code = null;
        try {
          var body = r.error.context && (await r.error.context.json());
          code = body && body.error;
        } catch (e2) {}
        if (code === "already_pro") {
          busy(false);
          setPayMsg("すでにProプランをご利用中です 🎉", "ok");
          a.refreshPro && a.refreshPro();
          setTimeout(function () { closePay(); }, 2000);
          return;
        }
        throw r.error;
      }
      var url = r.data && r.data.url;
      if (url) { location.href = url; return; } // 遷移するので busy は解除しない
      busy(false);
      setPayMsg("決済URLを取得できませんでした", "err", startCheckout);
    } catch (e) {
      busy(false);
      setPayMsg("決済準備に失敗しました", "err", startCheckout);
      console.warn("[paywall] checkout", e);
    }
  }

  async function openPortal(btn) {
    var a = auth();
    if (!a || !a.client) { setPayMsg("ポータルを開けません", "err"); return; }
    var old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "準備中…"; }
    try {
      var sres = await a.client.auth.getSession();
      var session = sres && sres.data && sres.data.session;
      if (!session) { setPayMsg("ログインが必要です"); return; }
      var r = await a.client.functions.invoke("create-portal-session", {
        body: { returnUrl: baseUrl() },
        headers: { Authorization: "Bearer " + session.access_token }
      });
      if (r.error) throw r.error;
      var url = r.data && r.data.url;
      if (url) { location.href = url; return; }
      setPayMsg("ポータルを開けませんでした", "err", function () { openPortal(btn); });
    } catch (e) {
      setPayMsg("プラン管理を開けませんでした", "err", function () { openPortal(btn); });
      console.warn("[paywall] portal", e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  /* ---------- アカウントモーダルのプラン表示 ---------- */
  function renderPlan() {
    var badge = $("planBadge"), up = $("acctUpgrade"), mg = $("acctManage");
    var loggedIn = !!(auth() && auth().user);
    if (badge) {
      if (!loggedIn) { badge.style.display = "none"; }
      else {
        badge.style.display = "block";
        badge.className = "plan-badge " + (pro() ? "pro" : "free");
        badge.textContent = pro() ? "✓ Proプラン 利用中" : "現在: 無料プラン（1問のみ）";
      }
    }
    if (up) up.style.display = (loggedIn && !pro()) ? "" : "none";
    if (mg) mg.style.display = (loggedIn && pro()) ? "" : "none";
  }

  /* ---------- トースト ---------- */
  var toastT = null;
  function toast(text, ms) {
    var el = $("emsToast"); if (!el) return;
    el.textContent = text; el.classList.add("on");
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove("on"); }, ms || 3200);
  }

  /* ---------- 決済後の is_pro 反映待ち ----------
   * Webhook 反映は非同期。約30秒ポーリングし、それでも反映されなければ
   * 「再度確認」ボタンでポーリングを再開できるようにする（再読込不要）。 */
  var POLL_MS = window.__EMS_POLL_MS || 2500; // テストから間隔を短縮できる
  function pollProAfterCheckout() {
    setPayMsg("💳 決済が完了しました\n反映中です...");
    var tries = 0;
    var maxTries = 12;
    var iv = setInterval(function () {
      tries++;
      var remaining = Math.max(0, Math.ceil((maxTries - tries) * POLL_MS / 1000));
      if (auth() && auth().refreshPro) {
        auth().refreshPro().then(function (isPro) {
          if (isPro) {
            clearInterval(iv);
            setPayMsg("🎉 Proが有効になりました！\n全機能が使えます", "ok");
            setTimeout(function () { closePay(); }, 2000);
          } else if (tries < maxTries) {
            setPayMsg("💳 決済が完了しました\n反映中です... (" + remaining + "秒)");
          }
        }).catch(function () {
          if (tries < maxTries) {
            setPayMsg("💳 決済が完了しました\n反映中です... (" + remaining + "秒)");
          }
        });
      }
      if (tries >= maxTries) {
        clearInterval(iv);
        setPayMsg("反映に時間がかかっています。\n少し待ってから下のボタンで確認してください。", "err", pollProAfterCheckout);
      }
    }, POLL_MS);
  }

  /* ---------- 決済からの戻り処理 ---------- */
  function handleReturn() {
    var q = new URLSearchParams(location.search);
    var co = q.get("checkout");
    if (!co) return;
    // クエリを消す
    try { history.replaceState(null, "", baseUrl()); } catch (e) {}
    if (co === "success") {
      clearPending();
      track("purchase_success", {});
      openPay();
      pollProAfterCheckout();
    } else if (co === "cancel") {
      track("checkout_cancel", {});
      toast("購入はキャンセルされました");
    }
  }

  /* ---------- 購入意思の永続化 ----------
   * ログイン（特にメール確認でページ遷移する場合）をまたいで
   * 「決済に進む途中だった」ことを覚えておき、ログイン完了後に自動で再開する。 */
  var _pendingCheckout = false; // 同一ページ内でのログイン後に自動Checkout実行フラグ
  var PENDING_KEY = "ems_pending_checkout";
  var PENDING_TTL = 60 * 60 * 1000; // 1時間で失効

  function savePending() {
    _pendingCheckout = true;
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ plan: selectedPlan, t: Date.now() })); } catch (e) {}
  }
  function clearPending() {
    _pendingCheckout = false;
    try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  }
  function loadPending() {
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.t || (Date.now() - d.t) > PENDING_TTL) { clearPending(); return null; }
      return d;
    } catch (e) { return null; }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var pc = $("payClose"); if (pc) pc.onclick = closePay;
    var ov = $("payOv"); if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) closePay(); });
    wirePlanOpts();
    var go = $("payGo"); if (go) go.onclick = startCheckout;
    var agreeChk = $("payAgreeChk");
    if (agreeChk && go) agreeChk.onchange = function () { go.disabled = !agreeChk.checked; };
    var free = $("payFree"); if (free) free.onclick = function () {
      closePay();
      track("paywall_free_cta", { reason: _payReason });
      if (_payReason === "scene_quota") {
        // シナリオ枠切れ → まだ残っている単語クイズ枠へ（window.startQuiz 経由で枠を消費）
        if (typeof window.startQuiz === "function") window.startQuiz("__all__");
        return;
      }
      // それ以外 → 今日の無料シナリオへ（window.startScene 経由で枠を消費）
      var nx = null;
      try { if (typeof recommendNext === "function") nx = recommendNext(null); } catch (e) {}
      if (!nx) nx = freeScene();
      if (nx && typeof window.startScene === "function") window.startScene(nx);
    };
    var fs = $("payFreeSignup"); if (fs) fs.onclick = function () {
      closePay();
      track("signup_cta_click", { placement: "paywall" });
      var a = auth(); if (a && a.open) a.open("save");
    };
    var up = $("acctUpgrade"); if (up) up.onclick = function () {
      var aov = $("authOv"); if (aov) aov.classList.remove("on");
      openPay();
    };
    var mg = $("acctManage"); if (mg) mg.onclick = function () { openPortal(mg); };

    renderPlan();
    handleReturn();

    // ログイン完了後に自動Checkoutを実行（ユーザー再クリック不要）。
    // メール確認リンク経由でページが開き直された場合も localStorage から復帰する。
    if (window.EMSAuth && typeof window.EMSAuth.onChange === "function") {
      window.EMSAuth.onChange(function (user) {
        if (!user || pro()) { return; }
        var saved = loadPending();
        if (!_pendingCheckout && !saved) return;
        if (saved && saved.plan) { // 選んでいたプランを復元（UIのハイライトも同期）
          selectedPlan = saved.plan;
          var box = $("planOpts");
          if (box) {
            var opts = box.querySelectorAll(".plan-opt");
            for (var i = 0; i < opts.length; i++) {
              opts[i].classList.toggle("on", (opts[i].getAttribute("data-plan") || "") === saved.plan);
            }
          }
        }
        clearPending();
        openPay();
        // 同意チェックは決済開始時（savePending 前）に確認済み。OAuth やメール確認の
        // リダイレクトを跨ぐとチェックが未選択に戻り、startCheckout が同意エラーで
        // 止まってしまうため、ここで同意済み状態を復元する。
        var chk = $("payAgreeChk"), go = $("payGo");
        if (chk) chk.checked = true;
        if (go) go.disabled = false;
        setPayMsg("決済ページを準備しています…");
        setTimeout(function () { startCheckout(); }, 400);
      });
    }
  });

  // is_pro / ログイン状態が変わったらプラン表示＋カードのロック表示を更新
  function onProChange() {
    renderPlan();
    if (typeof renderMenuBody === "function") { try { renderMenuBody(); } catch (e) {} }
  }
  document.addEventListener("ems-pro-change", onProChange);
  if (window.EMSAuth && typeof window.EMSAuth.onChange === "function") {
    window.EMSAuth.onChange(function () { onProChange(); });
  }
})();
