/* No customer names, addresses, or confirmation capabilities are cached. */
self.addEventListener("push",event=>{event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 if(!/^[a-f0-9]{64}$/.test(data.deliveryKey))return;
 const cache=await caches.open("jf-push-dedup-v1"),key=new Request(self.location.origin+"/__jf_push__/"+data.deliveryKey);
 if(await cache.match(key))return;await cache.put(key,new Response("1"));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-100)))await cache.delete(old);
 await self.registration.showNotification("New JobFray request",{body:"Open your dashboard for details.",tag:data.deliveryKey,data:{url:"/dashboard"}});
})());});
self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil(clients.openWindow("/dashboard"));});
