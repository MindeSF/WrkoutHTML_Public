// Workout Log offline support. VERSION changes automatically with the app code.
const VERSION='v3-a308899990';
const CACHE='workout-log-'+VERSION;
const SHELL=['./','index.html','app.js?v=a308899990','manifest.webmanifest','icon-192.png','icon-512.png','fonts/BebasNeue-Regular.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function tellUpdated(){await new Promise(r=>setTimeout(r,1500));(await self.clients.matchAll({type:'window',includeUncontrolled:true})).forEach(c=>c.postMessage('workout-log-updated'))}
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  // Open instantly from the phone (no waiting for a signal); fetch the latest in the background,
  // and if the app itself changed, tell the open page so it can offer a reload.
  const nav=req.mode==='navigate',key=nav?'index.html':req,opts=nav?{ignoreSearch:true}:undefined;
  const work=caches.open(CACHE).then(async c=>{
    const hit=await c.match(key,opts);
    const net=fetch(nav?new Request(req.url,{cache:'no-store',credentials:'same-origin'}):req).then(async r=>{
      if(!r||!r.ok)return r;
      const fresh=r.clone(),old=nav?await c.match(key,opts):null;
      if(old){const[a,b]=await Promise.all([old.text(),r.clone().text()]);if(a!==b){await c.put(key,fresh);await tellUpdated();return r}}
      await c.put(key,fresh);return r;
    }).catch(()=>null);
    return{hit,net};
  });
  e.respondWith(work.then(({hit,net})=>hit||net.then(r=>r||new Response('Offline',{status:503}))));
  e.waitUntil(work.then(({net})=>net));
});
// tapping a "Rest over" alert brings the app back
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.length?cs[0].focus():self.clients.openWindow('./')))});
