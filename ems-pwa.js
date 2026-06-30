/* ================= EMS PWA helper =================
 * - Service Worker 登録
 * - Android/デスクトップChrome: インストール導線（beforeinstallprompt）
 * - iOS Safari: 「ホーム画面に追加」の手動案内（一度きり・閉じたら再表示しない）
 * 既にスタンドアロン起動中、または閉じた後は表示しない。
 * ================================================ */
(function () {
  "use strict";

  // Service Worker 登録（https / localhost のみ有効）
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (e) {
        console.warn("[ems-pwa] SW登録失敗", e);
      });
    });
  }

  var DISMISS = "ems_pwa_hint_dismissed";
  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }
  function dismissed() { try { return localStorage.getItem(DISMISS) === "1"; } catch (e) { return false; } }

  document.addEventListener("DOMContentLoaded", function () {
    var hint = document.getElementById("pwaHint");
    var tx = document.getElementById("pwaHintTx");
    var btn = document.getElementById("pwaInstall");
    var x = document.getElementById("pwaHintX");
    if (!hint || !tx) return;

    function hide(remember) {
      hint.classList.remove("on");
      if (remember) { try { localStorage.setItem(DISMISS, "1"); } catch (e) {} }
    }
    if (x) x.onclick = function () { hide(true); };

    if (isStandalone() || dismissed()) return;

    var deferred = null;

    // Android / デスクトップChrome
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
      tx.innerHTML = "ホーム画面に追加して<b>アプリのように</b>使えます";
      if (btn) {
        btn.style.display = "";
        btn.onclick = function () {
          if (!deferred) return;
          deferred.prompt();
          deferred.userChoice.finally(function () { deferred = null; hide(true); });
        };
      }
      hint.classList.add("on");
    });

    // iOS Safari（beforeinstallprompt 非対応 → 手動案内）
    var ua = navigator.userAgent || "";
    var isIOS = /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS
    var isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|android/i.test(ua);
    if (isIOS && isSafari) {
      tx.innerHTML = "共有ボタン <b>⬆️</b> から「ホーム画面に追加」でアプリのように使えます";
      if (btn) btn.style.display = "none";
      setTimeout(function () {
        if (!dismissed() && !isStandalone()) hint.classList.add("on");
      }, 1500);
    }
  });
})();
