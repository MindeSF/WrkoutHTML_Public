// Workout Log offline support. Bump VERSION whenever any file changes.
const VERSION='v2';
const CACHE='workout-log-'+VERSION, FONTS='workout-log-fonts';
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==FONTS).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function tellUpdated(){await new Promise(r=>setTimeout(r,1500));(await self.clients.matchAll({type:'window',includeUncontrolled:true})).forEach(c=>c.postMessage('workout-log-updated'))}
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // Open instantly from the phone (no waiting for a signal); fetch the latest in the background,
    // and if the app itself changed, tell the open page so it can offer a reload.
    const key=req.mode==='navigate'?'index.html':req;
    const work=caches.open(CACHE).then(async c=>{
      const hit=await c.match(key,{ignoreSearch:true});
      const net=fetch(req.mode==='navigate'?new Request(req.url,{cache:'no-store',credentials:'same-origin'}):req).then(async r=>{
        if(!r||!r.ok)return r;
        const fresh=r.clone();
        const old=req.mode==='navigate'?await c.match(key,{ignoreSearch:true}):null;
        if(old){const[a,b]=await Promise.all([old.text(),r.clone().text()]);if(a!==b){await c.put(key,fresh);await tellUpdated();return r}}
        await c.put(key,fresh);return r;
      }).catch(()=>null);
      return{hit,net};
    });
    e.respondWith(work.then(({hit,net})=>hit||net.then(r=>r||new Response('Offline',{status:503}))));
    e.waitUntil(work.then(({net})=>net));
  }else if(/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.open(FONTS).then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone());return r}).catch(()=>new Response('',{status:503})))));
  }
});
