const CACHE="mpsc-smart-study-v5-56-20261120";;;
const ASSETS=["./","./index.html","./explanations/history.json","./explanations/polity.json","./explanations/general-studies.json","./explanations/gst.json","./explanations/current-affairs.json","./explanations/english.json","./explanations/arithmetic.json","./explanations/meghalaya-gk.json","./manifest.json","./pyq-papers/index.json","./pyq-papers/labour-inspector-2021-series-i-partial.json","./pyq-papers/labour-inspector-2021-series-i.json","./pyq-papers/ty-hod-2023-series-i.json","./question-batches/2026-10-11.json","./question-batches/2026-10-12.json","./question-batches/2026-10-30.json","./question-batches/2026-10-30-major.json","./question-batches/2026-10-31.json","./current-affairs/2026-10-31.json","./current-affairs/2026-11-01.json","./question-batches/2026-11-01.json","./question-batches/2026-11-01-lda-pyq.json","./question-batches/2026-11-02-lda-pyq.json","./question-batches/2026-11-02.json","./question-batches/2026-11-03-polity.json","./question-batches/2026-11-03-gktoday-gs.json","./question-batches/2026-11-04-current-affairs.json","./question-batches/2026-11-14-subject-expansion.json","./question-batches/2026-11-15-inspector-tax-technical.json","./question-batches/2026-11-16-original-practice.json","./question-batches/2026-11-18-original-practice.json","./current-affairs/2026-11-02.json","./current-affairs/2026-11-03.json","./question-batches/2026-11-19-original-practice.json","./question-batches/2026-11-20-original-practice.json",];
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.allSettled(ASSETS.map(async asset=>{
   try{
    const response=await fetch(asset,{cache:"reload"});
    if(response.ok)await cache.put(asset,response);
   }catch(error){console.warn("Precache skipped:",asset,error)}
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||request.method!=="GET")return;
 const isAppShell=request.mode==="navigate"||url.pathname.endsWith("/index.html")||url.pathname.endsWith("/sw.js");
 const isExplanation=url.pathname.includes("/explanations/");
 if(isAppShell||isExplanation){
  event.respondWith((async()=>{
   try{
    const fresh=await fetch(request,{cache:"no-store"});
    if(fresh.ok){
     const cache=await caches.open(CACHE);
     await cache.put(request,fresh.clone());
    }
    return fresh;
   }catch(error){
    const cached=await caches.match(request)|| (isAppShell?await caches.match("./index.html"):null);
    if(cached)return cached;
    if(isAppShell)return new Response("The study hub is offline. Please reconnect and reload.",{status:503,headers:{"Content-Type":"text/plain;charset=UTF-8"}});
    return new Response("Explanation library unavailable offline.",{status:503});
   }
  })());
  return;
 }
 event.respondWith((async()=>{
  const cached=await caches.match(request);
  const network=fetch(request).then(async response=>{
   if(response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}
   return response;
  });
  if(cached){event.waitUntil(network.catch(()=>{}));return cached}
  try{return await network}catch(error){return new Response("Resource unavailable offline.",{status:503})}
 })());
});
