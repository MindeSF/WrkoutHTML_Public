// Workout Log offline support. Bump VERSION when you upload a new index.html.
const VERSION='v1';
const CACHE='workout-log-'+VERSION, FONTS='workout-log-fonts';
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==FONTS).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // Open instantly from the phone (no waiting for a signal), and quietly pick up any update for next time.
    const key=req.mode==='navigate'?'index.html':req;
    const net=caches.open(CACHE).then(c=>fetch(req).then(r=>{if(r&&r.ok)c.put(key,r.clone());return r})).catch(()=>null);
    e.waitUntil(net.then(()=>{}));
    e.respondWith(caches.open(CACHE).then(c=>c.match(key,{ignoreSearch:true})).then(hit=>hit||net.then(r=>r||new Response('Offline',{status:503}))));
  }else if(/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.open(FONTS).then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone());return r}).catch(()=>new Response('',{status:503})))));
  }
});
