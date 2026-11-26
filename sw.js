// TimeKeeper Service Worker
// 目的: アプリ本体と同梱資産をキャッシュし、オフラインでも真っ白にならないようにする。
// 注意: index.html や資産の内容を更新したら CACHE_VERSION を上げること（古いキャッシュが破棄される）。
const CACHE_VERSION = "tk-live-v14";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./styles.css",
  "./app.js",
  // 第2段: ライブラリとフォントをローカル同梱化（実行時の外部通信をゼロにする）
  "./react.production.min.js",
  "./react-dom.production.min.js",
  "./sortable.min.js",
  "./fonts.css",
  "./J7aHnp1uDWRBEqV98dVQztYldFcLowEFA87Heg.woff2",
  "./LDI2apCSOBg7S-QT7pa8FvOleefkkbIxyyg.woff2",
  "./LDI2apCSOBg7S-QT7pa8FvOqeefkkbIxyyg.woff2",
  "./LDI2apCSOBg7S-QT7pa8FvOreefkkbIx.woff2",
  "./LDI2apCSOBg7S-QT7pbYF_OleefkkbIxyyg.woff2",
  "./LDI2apCSOBg7S-QT7pbYF_OqeefkkbIxyyg.woff2",
  "./LDI2apCSOBg7S-QT7pbYF_OreefkkbIx.woff2",
  "./LDIxapCSOBg7S-QT7p4GM-aGW-rOq7s.woff2",
  "./LDIxapCSOBg7S-QT7p4HM-aGW-rO.woff2",
  "./LDIxapCSOBg7S-QT7p4JM-aGW-rOq7s.woff2",
  // OCRライブラリのみ従来通りCDN（キューシート読み取り使用時に遅延ロードされる設計のため）
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // 1件の取得失敗で全体を止めないよう、個別にキャッシュする
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try { const res = await fetch(url, { cache: "reload" }); if (res && (res.ok || res.type === "opaque")) await cache.put(url, res); } catch (e) { /* 取れた分だけで成立させる */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // 画面遷移はネットワーク優先（更新を取り込みつつ、オフライン時はキャッシュで開く）
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match("./index.html", { ignoreSearch: true });
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // それ以外の資産（CDN・フォント等）はキャッシュ優先。なければ取得して保存する
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const fresh = await fetch(req);
    if (fresh && (fresh.status === 200 || fresh.type === "opaque")) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  })());
});
