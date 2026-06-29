/* ================= EMS Service Worker (PWA) =================
 * オフライン対応のためアプリ本体をキャッシュする。
 * 方針:
 *   - 同一オリジンのアプリ資産のみ扱う（CDN/Supabase は素通し＝常にネットワーク）
 *   - HTML（ナビゲーション）は network-first（更新を取り込みやすく）
 *   - その他の同一オリジン資産は stale-while-revalidate
 * 更新時は CACHE のバージョンを上げる。
 * ========================================================== */
const CACHE = "ems-cache-v3";
const SHELL = [
  "./",
  "./index.html",
  "./ems-data.js",
  "./ems-app.js",
  "./ems-auth.js",
  "./ems-sync.js",
  "./ems-paywall.js",
  "./ems-pwa.js",
  "./manifest.json",
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

  // HTML ナビゲーション: network-first（取れたらキャッシュ更新、ダメならキャッシュ）
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { const cc = r.clone(); caches.open(CACHE).then((c) => c.put(req, cc)); return r; })
        .catch(() => caches.match(req).then((m) => m || caches.match("./index.html")))
    );
    return;
  }

  // 同一オリジンの静的資産: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((r) => {
          if (r && r.status === 200) { const cc = r.clone(); caches.open(CACHE).then((c) => c.put(req, cc)); }
          return r;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
