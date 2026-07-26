const OLD=['petricoach-nrw-v3-1','petricoach-nrw-v3-2-1','petricoach-root-redirect-v6'];
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(Promise.all(OLD.map(name=>caches.delete(name))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;if(event.request.mode==='navigate')event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>Response.redirect('/v7/',302)));});
