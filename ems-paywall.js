/* ================= EMS PAYWALL =================
 * 課金ロック/解放のフロント側。
 *  - ゲスト状態で「レベル1の最初の1問」だけ無料プレイ可能。
 *  - 2問目以降・他レベル・全機能は Pro 限定（ログイン必須）。
 *  - startScene / startQuiz / startTest をラップして非Proをペイウォールへ。
 *  - 「このプランで続ける」をクリック時のみログイン & Checkout。
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
  var _lastRetryFn = null; // エラー時のリトライ用
  function openPay() { var ov = $("payOv"); if (ov) { setPayMsg(""); ov.classList.add("on"); } }
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

  async function startCheckout() {
    var a = auth();
    if (!a || !a.client) { setPayMsg("ログイン機能を読み込めませんでした", "err"); return; }
    setPayMsg("決済ページを準備しています…");
    try {
      var sres = await a.client.auth.getSession();
      var session = sres && sres.data && sres.data.session;
      if (!session) {
        setPayMsg("決済にはログインが必要です");
        _pendingCheckout = true; // ログイン後に自動Checkout実行を予約
        a.open(); // ログインモーダル開く（ペイウォールは開いたまま）
        return;
      }
      var r = await a.client.functions.invoke("create-checkout-session", {
        body: { returnUrl: baseUrl(), plan: selectedPlan },
        headers: { Authorization: "Bearer " + session.access_token }
      });
      if (r.error) throw r.error;
      var url = r.data && r.data.url;
      if (url) { location.href = url; } else { setPayMsg("決済URLを取得できませんでした", "err"); }
    } catch (e) {
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

  /* ---------- 決済からの戻り処理 ---------- */
  function handleReturn() {
    var q = new URLSearchParams(location.search);
    var co = q.get("checkout");
    if (!co) return;
    // クエリを消す
    try { history.replaceState(null, "", baseUrl()); } catch (e) {}
    if (co === "success") {
      openPay();
      setPayMsg("💳 決済が完了しました\n反映中です...");
      // Webhook 反映は非同期。数回 is_pro を再取得してUIを更新
      var tries = 0;
      var maxTries = 6;
      var iv = setInterval(function () {
        tries++;
        var remaining = Math.max(0, (maxTries - tries) * 2.5);
        if (auth() && auth().refreshPro) {
          auth().refreshPro().then(function (isPro) {
            if (isPro) {
              clearInterval(iv);
              setPayMsg("🎉 Proが有効になりました！\n全機能が使えます", "ok");
              setTimeout(function () { closePay(); }, 2000);
            } else if (tries < maxTries) {
              var sec = Math.ceil(remaining);
              setPayMsg("💳 決済が完了しました\n反映中です... (" + sec + "秒)");
            }
          }).catch(function () {
            if (tries < maxTries) {
              var sec = Math.ceil(remaining);
              setPayMsg("💳 決済が完了しました\n反映中です... (" + sec + "秒)");
            }
          });
        }
        if (tries >= maxTries) {
          clearInterval(iv);
          setPayMsg("反映に時間がかかっています。\nしばらくしてから、ページを再読込してください。", "err");
        }
      }, 2500);
    } else if (co === "cancel") {
      toast("購入はキャンセルされました");
    }
  }

  /* ---------- 配線 ---------- */
  var _pendingCheckout = false; // ログイン後に自動Checkout実行フラグ

  document.addEventListener("DOMContentLoaded", function () {
    var pc = $("payClose"); if (pc) pc.onclick = closePay;
    var ov = $("payOv"); if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) closePay(); });
    wirePlanOpts();
    var go = $("payGo"); if (go) go.onclick = startCheckout;
    var free = $("payFree"); if (free) free.onclick = function () {
      closePay();
      var f = freeScene();
      if (f && typeof _startScene === "function") _startScene(f);
    };
    var up = $("acctUpgrade"); if (up) up.onclick = function () {
      var aov = $("authOv"); if (aov) aov.classList.remove("on");
      openPay();
    };
    var mg = $("acctManage"); if (mg) mg.onclick = function () { openPortal(mg); };

    renderPlan();
    handleReturn();

    // ログイン完了後に自動Checkoutを実行（ユーザー再クリック不要）
    if (window.EMSAuth && typeof window.EMSAuth.onChange === "function") {
      window.EMSAuth.onChange(function (user) {
        if (_pendingCheckout && user) {
          _pendingCheckout = false;
          setTimeout(function () { startCheckout(); }, 500);
        }
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
