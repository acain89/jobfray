'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Direct infrastructure API orchestration. */
const fs=require('node:fs'),path=require('node:path');
const SERVICE='srv-d851un6q1p3s73ebcqm0',BASE='/services/'+SERVICE,ZONE='jobfray.com',SCRIPT='jobfray-trusted-ingress';
const DIR=path.resolve('artifacts/jobfray-infrastructure');
const GATES=['JOBFRAY_DATABASE_ENABLED','JOBFRAY_RELEASE_DB_VERIFIED','JOBFRAY_PRODUCTION_PROVIDERS','JOBFRAY_PROVIDER_OPERATIONS_ENABLED','JOBFRAY_RELEASE_PROVIDERS_VERIFIED','JOBFRAY_CHECKOUT_ENABLED','JOBFRAY_PUBLIC_INDEXING_ENABLED','JOBFRAY_SANDBOX','JOBFRAY_LOCAL_TEST'];
function check(ok,code){if(!ok)throw Error(code);}
function save(name,value){fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(path.join(DIR,name),JSON.stringify(value,null,2));}
async function api(state,provider,route,method='GET',body){
 check(provider==='cf'||provider==='render','PROVIDER_FORBIDDEN');
 if(provider==='render')check(route===BASE||route.startsWith(BASE+'/')||method==='GET'&&route.startsWith('/owners/'),'RENDER_RESOURCE_FORBIDDEN');
 if(method!=='GET'){check(state.writesAuthorized===true,'WRITE_NOT_PREPARED');if(provider==='render')check(method==='POST'&&(route===BASE+'/custom-domains'||route===BASE+'/suspend'||[ZONE,'www.'+ZONE].some(name=>route===BASE+'/custom-domains/'+encodeURIComponent(name)+'/verify')||(state.domainsAfter||[]).some(x=>route===BASE+'/custom-domains/'+encodeURIComponent((x.customDomain||x).id)+'/verify'))||method==='PATCH'&&route===BASE&&Object.keys(body||{}).length===1&&Object.keys(body.serviceDetails||{}).length===1&&body.serviceDetails.renderSubdomainPolicy==='disabled','RENDER_MUTATION_NOT_AUTHORIZED');}
 if(provider==='cf'&&method!=='GET')check(state.zone&&state.account&&(route.startsWith('/zones/'+state.zone+'/')||route.startsWith('/accounts/'+state.account+'/workers/scripts/'+SCRIPT)),'CLOUDFLARE_RESOURCE_FORBIDDEN');
 const multipart=body instanceof FormData;
 const response=await fetch((provider==='cf'?'https://api.cloudflare.com/client/v4':'https://api.render.com/v1')+route,{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+(provider==='cf'?state.credentials.cf:state.credentials.render),Accept:'application/json',...(body&&!multipart?{'Content-Type':'application/json'}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{data=null;}
 if(!response.ok||provider==='cf'&&data?.success===false){const codes=provider==='cf'?data?.errors?.map(x=>x.code).join(','):'';throw Error(provider.toUpperCase()+'_'+method+'_HTTP_'+response.status+(codes?'_CODES_'+codes:''));}
 return provider==='cf'?data.result:data;
}
async function cfPages(state,route){const all=[];for(let page=1;page<=100;page++){const batch=await api(state,'cf',route+(route.includes('?')?'&':'?')+'per_page=100&page='+page);check(Array.isArray(batch),'CF_PAGINATION_SHAPE');all.push(...batch);if(batch.length<100)return all;}throw Error('CF_PAGINATION_LIMIT');}
async function renderPages(state,route){let cursor='';const all=[];for(let page=0;page<100;page++){const batch=await api(state,'render',route+'?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));check(Array.isArray(batch),'RENDER_PAGINATION_SHAPE');all.push(...batch);if(batch.length<100)return all;const next=batch.at(-1)?.cursor;check(next&&next!==cursor,'RENDER_PAGINATION_CURSOR');cursor=next;}throw Error('RENDER_PAGINATION_LIMIT');}
async function inspect(state){
 const zones=await api(state,'cf','/zones?name='+ZONE+'&status=active');check(zones.length===1&&zones[0].name===ZONE&&zones[0].status==='active','ACTIVE_ZONE_IDENTITY_MISMATCH');const zone=zones[0];state.zone=zone.id;state.account=zone.account.id;
 const service=await api(state,'render',BASE);check(service.id===SERVICE&&service.name==='jobfray'&&service.repo==='https://github.com/acain89/jobfray'&&service.type==='web_service','RENDER_SERVICE_IDENTITY_MISMATCH');state.service=service;
 state.envBefore=new Map((await renderPages(state,BASE+'/env-vars')).map(x=>[x.envVar.key,x.envVar.value]));check(GATES.every(k=>state.envBefore.get(k)==='0'),'ALL_NINE_GATES_MUST_ALREADY_BE_DISABLED');check((state.envBefore.get('JOBFRAY_EDGE_SECRET')||'').length>=32,'EDGE_SECRET_MISSING');
 state.deploysBefore=(await renderPages(state,BASE+'/deploys')).map(x=>x.deploy.id).sort();
 state.dnsBefore=await cfPages(state,'/zones/'+state.zone+'/dns_records');state.routesBefore=await api(state,'cf','/zones/'+state.zone+'/workers/routes');
 state.customBefore=await renderPages(state,BASE+'/custom-domains');
 const settings={};for(const key of ['ssl','always_use_https','min_tls_version','automatic_https_rewrites'])try{settings[key]=await api(state,'cf','/zones/'+state.zone+'/settings/'+key);}catch(e){settings[key]={unavailable:e.message};}
 const workers=await api(state,'cf','/accounts/'+state.account+'/workers/scripts');state.existingWorker=workers.find(x=>x.id===SCRIPT)||null;
 save('dns-recovery-before.json',{capturedAt:new Date().toISOString(),zone:{id:zone.id,name:zone.name,account:zone.account},records:state.dnsBefore});save('routes-recovery-before.json',state.routesBefore);save('render-before.json',{serviceId:SERVICE,repo:service.repo,deployIds:state.deploysBefore,customDomains:state.customBefore,renderSubdomainPolicy:service.serviceDetails?.renderSubdomainPolicy});
 const report={stage:'read_only_inspection_complete',zone:{id:zone.id,name:zone.name,status:zone.status,account:zone.account,plan:zone.plan,nameServers:zone.name_servers},service:{id:service.id,name:service.name,repo:service.repo,branch:service.branch,ownerId:service.ownerId,url:service.serviceDetails?.url,renderSubdomainPolicy:service.serviceDetails?.renderSubdomainPolicy,autoDeploy:service.autoDeploy,autoDeployTrigger:service.autoDeployTrigger},dns:state.dnsBefore.map(({id,type,name,content,proxied,ttl,data})=>({id,type,name,content,proxied,ttl,data})),routes:state.routesBefore,customDomains:state.customBefore,settings,existingDedicatedWorker:state.existingWorker,edgeSecretPresent:true,nineGatesDisabled:true,environmentKeys:[...state.envBefore.keys()].sort(),deployCount:state.deploysBefore.length};state.inspectReport=report;save('inspection.json',report);return report;
}
module.exports={run:async(action,state)=>{if(action==='inspect')return inspect(state);if(action==='stage')return stage(state);if(action==='domains')return domains(state);if(action==='dns')return dns(state);if(action==='verify')return verify(state);if(action==='finishDomains')return finishDomains(state);if(action==='capabilities')return capabilities(state);if(action==='auditSecrets')return auditSecrets(state);if(action==='finalReadback')return finalReadback(state);if(action==='certificateReadiness')return certificateReadiness(state);if(action==='domainStatus')return domainStatus(state);if(action==='isolateOldOrigin')return isolateOldOrigin(state);if(action==='verifyDNSOnly')return verifyDNSOnly(state);if(action==='restoreProxy')return restoreProxy(state);if(action==='serviceDetails')return {plan:state.service.serviceDetails?.plan,maintenanceMode:state.service.serviceDetails?.maintenanceMode,healthCheckPath:state.service.serviceDetails?.healthCheckPath,detailsFields:Object.keys(state.service.serviceDetails||{})};throw Error('UNKNOWN_ACTION');},api,save,check,cfPages,renderPages,SERVICE,BASE,ZONE,SCRIPT,DIR,GATES};
async function stage(state){
 check(state.inspectReport&&state.existingWorker===null,'READ_ONLY_INSPECTION_OR_WORKER_CONFLICT');state.writesAuthorized=true;
 const code=fs.readFileSync('workers/jobfray-ingress.mjs','utf8');const form=new FormData();form.set('metadata',new Blob([JSON.stringify({main_module:'jobfray-ingress.mjs',compatibility_date:'2026-11-24',bindings:[{type:'plain_text',name:'ROUTING_MODE',text:'maintenance'},{type:'secret_text',name:'JOBFRAY_EDGE_SECRET',text:state.envBefore.get('JOBFRAY_EDGE_SECRET')}],observability:{enabled:false}})],{type:'application/json'}));form.set('jobfray-ingress.mjs',new Blob([code],{type:'application/javascript+module'}),'jobfray-ingress.mjs');
 const uploaded=await api(state,'cf','/accounts/'+state.account+'/workers/scripts/'+SCRIPT,'PUT',form);state.workerCreated=true;
 const subdomain=await api(state,'cf','/accounts/'+state.account+'/workers/scripts/'+SCRIPT+'/subdomain','POST',{enabled:false,previews_enabled:false});
 const routes=[];for(const pattern of [ZONE+'/*','*.'+ZONE+'/*']){const conflict=state.routesBefore.find(r=>r.pattern===pattern);check(!conflict,'EXISTING_ROUTE_CONFLICT');routes.push(await api(state,'cf','/zones/'+state.zone+'/workers/routes','POST',{pattern,script:SCRIPT,request_limit_fail_open:false}));}
 const readRoutes=await api(state,'cf','/zones/'+state.zone+'/workers/routes');check(routes.every(r=>readRoutes.some(x=>x.id===r.id&&x.script===SCRIPT&&x.request_limit_fail_open===false)),'ROUTE_FAIL_CLOSED_READBACK_REQUIRED');
 const secrets=await api(state,'cf','/accounts/'+state.account+'/workers/scripts/'+SCRIPT+'/secrets');check(secrets.some(x=>x.name==='JOBFRAY_EDGE_SECRET'&&x.type==='secret_text'),'SECRET_BINDING_NOT_CONFIRMED');
 const report={stage:'worker_maintenance_configured',worker:SCRIPT,workerId:uploaded.id,subdomain,routes:readRoutes,secretBindingConfigured:true,secretSource:'Existing JobFray Render environment, transferred in memory only',sourceSHA256:require('node:crypto').createHash('sha256').update(code).digest('hex'),liveForwardingEnabled:false};state.stageReport=report;save('worker-stage.json',report);return report;
}
async function domains(state){
 check(state.workerCreated,'MAINTENANCE_WORKER_REQUIRED');const found=(await renderPages(state,BASE+'/custom-domains')).map(x=>x.customDomain||x);
 const added=[];for(const name of [ZONE,'*.'+ZONE])if(!found.some(x=>x.name===name)){const result=await api(state,'render',BASE+'/custom-domains','POST',{name});added.push(...(Array.isArray(result)?result:[result]));}
 const after=await renderPages(state,BASE+'/custom-domains');state.domainsAfter=after;save('render-custom-domains.json',after);return{stage:'custom_domains_registered',added,domains:after};
}
async function dns(state){
 check(state.domainsAfter&&state.stageReport,'CUSTOM_DOMAINS_AND_MAINTENANCE_REQUIRED');
 const response=await fetch('https://jobfray.com/',{redirect:'manual',signal:AbortSignal.timeout(30000)});check(response.status===503&&response.headers.get('x-jobfray-stage')==='maintenance','LIVE_MAINTENANCE_NOT_VERIFIED_DNS_CHANGE_BLOCKED');
 const current=await cfPages(state,'/zones/'+state.zone+'/dns_records');check(current.length===state.dnsBefore.length&&state.dnsBefore.every(x=>current.some(y=>x.id===y.id&&x.content===y.content&&x.proxied===y.proxied)),'DNS_CHANGED_SINCE_SNAPSHOT');
 const origin=new URL(state.service.serviceDetails.url).hostname;check(origin==='jobfray.onrender.com','ORIGIN_HOST_MISMATCH');
 const webNames=[ZONE,'www.'+ZONE,'*.'+ZONE];const replace=current.filter(x=>webNames.includes(x.name)&&['A','AAAA','CNAME'].includes(x.type));
 const posts=webNames.map(name=>({type:'CNAME',name,content:origin,proxied:true,ttl:1,comment:'JobFray staged routing; maintenance Worker blocks origin until reviewed rebuild cutover'}));
 for(const [name,content]of[['_acme-challenge.'+ZONE,'jobfray.verify.renderdns.com'],['_cf-custom-hostname.'+ZONE,'jobfray.hostname.renderdns.com']]){check(!current.some(x=>x.name===name),'CERTIFICATE_DNS_RECORD_CONFLICT');posts.push({type:'CNAME',name,content,proxied:false,ttl:1,comment:'JobFray Render wildcard certificate validation'});}
 const result=await api(state,'cf','/zones/'+state.zone+'/dns_records/batch','POST',{deletes:replace.map(x=>({id:x.id})),posts});
 for(const [setting,value]of[['ssl','strict'],['min_tls_version','1.2']])await api(state,'cf','/zones/'+state.zone+'/settings/'+setting,'PATCH',{value});
 state.dnsChanged=true;save('dns-batch-result.json',result);return{stage:'dns_staged_for_render',replacedRecordIds:replace.map(x=>x.id),webRecords:posts,ssl:'strict',minimumTLS:'1.2',maintenanceRemainsEnabled:true};
}
async function verify(state){
 const records=await cfPages(state,'/zones/'+state.zone+'/dns_records');const webNames=[ZONE,'www.'+ZONE,'*.'+ZONE,'_acme-challenge.'+ZONE,'_cf-custom-hostname.'+ZONE];
 const preserved=state.dnsBefore.filter(x=>!([ZONE,'www.'+ZONE,'*.'+ZONE].includes(x.name)&&['A','AAAA','CNAME'].includes(x.type)));
 check(preserved.every(x=>records.some(y=>x.id===y.id&&x.type===y.type&&x.name===y.name&&x.content===y.content&&x.proxied===y.proxied&&x.ttl===y.ttl)),'PRESERVED_DNS_MISMATCH');
 const resendNames=['rsend.mail.'+ZONE,'send.mail.'+ZONE,'resend._domainkey.mail.'+ZONE];check(resendNames.every(name=>records.some(x=>x.name===name&&x.proxied===false)),'RESEND_DNS_ONLY_MISMATCH');
 const environment=new Map((await renderPages(state,BASE+'/env-vars')).map(x=>[x.envVar.key,x.envVar.value]));check(environment.size===state.envBefore.size&&[...state.envBefore].every(([k,v])=>environment.get(k)===v),'RENDER_ENVIRONMENT_CHANGED');
 const deploys=(await renderPages(state,BASE+'/deploys')).map(x=>x.deploy.id).sort();check(JSON.stringify(deploys)===JSON.stringify(state.deploysBefore),'DEPLOYMENT_IDS_CHANGED');
 const domains=await renderPages(state,BASE+'/custom-domains');const report={stage:'api_readback_complete',dns:records.filter(x=>webNames.includes(x.name)),preservedRecordCount:preserved.length,resendRecordsPreserved:true,resendDNSOnly:true,allEnvironmentVariablesPreserved:true,nineReleaseGatesDisabled:GATES.every(k=>environment.get(k)==='0'),deploymentIdsUnchanged:true,customDomains:domains,workerRoutes:await api(state,'cf','/zones/'+state.zone+'/workers/routes'),workerSettings:await api(state,'cf','/accounts/'+state.account+'/workers/scripts/'+SCRIPT+'/settings'),trustedIngressDeployedVerified:false};
 if(report.workerSettings?.bindings)report.workerSettings.bindings=report.workerSettings.bindings.map(x=>({name:x.name,type:x.type,...(x.type==='plain_text'?{text:x.text}:{})}));
 save('api-readback.json',report);state.verifyReport=report;return report;
}
async function finishDomains(state){
 check(state.dnsChanged,'DNS_CONFIGURATION_REQUIRED');
 const current=(await renderPages(state,BASE+'/custom-domains')).map(x=>x.customDomain||x);const triggered=[];
 for(const domain of current){check([ZONE,'www.'+ZONE,'*.'+ZONE].includes(domain.name),'UNEXPECTED_SERVICE_DOMAIN');if(domain.verificationStatus!=='verified'){await api(state,'render',BASE+'/custom-domains/'+encodeURIComponent(domain.id)+'/verify','POST');triggered.push(domain.name);}}
 const policy=await api(state,'render',BASE,'PATCH',{serviceDetails:{renderSubdomainPolicy:'disabled'}});
 state.defaultOriginDisabled=policy.serviceDetails?.renderSubdomainPolicy==='disabled';
 const report={stage:'certificate_verification_requested',triggered,defaultRenderSubdomainPolicy:policy.serviceDetails?.renderSubdomainPolicy,customDomains:await renderPages(state,BASE+'/custom-domains')};save('render-domain-verification.json',report);return report;
}
async function capabilities(state){
 const report={cloudflareZonePlan:state.inspectReport.zone.plan.name,noPlanUpgradeRequested:true,renderInboundIPRulesRequirement:'Scale or Enterprise workspace; no upgrade or unrelated resources modified'};
 try{const owner=await api(state,'render','/owners/'+state.service.ownerId);report.renderWorkspace={id:owner.id,name:owner.name,plan:owner.plan||owner.tier||owner.billingPlan||null,metadataFields:Object.keys(owner).filter(x=>/plan|billing|tier|domain/i.test(x))};}catch(e){report.renderWorkspaceReadError=e.message;}
 try{const subscriptions=await api(state,'cf','/accounts/'+state.account+'/subscriptions');report.cloudflareSubscriptionPlans=subscriptions.map(x=>({id:x.rate_plan?.id,name:x.rate_plan?.public_name||x.rate_plan?.name,price:x.price,currency:x.currency}));}catch(e){report.cloudflareBillingReadError=e.message;}
 report.renderDomainPricePerExcessMonthUSD=0.25;report.newRenderDomainEntries=3;report.maximumAdditionalDomainMonthUSD=0.75;report.actualIncrementalDomainInvoice='Depends on existing workspace-wide allowance; invoice not asserted';save('capabilities-costs.json',report);state.costReport=report;return report;
}
async function isolateOldOrigin(state){
 check(state.dnsChanged&&state.defaultOriginDisabled&&state.stageReport,'STAGED_INFRASTRUCTURE_REQUIRED');
 const before=await api(state,'render',BASE);check(before.id===SERVICE&&before.name==='jobfray'&&before.serviceDetails.plan==='free','EXPECTED_FREE_JOBFRAY_SERVICE_REQUIRED');
 save('origin-isolation-before.json',{serviceId:SERVICE,suspended:before.suspended,suspenders:before.suspenders,maintenanceMode:before.serviceDetails.maintenanceMode,renderSubdomainPolicy:before.serviceDetails.renderSubdomainPolicy});
 if(before.suspended!=='suspended')await api(state,'render',BASE+'/suspend','POST');
 const after=await api(state,'render',BASE);check(after.suspended==='suspended','OLD_ORIGIN_SUSPENSION_NOT_CONFIRMED');state.originIsolated=true;
 const report={stage:'obsolete_origin_isolated',serviceId:SERVICE,suspended:after.suspended,reason:'Safe DNS-only certificate verification without serving obsolete application; free Render compute has no maintenance mode',restorePolicy:'Resume only with the separately authorized rebuilt application deployment; do not resume obsolete build'};save('origin-isolation.json',report);return report;
}
async function verifyDNSOnly(state){
 check(state.originIsolated,'OLD_ORIGIN_MUST_BE_SUSPENDED');check((await api(state,'render',BASE)).suspended==='suspended','ORIGIN_ISOLATION_LOST');
 const records=await cfPages(state,'/zones/'+state.zone+'/dns_records');const targets=records.filter(x=>[ZONE,'www.'+ZONE].includes(x.name)&&x.type==='CNAME');check(targets.length===2,'APEX_WWW_CNAME_REQUIRED');
 state.temporarilyDNSOnly=targets.map(x=>x.id);save('temporary-dns-verification-state.json',{records:state.temporarilyDNSOnly,restoreProxied:true,originSuspended:true});
 try{
  for(const record of targets)await api(state,'cf','/zones/'+state.zone+'/dns_records/'+record.id,'PATCH',{proxied:false});
  const results=[];for(const name of [ZONE,'www.'+ZONE]){await api(state,'render',BASE+'/custom-domains/'+encodeURIComponent(name)+'/verify','POST');results.push({name,verificationRequested:true});}
  return {stage:'safe_dns_only_verification_requested',originSuspended:true,results,proxyRestorationPending:true};
 }catch(error){for(const id of state.temporarilyDNSOnly)await api(state,'cf','/zones/'+state.zone+'/dns_records/'+id,'PATCH',{proxied:true});state.temporarilyDNSOnly=[];throw error;}
}
async function restoreProxy(state){
 check(state.originIsolated,'ISOLATED_ORIGIN_REQUIRED');await certificateReadiness(state);const restored=[];for(const id of state.temporarilyDNSOnly||[]){await api(state,'cf','/zones/'+state.zone+'/dns_records/'+id,'PATCH',{proxied:true});restored.push(id);}state.temporarilyDNSOnly=[];
 const report={stage:'cloudflare_proxy_restored',recordIds:restored,domains:await renderPages(state,BASE+'/custom-domains'),originRemainsSuspended:true};save('proxy-restoration.json',report);return report;
}
async function domainStatus(state){const service=await api(state,'render',BASE);const records=await cfPages(state,'/zones/'+state.zone+'/dns_records');return{domains:(await renderPages(state,BASE+'/custom-domains')).map(x=>({name:x.customDomain.name,status:x.customDomain.verificationStatus})),serviceSuspended:service.suspended,defaultDomainPolicy:service.serviceDetails.renderSubdomainPolicy,apexAndWWWProxy:records.filter(x=>[ZONE,'www.'+ZONE].includes(x.name)&&x.type==='CNAME').map(x=>({name:x.name,proxied:x.proxied})),canonicalOriginMatches:state.envBefore.get('JOBFRAY_PUBLIC_ORIGIN')==='https://jobfray.com',baseHostMatches:state.envBefore.get('JOBFRAY_BASE_HOST')==='jobfray.com'};}
async function certificateReadiness(state){
 const domains=(await renderPages(state,BASE+'/custom-domains')).map(x=>x.customDomain||x);check([ZONE,'www.'+ZONE,'*.'+ZONE].every(name=>domains.some(d=>d.name===name&&d.verificationStatus==='verified')),'ALL_RENDER_DOMAINS_MUST_BE_VERIFIED_BEFORE_PROXY_RESTORE');
 const tls=require('node:tls');const certificates=[];for(const host of [ZONE,'www.'+ZONE]){
  const certificate=await new Promise((resolve,reject)=>{const socket=tls.connect({host,servername:host,port:443,rejectUnauthorized:true,timeout:15000},()=>{const cert=socket.getPeerCertificate();resolve({hostname:host,authorized:socket.authorized,subjectAltNames:cert.subjectaltname,issuer:cert.issuer?.O,validTo:cert.valid_to});socket.end();});socket.on('error',()=>reject(Error('VALID_RENDER_CERTIFICATE_REQUIRED_'+host)));socket.on('timeout',()=>socket.destroy(Error('TLS_TIMEOUT')));});check(certificate.authorized,'RENDER_CERTIFICATE_NOT_AUTHORIZED');certificates.push(certificate);
 }
 const report={stage:'certificates_ready_for_proxy_restoration',domains:domains.map(d=>({name:d.name,status:d.verificationStatus})),certificates,originSuspended:(await api(state,'render',BASE)).suspended==='suspended'};check(report.originSuspended,'ORIGIN_MUST_REMAIN_SUSPENDED');save('certificate-readiness-before-proxy.json',report);return report;
}
async function finalReadback(state){
 const result=await verify(state);const service=await api(state,'render',BASE);check(service.suspended==='suspended'&&service.serviceDetails.renderSubdomainPolicy==='disabled','STAGED_ORIGIN_ISOLATION_REQUIRED');
 result.service={id:service.id,name:service.name,repo:service.repo,suspended:service.suspended,renderSubdomainPolicy:service.serviceDetails.renderSubdomainPolicy,autoDeployTrigger:service.autoDeployTrigger,computePlan:service.serviceDetails.plan,healthCheckPath:service.serviceDetails.healthCheckPath};
 result.sslSettings={ssl:await api(state,'cf','/zones/'+state.zone+'/settings/ssl'),minTLS:await api(state,'cf','/zones/'+state.zone+'/settings/min_tls_version')};check(result.sslSettings.ssl.value==='strict'&&result.sslSettings.minTLS.value==='1.2','TLS_SETTINGS_READBACK_MISMATCH');
 result.workerPublicSubdomain=await api(state,'cf','/accounts/'+state.account+'/workers/scripts/'+SCRIPT+'/subdomain');check(result.workerPublicSubdomain.enabled===false&&result.workerPublicSubdomain.previews_enabled===false,'WORKERS_DEV_MUST_REMAIN_DISABLED');
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+state.account+'/workers/scripts/'+SCRIPT,{headers:{Authorization:'Bearer '+state.credentials.cf},redirect:'error',signal:AbortSignal.timeout(30000)});check(response.ok,'WORKER_SOURCE_READBACK_HTTP_FAILED');const body=await response.text();const source=fs.readFileSync('workers/jobfray-ingress.mjs','utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');result.workerSourceReadbackMatches=body.replace(/\r\n/g,'\n').includes(source);check(result.workerSourceReadbackMatches,'WORKER_SOURCE_READBACK_MISMATCH');
 check(result.customDomains.every(x=>x.customDomain.verificationStatus==='verified'),'DOMAIN_VERIFICATION_NOT_COMPLETE');check(result.dns.filter(x=>['jobfray.com','www.jobfray.com','*.jobfray.com'].includes(x.name)&&x.type==='CNAME').every(x=>x.proxied===true),'WEB_PROXY_RESTORATION_NOT_COMPLETE');
 result.trustedIngressDeployedVerified=false;result.completionState='infrastructure_staged_rebuilt_application_not_deployed';save('final-api-readback.json',result);return{completionState:result.completionState,allDomainsVerified:true,allWebRecordsProxied:true,allEmailRecordsPreserved:result.resendRecordsPreserved,sourceReadbackMatches:result.workerSourceReadbackMatches,originSuspended:true,defaultRenderHostnameDisabled:true,allEnvironmentVariablesPreserved:result.allEnvironmentVariablesPreserved,nineReleaseGatesDisabled:result.nineReleaseGatesDisabled,deployIdsUnchanged:result.deploymentIdsUnchanged,ssl:'strict',minimumTLS:'1.2',trustedIngressDeployedVerified:false};
}
async function auditSecrets(state){
 const files=[];const roots=['scripts/infrastructure','workers','lib/core/ingress.ts','proxy.ts','tests/ingress.test.ts','docs/CLOUDFLARE_RENDER_INFRASTRUCTURE.md','artifacts/jobfray-infrastructure'];
 const visit=file=>{if(fs.statSync(file).isDirectory())for(const name of fs.readdirSync(file))visit(path.join(file,name));else files.push(file);};for(const root of roots)visit(root);
 const secrets=[state.credentials.cf,state.credentials.render,...[...state.envBefore].filter(([name,value])=>/SECRET|PRIVATE|API_KEY|DATABASE_URL|PASSWORD|AUTH_TOKEN/.test(name)&&value.length>=20).map(([,value])=>value)];
 const hits=files.filter(file=>{const content=fs.readFileSync(file,'utf8');return secrets.some(value=>content.includes(value));});check(hits.length===0,'CREDENTIAL_VALUE_FOUND_IN_FILES');const report={checkedFiles:files.length,noCredentialValuesWritten:true,secretValuesPrinted:false};save('credential-scan.json',report);return report;
}
