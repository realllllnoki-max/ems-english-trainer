/* ================= EMS ANALYTICS =================
 * ファネル計測。イベントを Supabase(app_events) に fire-and-forget で送る。
 *  - 失敗してもアプリの動作には一切影響しない（握りつぶす）
 *  - ems-auth.js より先に読み込まれるため、クライアント準備前のイベントは
 *    キューに貯めて、準備でき次第まとめて送る
 *  - 個人情報は送らない。匿名の端末ID＋（ログイン中のみ）user_id だけ
 * 主なイベント:
 *   app_open / scene_start / mic_primer / first_question_done / scene_finish
 *   quiz_start / quiz_finish / paywall_view / auth_submit / auth_success
 *   checkout_start / purchase_success / checkout_cancel
 * ================================================== */
(function () {
  "use strict";

  var TABLE = "app_events";
  var DID_KEY = "ems_device_id";
  var queue = [];
  var deviceId = null;

  function did() {
    if (deviceId) return deviceId;
    try {
      deviceId = localStorage.getItem(DID_KEY);
      if (!deviceId) {
        deviceId = "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(DID_KEY, deviceId);
      }
    } catch (e) { deviceId = "d-anon"; }
    return deviceId;
  }

  function client() { return window.EMSAuth && window.EMSAuth.client; }
  function uid() { return (window.EMSAuth && window.EMSAuth.user && window.EMSAuth.user.id) || null; }

  function flush() {
    var c = client();
    if (!c || !queue.length) return;
    var rows = queue.splice(0, queue.length);
    try {
      c.from(TABLE).insert(rows)
        .then(function (r) { if (r && r.error) console.warn("[ems-analytics] 送信失敗: " + r.error.message); })
        .catch(function () {});
    } catch (e) {}
  }

  window.emsTrack = function (event, props) {
    try {
      queue.push({
        device_id: did(),
        user_id: uid(),
        event: String(event).slice(0, 64),
        props: props || {}
      });
      flush();
    } catch (e) {}
  };

  // ems-auth.js（クライアント生成）を待って初期キューを流す
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (client()) { flush(); if (!queue.length) clearInterval(iv); }
    if (tries > 60) clearInterval(iv);
  }, 1000);

  // 初回起動かどうか＋流入元（?from= / ?utm_source= / リファラー）付きの app_open
  var FIRST_KEY = "ems_first_open";
  var first = false;
  try {
    first = !localStorage.getItem(FIRST_KEY);
    if (first) localStorage.setItem(FIRST_KEY, String(Date.now()));
  } catch (e) {}
  var src = null, ref = null;
  try {
    var sp = new URLSearchParams(location.search);
    src = sp.get("from") || sp.get("utm_source") || null;
  } catch (e) {}
  try { ref = document.referrer ? new URL(document.referrer).host : null; } catch (e) {}
  window.emsTrack("app_open", { first: first, src: src, ref: ref });
})();
