/* ================= EMS PAYWALL =================
 * 課金ロック/解放のフロント側。
 *  - 無料は「レベル1の最初の1問」だけ。それ以外は Pro 限定。
 *  - startScene / startQuiz / startTest をラップして非Proをペイウォールへ。
 *  - Checkout / カスタマーポータルは Edge Function を呼ぶ。
 *  - 決済からの戻り（?checkout=success）を検知して is_pro を再取得。
 * 依存: ems-app.js（startScene等, SCENES）, ems-auth.js（window.EMSAuth, window.EMS_PRO）
 * ============================================== */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function pro() { return !!window.EMS_PRO; }
  function auth() { return window.EMSAuth; }
  // SCENES は ems-data.js の const（window には載らないが、クラシックスクリプト間で
  // グローバル字句スコープを共有するため bare 参照で取得できる）
  function scenes() {
    try { return (typeof SCENES !== "undefined" && SCENES) ? SCENES : []; } catch (e) { return []; }
  }

  // 無料で遊べる唯一のシナリオ（レベル1の先頭）
  function freeScene() {
    var l1 = scenes().filter(function (s) { return s && s.lv === 1; });
    return l1[0] || scenes()[0] || null;
  }
  function isFree(s) { var f = freeScene(); return !!(f && s && s.id === f.id); }

  // カード描画(ems-app.js cardHTML)から参照する課金ステータス
  // 戻り: "free"（無料の1問）/ "locked"（Pro限定）/ null（Pro なのでロックなし）
  window.emsSceneStatus = function (s) {
    if (pro()) return null;
    return isFree(s) ? "free" : "locked";
  };

  /* ---------- エントリーをラップして課金ゲート ---------- */
  var _startScene = window.startScene;
  if (typeof _startScene === "function") {
    window.startScene = function (s) {
      if (!pro() && s && !isFree(s)) { openPay(); return; }
      return _startScene.apply(this, arguments);
    };
  }
  var _startQuiz = window.startQuiz;
  if (typeof _startQuiz === "function") {
    window.startQuiz = function () {
      if (!pro()) { openPay(); return; }
      return _startQuiz.apply(this, arguments);
    };
  }
  var _startTest = window.startTest;
  if (typeof _startTest === "function") {
    window.startTest = function () {
      if (!pro()) { openPay(); return; }
      return _startTest.apply(this, arguments);
    };
  }

  /* ---------- ペイウォール モーダル ---------- */
  function openPay() { var ov = $("payOv"); if (ov) { setPayMsg(""); ov.classList.add("on"); } }
  function closePay() { var ov = $("payOv"); if (ov) ov.classList.remove("on"); }
  function setPayMsg(t, cls) { var m = $("payMsg"); if (m) { m.textContent = t || ""; m.className = "auth-msg" + (cls ? " " + cls : ""); } }

  function baseUrl() { return location.origin + location.pathname; }

  async function startCheckout() {
    var a = auth();
    if (!a || !a.client) { setPayMsg("ログイン機能を読み込めませんでした", "err"); return; }
    setPayMsg("決済ページを準備しています…");
    try {
      var sres = await a.client.auth.getSession();
      var session = sres && sres.data && sres.data.session;
      if (!session) { closePay(); a.open(); return; } // 未ログインならログインへ
      var r = await a.client.functions.invoke("create-checkout-session", {
        body: { returnUrl: baseUrl() },
        headers: { Authorization: "Bearer " + session.access_token }
      });
      if (r.error) throw r.error;
      var url = r.data && r.data.url;
      if (url) { location.href = url; } else { setPayMsg("決済URLを取得できませんでした", "err"); }
    } catch (e) {
      setPayMsg("決済準備に失敗しました（時間をおいて再度お試しください）", "err");
      console.warn("[paywall] checkout", e);
    }
  }

  async function openPortal(btn) {
    var a = auth();
    if (!a || !a.client) return;
    var old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "準備中…"; }
    try {
      var sres = await a.client.auth.getSession();
      var session = sres && sres.data && sres.data.session;
      if (!session) { toast("ログインが必要です"); return; }
      var r = await a.client.functions.invoke("create-portal-session", {
        body: { returnUrl: baseUrl() },
        headers: { Authorization: "Bearer " + session.access_token }
      });
      if (r.error) throw r.error;
      var url = r.data && r.data.url;
      if (url) { location.href = url; return; }
      toast("ポータルを開けませんでした");
    } catch (e) {
      toast("プラン管理を開けませんでした");
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

  /* ---------- 決済からの戻り処理 ---------- */
  function handleReturn() {
    var q = new URLSearchParams(location.search);
    var co = q.get("checkout");
    if (!co) return;
    // クエリを消す
    try { history.replaceState(null, "", baseUrl()); } catch (e) {}
    if (co === "success") {
      toast("決済が完了しました。反映まで数秒かかることがあります…", 4000);
      // Webhook 反映は非同期。数回 is_pro を再取得してUIを更新
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (auth() && auth().refreshPro) {
          auth().refreshPro().then(function (isPro) {
            if (isPro) { clearInterval(iv); toast("Proが有効になりました 🎉", 3500); }
          });
        }
        if (tries >= 6) clearInterval(iv);
      }, 2500);
    } else if (co === "cancel") {
      toast("購入はキャンセルされました");
    }
  }

  /* ---------- 配線 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var pc = $("payClose"); if (pc) pc.onclick = closePay;
    var ov = $("payOv"); if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) closePay(); });
    var go = $("payGo"); if (go) go.onclick = startCheckout;
    var free = $("payFree"); if (free) free.onclick = function () {
      closePay();
      var f = freeScene();
      if (f && typeof _startScene === "function") _startScene(f);
    };
    var up = $("acctUpgrade"); if (up) up.onclick = function () {
      var aov = $("authOv"); if (aov) aov.classList.remove("on"); // アカウントモーダルを閉じて
      openPay();                                                  // ペイウォールを開く
    };
    var mg = $("acctManage"); if (mg) mg.onclick = function () { openPortal(mg); };

    renderPlan();
    handleReturn();
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
