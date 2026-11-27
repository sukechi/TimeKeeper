// TimeKeeper Service Worker（安全化版 / v13+GPS）
// 方針（2026-11-27 障害調査報告書の SW 恒常ルールに準拠）:
// - キャッシュ削除は自アプリ接頭辞「tk-」の旧版だけに限定。他アプリのキャッシュには触れない。
// - fetch では全体検索（caches.match）を使わず、自キャッシュだけを見る。
// - HTML（ナビゲーション）はネットワーク優先、取れたら自キャッシュに保存。静的アセットはキャッシュ優先。
// - 核資産のプリキャッシュは all-or-nothing（1つでも取れなければ install を失敗させ、中途半端なキャッシュを作らない）。
// 注意: SW の中身かプリキャッシュ対象を変えたら CACHE_VERSION を上げること。ただし版上げは最大1日1回まで。
const CACHE_VERSION = "tk-v13gps-v1";
const CACHE_PREFIX = "tk-";

// 核資産（v13 の従来リストのうち同一オリジンのもの）: 全件そろうことが install 成功の条件
const CORE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

// 周辺資産（CDN）: ベストエフォート。取れた分だけ入れる（失敗しても install は成功させる）
const OPTIONAL_URLS = [
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // 核資産: ネットワークから取り直し（cache:"reload"）、全件成功が必須
    try {
      await Promise.all(CORE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      // 自己点検: 核資産が全部そろっているか確認する
      for (const url of CORE_URLS) {
        const hit = await cache.match(url, { ignoreSearch: true });
        if (!hit) throw new Error("precache incomplete: " + url);
      }
    } catch (e) {
      // 中途半端な新キャッシュを残さず、install を失敗させる（旧状態のまま動かす）
      await caches.delete(CACHE_VERSION);
      throw e;
    }
    // 周辺資産: 1件の失敗で全体を止めない
    await Promise.all(OPTIONAL_URLS.map(async (url) => {
      try { await cache.add(new Request(url, { cache: "reload" })); } catch (e) { /* 取れた分だけ */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // 自アプリ（接頭辞「tk-」）の旧版だけを削除する。他アプリのキャッシュには触れない。
    // 対象になる旧名の例: tk-v13 / tk-live-* / tk-light-*
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // 画面遷移はネットワーク優先（更新を取り込みつつ、オフライン時は自キャッシュで開く）
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const fresh = await fetch(req);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match("./index.html", { ignoreSearch: true });
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // それ以外の資産は自キャッシュ優先。なければ取得して自キャッシュに保存する
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const fresh = await fetch(req);
    if (fresh && (fresh.status === 200 || fresh.type === "opaque")) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  })());
});
