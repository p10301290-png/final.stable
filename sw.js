/* Self-destruct service worker: removes old caches and unregisters itself so the latest index.html always loads. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil((async()=>{try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)))}catch(x){}try{await self.registration.unregister()}catch(x){}try{const cs=await self.clients.matchAll({type:'window'});cs.forEach(c=>c.navigate(c.url))}catch(x){}})())});
