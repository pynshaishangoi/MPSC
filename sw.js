const CACHE="mpsc-smart-study-v5-20-20261031";
const ASSETS=["./","./index.html","./manifest.json","./question-batches/2026-10-11.json","./question-batches/2026-10-12.json","./question-batches/2026-10-30.json","./question-batches/2026-10-30-major.json","./question-batches/2026-10-31.json","./current-affairs/2026-10-31.json"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>cached))) });
