/* ================= EMS Service Worker (PWA) =================
 * オフライン対応のためアプリ本体をキャッシュする。
 * 方針:
 *   - 同一オリジンのアプリ資産のみ扱う（CDN/Supabase は素通し＝常にネットワーク）
 *   - オンライン時は network-first（cache:"no-cache" でHTTPキャッシュも
 *     必ず再検証 → ETag一致なら軽量な304）。取得成功時にキャッシュ更新。
 *   - オフライン時のみキャッシュから応答（PWAとして動き続ける）
 * これにより、デプロイ後は通常のリロードだけで常に最新版が反映される。
 * ========================================================== */
const CACHE = "ems-cache-v10";
const SHELL = [
  "./",
  "./index.html",
  "./ems-analytics.js",
  "./ems-data.js",
  "./ems-app.js",
  "./ems-auth.js",
  "./ems-sync.js",
  "./ems-paywall.js",
  "./ems-pwa.js",
  "./manifest.json",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon-180.png",
  "./tokushoho.html",
  "./terms.html",
  "./privacy.html",
  "./legal.css"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 別オリジン（Google Fonts / jsdelivr SDK / Supabase API）は素通し
  if (url.origin !== self.location.origin) return;

  // network-first: cache:"no-cache" でブラウザHTTPキャッシュを再検証させる
  // （GitHub Pages は max-age=600 を返すため、これがないと10分間古いまま）。
  // 未変更なら 304 が返り転送は軽い。オフライン時はキャッシュへフォールバック。
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((r) => {
        if (r && r.status === 200) { const cc = r.clone(); caches.open(CACHE).then((c) => c.put(req, cc)); }
        return r;
      })
      .catch(() =>
        caches.match(req).then((m) => m || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
      )
  );
});
