/* ================= EMS CLOUD SYNC =================
 * 学習記録を Supabase(user_progress) に同期する。
 * 設計：オフラインファースト
 *   - localStorage を常に「動作ストア」として使う（未ログイン・オフラインでも動く）
 *   - ログイン中は storage.set のたびにクラウドへ upsert（バックアップ）
 *   - ログイン時に「キー単位の更新時刻が新しい方を採用」してマージ
 *     （別端末の続きを復元しつつ、手元の新しい進捗は失わない）
 * 依存：ems-app.js（window.storage と各 load/render 関数）, ems-auth.js（window.EMSAuth）
 * ================================================== */
(function () {
  "use strict";

  if (!window.storage) { console.warn("[ems-sync] window.storage 未定義のため同期を無効化"); return; }

  var TABLE = "user_progress";
  // クラウド同期の対象キー（ems_sound 等の端末設定は同期しない）
  var SYNC_KEYS = ["ems_progress_v1", "ems_stats_v1", "ems_vocab_v1", "ems_vocab_weak_v1"];
  var META_KEY = "ems_sync_meta"; // { key: localUpdatedMs }

  var origSet = window.storage.set;
  // get は常に localStorage（origGet）のまま。クラウドはログイン時に local へ流し込む。

  /* ---------- メタ（ローカル更新時刻） ---------- */
  function meta() { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch (e) { return {}; } }
  function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }
  function touch(k, t) { var m = meta(); m[k] = t || Date.now(); saveMeta(m); }

  function client() { return window.EMSAuth && window.EMSAuth.client; }
  function uid() { return window.EMSAuth && window.EMSAuth.user && window.EMSAuth.user.id; }

  /* ---------- set をラップ：local 保存＋クラウド upsert ---------- */
  window.storage.set = async function (k, v) {
    await origSet(k, v);
    if (SYNC_KEYS.indexOf(k) >= 0) {
      touch(k);
      pushKey(k, v); // fire-and-forget
    }
  };

  function pushKey(k, vStr) {
    var c = client(), u = uid();
    if (!c || !u) return;
    var val;
    try { val = (vStr == null) ? null : JSON.parse(vStr); } catch (e) { val = vStr; }
    c.from(TABLE)
      .upsert({ user_id: u, key: k, value: val, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" })
      .then(function (res) { if (res && res.error) console.warn("[ems-sync] push失敗 " + k + ": " + res.error.message); })
      .catch(function (e) { console.warn("[ems-sync] push例外 " + k, e); });
  }

  /* ---------- ログイン時マージ（新しい方を採用） ---------- */
  var syncing = false;
  async function syncOnLogin() {
    var c = client(), u = uid();
    if (!c || !u || syncing) return;
    syncing = true;
    try {
      var res = await c.from(TABLE).select("key,value,updated_at").eq("user_id", u);
      if (res.error) { console.warn("[ems-sync] pull失敗: " + res.error.message); return; }
      var cloud = {};
      (res.data || []).forEach(function (r) { cloud[r.key] = r; });

      var m = meta();
      var changedLocal = false;
      var toPush = [];

      SYNC_KEYS.forEach(function (k) {
        var localStr = localStorage.getItem(k);
        var localTime = m[k] || 0;
        var cr = cloud[k];
        var cloudTime = cr ? (Date.parse(cr.updated_at) || 0) : -1;

        if (cr && cloudTime >= localTime) {
          // クラウドが新しい（または同等で存在）→ local へ反映
          var s = (cr.value == null) ? null : JSON.stringify(cr.value);
          if (s != null && s !== localStr) { localStorage.setItem(k, s); changedLocal = true; }
          m[k] = cloudTime;
        } else if (localStr != null) {
          // local が新しい or クラウドに無い → クラウドへ送る
          toPush.push(k);
          if (!m[k]) m[k] = Date.now();
        }
      });

      saveMeta(m);
      toPush.forEach(function (k) { pushKey(k, localStorage.getItem(k)); });

      if (changedLocal) await reloadAppState();
    } catch (e) {
      console.warn("[ems-sync] syncOnLogin例外", e);
    } finally {
      syncing = false;
    }
  }

  // クラウドから取り込んだ後、アプリの状態を読み直して画面を更新
  async function reloadAppState() {
    try {
      if (typeof loadProgress === "function") await loadProgress();
      if (typeof loadVocabProg === "function") await loadVocabProg();
      if (typeof loadStats === "function") await loadStats();
      if (typeof renderModes === "function") renderModes();
      if (typeof renderMenuBody === "function") renderMenuBody();
    } catch (e) { console.warn("[ems-sync] reloadAppState例外", e); }
  }

  /* ---------- 認証状態に追従 ---------- */
  if (window.EMSAuth && typeof window.EMSAuth.onChange === "function") {
    window.EMSAuth.onChange(function (user) {
      if (user) syncOnLogin();
    });
  } else {
    console.warn("[ems-sync] EMSAuth 未検出のためログイン同期は無効");
  }
})();
