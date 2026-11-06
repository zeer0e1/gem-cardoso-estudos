const PREFIX='gem-instructors-'+new URL(self.registration.scope).pathname;
const CACHE=PREFIX+'-v3.0';
const ASSETS=['./','./index.html','./style.css','./teacher.css','./admin.css','./login.css','./admin.js','./login-identity.js','./new-instructor.js','./reset-password.js','./instructor-management.js','./instructor-app.js','./data.js','./domain.js','./edit-study.js','./config.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request).catch(()=>event.request.mode==='navigate'?cache.match('./index.html'):Response.error())))});
