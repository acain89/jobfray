// Prepared scheduler client. Execute only after explicit environment authorization.
const origin=new URL(process.env.JOBFRAY_PUBLIC_ORIGIN??"");
if(origin.protocol!=="https:"||origin.origin!==process.env.JOBFRAY_PUBLIC_ORIGIN||origin.hostname!==process.env.JOBFRAY_BASE_HOST||!process.env.JOBFRAY_WORKER_KEY||process.env.JOBFRAY_WORKER_KEY.length<32)throw new Error("Invalid worker configuration");
if(process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED!=="1")throw new Error("Worker provider operations are disabled");
const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),600000);
try{const response=await fetch(new URL("/api/worker",origin),{method:"POST",headers:{Authorization:"Bearer "+process.env.JOBFRAY_WORKER_KEY},redirect:"error",signal:controller.signal});console.log(JSON.stringify({event:"jobfray.worker_result",status:response.status,durationMs:Date.now()-start}));if(!response.ok)process.exitCode=1;}catch{console.error(JSON.stringify({event:"jobfray.worker_transport_failed"}));process.exitCode=1;}finally{clearTimeout(timer);}
