/* ================= EMS AUTH (Supabase) =================
 * メールログイン（メール＋パスワード）。Google は後から追加予定。
 * ゲストでは無料の1問をプレイ可能。有料化するときだけログイン。
 * 公開して安全な値のみ（URL / publishable key）をここに置く。
 * service role などのサーバー専用キーは絶対に置かない。
 * ====================================================== */
(function () {
  "use strict";

  var SUPABASE_URL = "https://widfjtfhqjpnjdfsnlnx.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_d3iTRI9F9tQddtvf7PjiVA_4RqoTpqr";

  // 他ステップ（クラウド同期・課金ロック）から使う共通ハンドル
  var EMSAuth = {
    client: null,
    user: null,
    isPro: false,
    _cbs: [],
    _context: "default", // "default" | "checkout"
    onChange: function (cb) {
      this._cbs.push(cb);
      if (this.client) { try { cb(this.user); } catch (e) {} }
    },
    _emit: function () {
      var u = this.user, list = this._cbs.slice();
      for (var i = 0; i < list.length; i++) { try { list[i](u); } catch (e) {} }
    },
    open: function (ctx) { if (ctx) EMSAuth._context = ctx; if (ctx === "checkout") mode = "signup"; openModal(); },
    signOut: function () { return doSignOut(); },
    refreshPro: function () { return refreshPro(); }
  };
  window.EMSAuth = EMSAuth;
  window.EMS_PRO = false;

  function setPro(v) {
    v = !!v;
    EMSAuth.isPro = v;
    window.EMS_PRO = v;
    try { document.dispatchEvent(new CustomEvent("ems-pro-change", { detail: v })); } catch (e) {}
  }

  // profiles.is_pro を取得して反映（有料判定はサーバー(Webhook)が正本。ここは表示用の取得）
  function refreshPro() {
    if (!EMSAuth.client || !EMSAuth.user) { setPro(false); return Promise.resolve(false); }
    return EMSAuth.client.from("profiles").select("is_pro").eq("id", EMSAuth.user.id).single()
      .then(function (r) { var v = !!(r && r.data && r.data.is_pro); setPro(v); return v; })
      .catch(function () { setPro(false); return false; });
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.warn("[ems-auth] Supabase SDK が読み込めませんでした（オフライン等）。ログイン機能は無効です。");
    // ログインボタンは押せるが「利用できません」と出すだけにする
  } else {
    EMSAuth.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  /* ---------- DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var ov, msgEl, emailEl, passEl, submitEl, formsEl, acctEl, btn;
  var mode = "signup"; // "login" | "signup" （初回ユーザーはサインアップをデフォルトに）

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    ov = $("authOv"); msgEl = $("authMsg");
    emailEl = $("authEmail"); passEl = $("authPass"); submitEl = $("authSubmit");
    formsEl = $("authForms"); acctEl = $("authAccount"); btn = $("emsAccount");

    if (btn) btn.addEventListener("click", openModal);
    var close = $("authClose"); if (close) close.addEventListener("click", closeModal);
    if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) closeModal(); });

    var tL = $("tabLogin"), tS = $("tabSignup");
    if (tL) tL.addEventListener("click", function () { setMode("login"); });
    if (tS) tS.addEventListener("click", function () { setMode("signup"); });
    if (submitEl) submitEl.addEventListener("click", onSubmit);
    if (passEl) passEl.addEventListener("keydown", function (e) { if (e.key === "Enter") onSubmit(); });
    var so = $("authSignout"); if (so) so.addEventListener("click", doSignOut);

    if (!EMSAuth.client) { renderHeader(); return; } // SDK読み込み失敗時もゲスト表示（ボタン非表示）にする

    // 既存セッションの復元＋状態変化の監視
    EMSAuth.client.auth.getUser().then(function (res) {
      EMSAuth.user = (res && res.data && res.data.user) || null;
      renderHeader(); EMSAuth._emit(); refreshPro();
    });
    EMSAuth.client.auth.onAuthStateChange(function (_event, session) {
      EMSAuth.user = (session && session.user) || null;
      renderHeader(); renderModalState(); EMSAuth._emit(); refreshPro();
    });
  }

  /* ---------- ヘッダー表示 ---------- */
  function renderHeader() {
    if (!btn) return;
    if (EMSAuth.user) {
      btn.style.display = "flex";
      var em = EMSAuth.user.email || "";
      btn.innerHTML = '<span class="av">' + esc(initial(em)) + "</span>";
      btn.setAttribute("aria-label", "アカウント: " + em);
    } else {
      btn.style.display = "none";
    }
  }

  /* ---------- モーダル ---------- */
  function openModal() {
    if (!EMSAuth.client) { alert("ログイン機能を読み込めませんでした。通信環境をご確認ください。"); return; }
    renderModalState();
    if (ov) ov.classList.add("on");
  }
  function closeModal() { if (ov) ov.classList.remove("on"); setMsg("", ""); EMSAuth._context = "default"; }

  function renderModalState() {
    if (!formsEl || !acctEl) return;
    if (EMSAuth.user) {
      formsEl.style.display = "none";
      acctEl.style.display = "block";
      var em = EMSAuth.user.email || "";
      var av = $("acctAv"), ce = $("acctEmail");
      if (av) av.textContent = initial(em);
      if (ce) ce.textContent = em;
    } else {
      formsEl.style.display = "block";
      acctEl.style.display = "none";
      setMode(mode);
    }
  }

  function setMode(m) {
    mode = m;
    var tL = $("tabLogin"), tS = $("tabSignup"), title = $("authTitle"), sub = $("authSub");
    if (tL) tL.classList.toggle("on", m === "login");
    if (tS) tS.classList.toggle("on", m === "signup");
    var isCheckout = EMSAuth._context === "checkout";
    if (m === "login") {
      if (title) title.textContent = isCheckout ? "ログイン" : "おかえりなさい";
      if (sub) sub.textContent = isCheckout ? "Proを購入するにはログインが必要です" : "ログインして、続きを保存";
      if (submitEl) submitEl.textContent = "ログイン";
      if (passEl) passEl.setAttribute("autocomplete", "current-password");
    } else {
      if (title) title.textContent = isCheckout ? "アカウント作成" : "学習を始めよう";
      if (sub) sub.textContent = isCheckout ? "アカウント作成してProを購入（記録はクラウド保存）" : "アカウント作成で、記録を同期できます（無料）";
      if (submitEl) submitEl.textContent = "作成する";
      if (passEl) passEl.setAttribute("autocomplete", "new-password");
    }
    setMsg("", "");
  }

  /* ---------- 送信 ---------- */
  function track(ev, p) { try { if (window.emsTrack) window.emsTrack(ev, p); } catch (e) {} }

  function onSubmit() {
    if (!EMSAuth.client) return;
    var email = (emailEl.value || "").trim();
    var pass = passEl.value || "";
    if (!email) { setMsg("メールアドレスを入力してください", "err"); return; }
    if (pass.length < 6) { setMsg("パスワードは6文字以上で入力してください", "err"); return; }

    track("auth_submit", { mode: mode, context: EMSAuth._context });
    busy(true);
    var p = (mode === "login")
      ? EMSAuth.client.auth.signInWithPassword({ email: email, password: pass })
      : EMSAuth.client.auth.signUp({ email: email, password: pass });

    p.then(function (res) {
      busy(false);
      if (res.error) { track("auth_error", { mode: mode }); setMsg(jpError(res.error), "err"); return; }
      if (mode === "signup" && res.data && !res.data.session) {
        // メール確認が有効な場合：確認メール送信
        track("auth_email_sent", { context: EMSAuth._context });
        var extra = (EMSAuth._context === "checkout") ? "登録が完了すると、そのまま決済に進めます。" : "";
        setMsg("確認メールを送信しました。メール内のリンクを開くと登録完了です。" + extra, "ok");
        return;
      }
      // ログイン成功（onAuthStateChange が状態を更新）
      track("auth_success", { mode: mode, context: EMSAuth._context });
      setMsg("", "");
      closeModal();
    }).catch(function (err) {
      busy(false);
      setMsg(jpError(err), "err");
    });
  }

  function doSignOut() {
    if (!EMSAuth.client) return Promise.resolve();
    busy(true);
    return EMSAuth.client.auth.signOut().then(function () {
      busy(false); closeModal();
    }).catch(function () { busy(false); });
  }

  /* ---------- helpers ---------- */
  function busy(on) {
    if (submitEl) submitEl.disabled = on;
    var so = $("authSignout"); if (so) so.disabled = on;
  }
  function setMsg(t, cls) {
    if (!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = "auth-msg" + (cls ? " " + cls : "");
  }
  function initial(email) { return (email || "U").trim().charAt(0).toUpperCase() || "U"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function jpError(err) {
    var m = (err && err.message) || "";
    if (/Invalid login credentials/i.test(m)) return "メールアドレスまたはパスワードが違います";
    if (/already registered|User already/i.test(m)) return "このメールアドレスは既に登録されています";
    if (/Email not confirmed/i.test(m)) return "メール確認が完了していません。受信メールのリンクを開いてください";
    if (/rate limit|too many/i.test(m)) return "回数制限です。しばらくしてからお試しください";
    if (/Password should be/i.test(m)) return "パスワードは6文字以上にしてください";
    return m || "エラーが発生しました。もう一度お試しください";
  }
})();
