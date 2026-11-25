'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone owner-run CommonJS harness. */
/* global OWNER_CONTRACT_HASHES */
// Owner-run only. Importing this module never connects to Stripe.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createRequire}=require('node:module');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const ROOT='C:/Users/acain/.codex/worktrees/jobfray-rebuild';
const ORIGIN='https://jobfray-stripe-sandbox.invalid';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function failure(code){const e=new Error(code);e.safeCode=code;throw e;}
function check(value,code){if(!value)failure(code);}
const safeEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(k.toUpperCase())));
function selectCliAssets(release,architecture){
    check(architecture==='x64'||architecture==='ia32','STRIPE_CLI_WINDOWS_ARCHITECTURE_UNSUPPORTED');
    const platform=architecture==='x64'?'x86_64':'i386';
    const archive=release.assets.find(a=>a.name.endsWith('_windows_'+platform+'.zip'));
    const sums=release.assets.find(a=>a.name==='stripe-windows-checksums.txt')||release.assets.find(a=>/^stripe_[0-9.]+_checksums\.txt$/.test(a.name));
    check(archive&&sums,'STRIPE_CLI_WINDOWS_ASSET_OR_CHECKSUM_MISSING');
    return {archive,sums};
}
async function ensureCli(){
    // Isolated official release, verified against its published SHA256 manifest.
    // No Stripe credentials are ever sent to GitHub or written to CLI config.
    const get=async url=>{const r=await fetch(url,{headers:{'User-Agent':'JobFray-sandbox-verifier'},signal:AbortSignal.timeout(60000)});check(r.ok,'STRIPE_CLI_DOWNLOAD_UNAVAILABLE');return r;};
    const release=await(await get('https://api.github.com/repos/stripe/stripe-cli/releases/latest')).json();
    check(/^v?[0-9]+\.[0-9]+\.[0-9]+$/.test(release.tag_name),'STRIPE_CLI_RELEASE_INVALID');
    const {archive,sums}=selectCliAssets(release,process.arch);
    for(const a of [archive,sums])check(a&&new URL(a.browser_download_url).hostname==='github.com'&&new URL(a.browser_download_url).pathname.startsWith('/stripe/stripe-cli/releases/download/'),'STRIPE_CLI_ASSET_INVALID');
    const manifest=await(await get(sums.browser_download_url)).text();
    const digest=manifest.split(/\r?\n/).map(s=>s.trim().split(/\s+/)).find(parts=>parts.at(-1)===archive.name)?.[0];
    check(/^[a-f0-9]{64}$/i.test(digest||''),'STRIPE_CLI_CHECKSUM_MISSING');
    const dir=path.join(ROOT,'artifacts','stripe-sandbox-tools',release.tag_name);fs.mkdirSync(dir,{recursive:true});
    const zip=path.join(dir,archive.name),bytes=Buffer.from(await(await get(archive.browser_download_url)).arrayBuffer());
    check(createHash('sha256').update(bytes).digest('hex')===digest.toLowerCase(),'STRIPE_CLI_CHECKSUM_MISMATCH');fs.writeFileSync(zip,bytes);
    const expanded=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command','Expand-Archive -LiteralPath $env:JF_CLI_ZIP -DestinationPath $env:JF_CLI_DIR -Force'],{windowsHide:true,encoding:'utf8',env:{...safeEnv(),JF_CLI_ZIP:zip,JF_CLI_DIR:dir}});
    check(expanded.status===0,'STRIPE_CLI_EXTRACTION_FAILED');
    const exe=path.join(dir,'stripe.exe');check(fs.existsSync(exe),'STRIPE_CLI_EXECUTABLE_MISSING');
    return {exe,version:release.tag_name};
}
function realIO(){
    let browser;
    return {mode:'stripe_sandbox',fetch:(...args)=>fetch(...args),
        async prepare(){
            const req=createRequire(path.join(ROOT,'package.json'));const {chromium}=req('@playwright/test');
            browser=await chromium.launch({channel:'chrome',headless:true});
            return ensureCli();
        },
        async listen({key,version,tool,onEvent}){
            const server=http.createServer(async(req,res)=>{
                try{
                    check(req.method==='POST'&&req.url==='/stripe-webhook','WEBHOOK_ROUTE_INVALID');
                    const parts=[];let size=0;for await(const part of req){size+=part.length;check(size<=1000000,'WEBHOOK_TOO_LARGE');parts.push(part);}
                    await onEvent(Buffer.concat(parts).toString('utf8'),String(req.headers['stripe-signature']||''));res.writeHead(200);res.end('ok');
                }catch{res.writeHead(400);res.end('rejected');}
            });
            let listenerChild;
            try {
            await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
            const config=path.join(ROOT,'artifacts','stripe-sandbox-tools','isolated-config.toml');
            if(!fs.existsSync(config))fs.writeFileSync(config,'# JobFray sandbox harness: credentials supplied only through child environment.\n');
            const help=spawnSync(tool.exe,['listen','--help'],{windowsHide:true,encoding:'utf8',env:{...safeEnv(),STRIPE_NO_AUTO_UPDATE:'1'}});
            check(help.status===0&&help.stdout.includes('--latest'),'STRIPE_CLI_LISTEN_FLAGS_UNSUPPORTED');
            const args=['listen','--config',config,'--events','checkout.session.completed,checkout.session.expired','--latest','--forward-to','http://127.0.0.1:'+server.address().port+'/stripe-webhook'];
            if(help.stdout.includes('--stripe-version'))args.push('--stripe-version',version);
            const child=spawn(tool.exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...safeEnv(),STRIPE_API_KEY:key,STRIPE_NO_AUTO_UPDATE:'1'}});
            listenerChild=child;
            let secret='',buffer='';const capture=chunk=>{buffer=(buffer+chunk.toString()).slice(-16000);const m=buffer.match(/whsec_[A-Za-z0-9]+/);if(m){secret=m[0];buffer='';}};
            child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',()=>{});
            for(let i=0;i<120&&!secret&&child.exitCode===null;i++)await sleep(500);
            if(!secret)failure('STRIPE_CLI_SIGNED_WEBHOOK_LISTENER_UNAVAILABLE');
            return {secret,source:'real Stripe CLI forwarded signatures',close:async()=>{child.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}};
            } catch(error) {listenerChild?.kill();server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));throw error;}
        },
        async pay(url,decline){
            check(new URL(url).hostname==='checkout.stripe.com','CHECKOUT_BROWSER_ORIGIN_INVALID');
            const context=await browser.newContext();
            const networkIssues=[];context.on('requestfailed',r=>{const u=new URL(r.url());networkIssues.push({host:u.hostname,path:u.pathname.replace(/(?:cs_test_|pi_)[A-Za-z0-9_]+/g,'[id]'),failure:r.failure()?.errorText});});
            context.on('response',r=>{if(r.status()>=400){const u=new URL(r.url());networkIssues.push({host:u.hostname,path:u.pathname.replace(/(?:cs_test_|pi_)[A-Za-z0-9_]+/g,'[id]'),status:r.status()});}});
            await context.route('**/*',async route=>{
                const u=new URL(route.request().url());
                if(u.origin===ORIGIN)return route.fulfill({status:200,contentType:'text/html',body:'Sandbox return received. No JobFray production request was sent.'});
                if(u.protocol==='https:'&&['stripe.com','stripe.network','stripecdn.com','stripeassets.com','pay.google.com','applepay.cdn-apple.com','hcaptcha.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return route.continue();
                return route.abort();
            });
            const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(url,{waitUntil:'domcontentloaded'});
            const fill=async(selector,value,required=false)=>{
                for(let attempt=0;attempt<(required?80:2);attempt++){
                    for(const frame of page.frames()){
                        let host;try{host=new URL(frame.url()).hostname;}catch{continue;}
                        if(!(host==='checkout.stripe.com'||host.endsWith('.stripe.com')))continue;
                        const field=frame.locator(selector).first();if(await field.count()&&await field.isVisible()){await field.fill(value);return true;}
                    }await sleep(250);
                }if(required)failure('HOSTED_CHECKOUT_FIELDS_UNAVAILABLE_OR_INTERACTIVE_CHALLENGE');return false;
            };
            try{
                await fill('#email, input[name="email"]','jobfray-sandbox@example.test',true);
                for(const frame of page.frames()){const choice=frame.getByText('Card',{exact:true}).first();if(await choice.count()&&await choice.isVisible()){await choice.click();break;}}
                await fill('#cardNumber, input[name="cardnumber"], input[autocomplete="cc-number"]',decline?'4000000000000002':'4242424242424242',true);
                await fill('#cardExpiry, input[name="exp-date"], input[autocomplete="cc-exp"]','12/34',true);
                await fill('#cardCvc, input[name="cvc"], input[autocomplete="cc-csc"]','123',true);
                await fill('#billingName, input[name="name"], input[autocomplete="cc-name"]','JobFray Sandbox Test');
                await fill('#billingPostalCode, #payment-postalCodeInput, input[name="postal"], input[name="postalCode"], input[autocomplete="postal-code"]','20560',true);
                let submitted=false;for(const frame of page.frames()){const button=frame.locator('button[type="submit"]').last();if(await button.count()&&await button.isVisible()){await button.click();submitted=true;break;}}check(submitted,'HOSTED_CHECKOUT_PAY_BUTTON_UNAVAILABLE');
                if(decline){let declined=false;for(let attempt=0;attempt<120&&!declined;attempt++){for(const frame of page.frames()){const error=frame.getByText(/card.*declined|payment.*declined/i).first();if(await error.count()&&await error.isVisible()){declined=true;break;}}if(!declined)await sleep(250);}check(declined,'HOSTED_DECLINE_NOT_DISPLAYED_OR_INTERACTIVE_CHALLENGE');}
                else await page.waitForURL(u=>u.origin===ORIGIN,{timeout:60000});
            }catch(error){
                const details=[];for(const frame of page.frames()){let host;try{host=new URL(frame.url()).hostname;}catch{continue;}details.push({host,fields:await frame.locator('input,select,button').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,id:n.id,name:n.getAttribute('name'),type:n.getAttribute('type'),text:n.tagName==='BUTTON'?n.textContent?.slice(0,80):undefined}))).catch(()=>[])});}
                fs.writeFileSync(path.join(ROOT,'artifacts','stripe-hosted-field-diagnostics.json'),JSON.stringify({networkIssues,frames:details,text:(await page.locator('body').innerText().catch(()=>'' )).replace(/[0-9]{12,}/g,'[redacted]').slice(0,12000)},null,2));
                await page.screenshot({path:path.join(ROOT,'artifacts','stripe-hosted-failure.png')}).catch(()=>{});
                throw error;
            }finally{await context.close();}
        },
        pause:sleep,close:async()=>{if(browser)await browser.close();}
    };
}
async function runSandbox(input,io=realIO()){
    const report={status:'not_started',evidenceMode:io.mode,checks:[],fees:[],actualSandboxInteroperability:false,renderChanges:0,productionGateChanges:0,productionDatabaseOperations:0,blockers:[],stage:'local_input'};
    let listener,adapter,operations,key='',runId='jf-sbx-'+randomUUID();
    const sessions=new Set(),verifiedPayments=new Map(),refunds=new Map(),completedEvents=new Map();
    try{
        check(typeof input.key==='string','SANDBOX_KEY_MISSING');key=input.key.trim();
        check(/^sk_test_[A-Za-z0-9]+$/.test(key),'ONLY_SK_TEST_CREDENTIALS_ARE_AUTHORIZED');
        check(/^acct_[A-Za-z0-9]+$/.test(input.account),'EXPECTED_JOBFRAY_ACCOUNT_ID_REQUIRED');
        if(typeof OWNER_CONTRACT_HASHES!=='undefined')for(const [file,expected] of Object.entries(OWNER_CONTRACT_HASHES))check(createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex')===expected,'WORKTREE_CONTRACT_CHANGED_REGENERATE_OWNER_SCRIPT');
        const req=createRequire(path.join(ROOT,'package.json')),tsx=req('tsx/cjs/api').require;
        const load=p=>tsx('./'+p,path.join(ROOT,'package.json'));
        const {StripeAdapter,STRIPE_API_VERSION}=load('lib/integrations/stripe.ts');
        const {request}=load('lib/integrations/http.ts');
        const {MemoryRepository}=load('lib/core/repository.ts');
        const {BookingService}=load('lib/core/booking.ts');
        const {PaymentOperations}=load('lib/core/payment-operations.ts');
        const {hash}=load('lib/core/security.ts');
        const {fixture,input:selection}=load('tests/provider-fixtures.ts');
        const now=new Date(),repo=new MemoryRepository(),f=await fixture(100,repo,now);
        const integrationId='jobfray_checkout_'+Array.from(randomBytes(8),b=>String.fromCharCode(97+b%26)).join('');
        report.apiVersion=STRIPE_API_VERSION;report.integrationIdentifier=integrationId;
        const transport=async(url,init)=>{
            const u=new URL(url);check(u.origin==='https://api.stripe.com'&&u.pathname.startsWith('/v1/'),'STRIPE_ENDPOINT_NOT_AUTHORIZED');
            check(init.headers.Authorization==='Bearer '+key&&init.headers['Stripe-Version']===STRIPE_API_VERSION&&!init.headers['Stripe-Account'],'STRIPE_AUTH_ENVIRONMENT_OR_CONNECT_HEADER_INVALID');
            const method=init.method||'GET',p=new URLSearchParams(String(init.body||'')),s=u.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)(?:\/(line_items|expire))?$/);
            const refund=u.pathname.match(/^\/v1\/refunds\/([^/]+)$/);
            if(method==='POST'&&u.pathname==='/v1/checkout/sessions'){
                check(p.get('mode')==='payment'&&p.get('allowed_payment_method_types[0]')==='card'&&p.get('allowed_payment_method_types[1]')===null&&p.get('payment_method_types[0]')===null,'CHECKOUT_NOT_EXCLUSIVELY_CARD');
                check([200,300,400,500].includes(Number(p.get('line_items[0][price_data][unit_amount]')))&&p.get('line_items[0][price_data][currency]')==='usd'&&p.get('line_items[0][quantity]')==='1'&&p.get('line_items[1][quantity]')===null,'NOT_EXCLUSIVELY_JOBFRAY_FEE');
                check(p.get('integration_identifier')===integrationId&&!/transfer_data|application_fee|on_behalf_of|subscription_data|recurring|us_bank_account|ach/i.test(String(init.body)),'CONNECT_SUBSCRIPTION_ACH_OR_UNDERLYING_PAYMENT_FORBIDDEN');
                check(p.get('success_url')===ORIGIN+'/confirmation'&&p.get('cancel_url')===ORIGIN+'/confirmation','PRODUCTION_CALLBACK_FORBIDDEN');
            }else if(method==='POST'&&u.pathname==='/v1/refunds')check(verifiedPayments.has(p.get('payment_intent')),'REFUND_NOT_BOUND_TO_THIS_RUN');
            else if(s)check(sessions.has(s[1])&&((method==='GET'&&!s[2])||(method==='GET'&&s[2]==='line_items')||(method==='POST'&&s[2]==='expire')),'SESSION_NOT_OWNED_BY_THIS_RUN');
            else if(refund)check(method==='GET'&&[...refunds.values()].some(x=>x.providerId===refund[1]),'REFUND_NOT_OWNED_BY_THIS_RUN');
            else check(method==='GET'&&u.pathname==='/v1/account','STRIPE_OPERATION_NOT_AUTHORIZED');
            const data=await request(async(a,b)=>{
                const response=await io.fetch(a,b);
                if(!response.ok){report.lastStripeError={httpStatus:response.status};try{const body=await response.clone().json();for(const field of ['type','code','param'])if(typeof body.error?.[field]==='string'&&/^[A-Za-z0-9_.[\]-]{1,150}$/.test(body.error[field]))report.lastStripeError[field]=body.error[field];}catch{/* Suppress provider text and secrets. */}}
                return response;
            },url,init,20000);
            if(data.livemode===true)failure('LIVE_OBJECT_RETURNED_ABORT');
            if(method==='POST'&&u.pathname==='/v1/checkout/sessions'){check(/^cs_test_/.test(data.id)&&data.livemode===false,'CHECKOUT_NOT_SANDBOX');sessions.add(data.id);}
            if(method==='POST'&&u.pathname==='/v1/refunds'){const row=refunds.get(p.get('payment_intent'));if(row)row.providerId=data.id;}
            return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
        };
        const api=(p,method='GET',data)=>request(transport,'https://api.stripe.com/v1/'+p,{method,headers:{Authorization:'Bearer '+key,'Stripe-Version':STRIPE_API_VERSION,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(data?{body:new URLSearchParams(data).toString()}:{})},20000);
        report.stage='verify_account';const account=await api('account');check(account.id===input.account,'STRIPE_ACCOUNT_ID_MISMATCH_NO_WRITES');
        const names=[account.business_profile?.name,account.settings?.dashboard?.display_name,account.company?.name].filter(v=>typeof v==='string'&&v.trim());
        report.account={id:account.id,expectedIdMatched:true,jobfrayNameVerified:names.some(v=>/job\s*fray/i.test(v)),identityBasis:'Exact owner-pinned account ID; public/legal business name is informational, not a substitute for account identity.',separateSandboxIsolation:'Owner must select the dedicated sandbox account ID; sk_test and livemode:false cannot alone distinguish a separate sandbox from shared test mode.'};
        report.stage='prepare_local_test_tools';const tool=await io.prepare();report.cliVersion=tool.version;
        listener=await io.listen({key,version:STRIPE_API_VERSION,tool,onEvent:async(payload,signature)=>{
            if(!adapter)return;
            const event=adapter.envelope(payload,signature),object=event.data?.object;
            if(!sessions.has(object?.id))return;
            check(event.api_version===STRIPE_API_VERSION,'STRIPE_WEBHOOK_API_VERSION_MISMATCH');
            await operations.receive(payload,signature,new Date());await operations.receive(payload,signature,new Date());
            if(event.type==='checkout.session.completed')completedEvents.set(object.id,{id:event.id,payload,signature});
        }});
        const config={key,account:account.id,live:false,webhookSecrets:[listener.secret],origin:ORIGIN,integrationId};
        adapter=new StripeAdapter(config,transport);const booking=new BookingService(repo,f.geo,adapter,randomBytes(32).toString('hex'),'v1',{},true);
        operations=new PaymentOperations(repo,adapter,booking);
        const date=new Date(now.getTime()+2*86400000).toISOString().slice(0,10);
        let declinedChecked=false;
        for(const mode of ['RENTAL','SERVICE','QUOTE','RESERVATION']){
            report.stage='sandbox_checkout_'+mode;
            const value=selection(f,mode);if(mode!=='QUOTE'){value.startLocal=date+'T10:00';value.endLocal=date+(mode==='RENTAL'?'T12:00':'T11:00');}
            // Exercise all four fee tiers through the real calculator, not by
            // substituting arbitrary charge amounts: $80 rental, $30 service,
            // unknown quote and $160 reservation underlying subtotals stay local.
            if(mode==='RENTAL')value.quantity=4;
            if(mode==='RESERVATION')value.partySize=8;
            if(mode==='QUOTE'){
                const sharp=req('sharp'),{uploadImage}=load('lib/core/media.ts');
                const bytes=await sharp({create:{width:4,height:4,channels:3,background:'white'}}).webp().toBuffer();
                const image=await uploadImage(repo,{businessId:f.business.id,kind:'QUOTE',bytes,contentType:'image/webp',capability:f.capability,browser:'synthetic-browser-capability-binding'},new Date());value.photos=[image.id];
            }
            const checkout=await booking.checkout(value,f.capability,runId+'-'+mode,new Date(),'synthetic-browser-capability-binding');
            const intent=await booking.intent(checkout.requestId,checkout.confirmationToken,new Date());
            const repeated=await booking.intent(checkout.requestId,checkout.confirmationToken,new Date());check(intent.id===repeated.id,'CHECKOUT_CREATION_NOT_IDEMPOTENT');
            const raw=await api('checkout/sessions/'+intent.id+'?expand[]=payment_intent');
            check(raw.wallet_options?.link?.display==='never','LINK_WALLET_NOT_DISABLED');
            check(raw.integration_identifier===integrationId,'INTEGRATION_IDENTIFIER_NOT_CONFIRMED_BY_STRIPE');
            const items=await api('checkout/sessions/'+intent.id+'/line_items');
            check(items.data?.length===1&&items.data[0].quantity===1&&items.data[0].amount_total===checkout.snapshot.platformFeeCents&&items.data[0].currency==='usd','CHECKOUT_LINE_ITEMS_NOT_PLATFORM_FEE_ONLY');
            const fee={mode,amountCents:checkout.snapshot.platformFeeCents,sessionId:intent.id,cardOnly:true,linkWalletDisabled:true,integrationIdentifierVerified:true,creationIdempotent:true};report.fees.push(fee);
            if(!declinedChecked){
                await io.pay(intent.checkoutUrl,true);
                const failed=await api('checkout/sessions/'+intent.id+'?expand[]=payment_intent');
                check(failed.payment_status==='unpaid'&&failed.payment_intent?.status==='requires_payment_method'&&failed.payment_intent?.last_payment_error?.code==='card_declined','FAILED_TEST_PAYMENT_NOT_VERIFIED');
                let rejected=false;try{await adapter.paid(intent.id);}catch{rejected=true;}check(rejected,'FAILED_PAYMENT_WAS_ACCEPTED');
                fee.failedTestPaymentRejected=true;declinedChecked=true;
            }
            await io.pay(intent.checkoutUrl,false);
            let payment;for(let n=0;n<40;n++){try{payment=await adapter.paid(intent.id);break;}catch{await io.pause(500);}}
            check(payment&&payment.requestId===checkout.requestId&&payment.amountCents===fee.amountCents&&payment.currency==='USD','SUCCESSFUL_PAYMENT_BINDING_FAILED');verifiedPayments.set(payment.paymentId,payment);
            // Reconciliation deliberately runs before requiring the webhook; it must recover payment independently.
            await operations.run(new Date());
            const receipt=await booking.confirmation(checkout.confirmationToken);check(receipt.request,'RECONCILIATION_DID_NOT_FULFILL');fee.reconciliationVerified=true;
            for(let n=0;n<60&&!completedEvents.has(intent.id);n++)await io.pause(500);
            const event=completedEvents.get(intent.id);check(event,'REAL_SIGNED_CHECKOUT_WEBHOOK_NOT_RECEIVED');
            const bound=await adapter.verify(event.payload,event.signature);check(bound.paymentId===payment.paymentId&&bound.amountCents===fee.amountCents,'SIGNED_WEBHOOK_PAYMENT_BINDING_FAILED');
            await operations.run(new Date());await operations.run(new Date());
            const queued=await repo.transaction([],tx=>tx.find('operations',{id:'stripe-event:'+event.id}));check(queued.length===1,'DUPLICATE_EVENT_NOT_DEDUPLICATED');
            const allocations=await repo.transaction([],tx=>tx.find('allocations',{requestId:checkout.requestId,status:'CONFIRMED'}));check(allocations.length===(mode==='QUOTE'?0:1),'DUPLICATE_FULFILLMENT_ALLOCATION');
            let badSignatureRejected=false;try{adapter.envelope(event.payload+' ',event.signature);}catch{badSignatureRejected=true;}check(badSignatureRejected,'ALTERED_WEBHOOK_ACCEPTED');
            fee.realSignedWebhookVerified=io.mode==='stripe_sandbox';fee.duplicateReplayVerified=true;fee.signatureTamperRejected=true;
            const refund={id:randomUUID(),businessId:f.business.id,requestId:checkout.requestId,paymentId:payment.paymentId,reason:'JOBFRAY_SANDBOX_VERIFICATION',state:'REQUIRED',createdAt:new Date().toISOString(),resolvedAt:null};refunds.set(payment.paymentId,refund);
            await repo.transaction([],tx=>tx.put('refunds',refund));
            for(let n=0;n<20;n++){await operations.run(new Date());const saved=await repo.transaction([],tx=>tx.get('refunds',refund.id));if(saved.state==='REFUNDED'){Object.assign(refund,saved);break;}check(saved.state!=='FAILED','SANDBOX_REFUND_FAILED_OR_AMOUNT_MISMATCH');await io.pause(500);}
            check(refund.state==='REFUNDED'&&refund.amountCents===fee.amountCents,'SANDBOX_REFUND_NOT_COMPLETED');
            const again=await adapter.refund(payment.paymentId,'jf-refund:'+hash(refund.id));check(again.id===refund.providerId&&again.amountCents===fee.amountCents,'REFUND_IDEMPOTENCY_MISMATCH');
            const status=await adapter.refundStatus(refund.providerId);check(status.paymentId===payment.paymentId&&status.amountCents===fee.amountCents&&status.state==='succeeded','REFUND_READBACK_BINDING_FAILED');
            fee.refundVerified=true;fee.refundIdempotent=true;
        }
        check(JSON.stringify(report.fees.map(f=>f.amountCents).sort((a,b)=>a-b))==='[200,300,400,500]','FOUR_PLATFORM_FEE_AMOUNTS_NOT_COVERED');
        report.actualSandboxInteroperability=io.mode==='stripe_sandbox';report.status=io.mode==='stripe_sandbox'?'stripe_sandbox_checks_passed':'mocked_harness_checks_passed';report.stage='complete';
        report.signatureEvidence=listener.source;report.noConnectSubscriptionsACHUnderlyingPayments=true;
        report.productionActivation='Not authorized. See docs/STRIPE_SANDBOX_ACTIVATION.md; do not copy sandbox credentials or CLI signing secret to production.';
    }catch(e){report.status='blocked_or_partial';report.error=e.safeCode||'SANDBOX_VERIFICATION_FAILED_DETAILS_SUPPRESSED';report.blockers.push(report.error);}
    finally{
        if(adapter)for(const id of sessions){try{const s=await adapter.status(id);if(s.status==='open')await adapter.expire(id);}catch{report.blockers.push('SANDBOX_SESSION_CLEANUP_UNVERIFIED');}}
        if(listener)try{await listener.close();}catch{report.blockers.push('LOCAL_WEBHOOK_LISTENER_CLEANUP_UNVERIFIED');}
        try{await io.close();}catch{report.blockers.push('LOCAL_BROWSER_CLEANUP_UNVERIFIED');}key='';
        if(report.fees.some(f=>!f.refundVerified))report.blockers.push('REVIEW_PARTIAL_SANDBOX_PAYMENTS_AND_REFUNDS_IN_DEDICATED_SANDBOX_ONLY');
    }
    return report;
}
module.exports={runSandbox,realIO,ensureCli,selectCliAssets};
if(require.main===module)(async()=>{let text='';for await(const part of process.stdin)text+=part;let input;try{input=JSON.parse(text);}catch{console.log(JSON.stringify({status:'blocked',error:'SECURE_INPUT_INVALID'}));process.exitCode=1;return;}text='';const report=await runSandbox(input);input=null;console.log(JSON.stringify(report));if(report.status!=='stripe_sandbox_checks_passed')process.exitCode=1;})().catch(()=>{console.log(JSON.stringify({status:'blocked',error:'LOCAL_HARNESS_ERROR_DETAILS_SUPPRESSED'}));process.exitCode=1;});
