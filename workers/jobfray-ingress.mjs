// Dedicated JobFray ingress. No credentials belong in this source.
const BASE = 'jobfray.com';
const RESERVED = new Set(['app', 'api', 'admin', 'auth', 'find', 'mail', 'support']);
export function validClientIP(ip) {
    if (typeof ip !== 'string' || ip.length > 45 || /[\s,%]/.test(ip)) return false;
    if (ip.includes(':')) { try { return new URL('http://[' + ip + ']/').hostname.startsWith('['); } catch { return false; } }
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(part => Number(part) <= 255);
}
function privateResponse(body, status, extra = {}) {
    return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store, max-age=0', 'cdn-cache-control': 'no-store', 'cloudflare-cdn-cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', ...extra } });
}
export async function operatorRequest(request, env) {
    if (env.ACCEPTANCE_ENABLED !== '1' || typeof env.JOBFRAY_WORKER_KEY !== 'string' || env.JOBFRAY_WORKER_KEY.length < 32) return false;
    const supplied = request.headers.get('authorization') || '';
    if (supplied.length > 256) return false;
    const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    const a = await digest(supplied), b = await digest('Bearer ' + env.JOBFRAY_WORKER_KEY);
    let different = 0; for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
    if (different) return false;
    const url = new URL(request.url);
    return ['GET', 'HEAD'].includes(request.method) || request.method === 'POST' && ['/api/acceptance', '/api/worker', '/api/stripe/webhook', '/__jobfray/scheduler-check'].includes(url.pathname);
}
export function createWorker(originFetch = fetch) {
    const scheduledMode = env => env.SCHEDULER_MODE === 'nonfinancial' ? 'nonfinancial' : 'read_only';
    const runScheduler = async env => {
        if (env.SCHEDULER_ENABLED !== '1' || !env.JOBFRAY_EDGE_SECRET || !env.JOBFRAY_WORKER_KEY) return { executed: false, reason: 'disabled' };
        const request = new Request('https://jobfray.com/api/worker', { method: 'POST', redirect: 'manual', headers: { Authorization: 'Bearer ' + env.JOBFRAY_WORKER_KEY, 'x-jf-edge-secret': env.JOBFRAY_EDGE_SECRET, 'x-jf-client-ip': '192.0.2.1', 'x-forwarded-proto': 'https', 'x-jobfray-worker-mode': scheduledMode(env) } });
        const response = await originFetch(request, { cache: 'no-store', cf: { cacheEverything: false, cacheTtl: -1 } });
        let result; try { result = await response.json(); } catch { result = {}; }
        const evidence = { executed: true, status: response.status, mode: result.mode || null, financialOperationsExecuted: result.financialOperationsExecuted, mutationsExecuted: result.mutationsExecuted };
        console.log(JSON.stringify({ event: 'jobfray.scheduler', ...evidence }));
        return evidence;
    };
    return {
        async scheduled(_controller, env) { const result = await runScheduler(env); if (result.executed && (result.status !== 200 || result.mode !== scheduledMode(env) || result.financialOperationsExecuted !== false || result.mode === 'read_only' && result.mutationsExecuted !== false)) throw new Error('Scheduled worker acceptance failed'); },
        async fetch(request, env) {
            const url = new URL(request.url), host = url.hostname.toLowerCase();
            const slug = host.endsWith('.' + BASE) ? host.slice(0, -BASE.length - 1) : '';
            if (host !== BASE && host !== 'www.' + BASE && (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || RESERVED.has(slug))) return privateResponse('Not found', 404);
            if (url.port || !['https:', 'http:'].includes(url.protocol)) return privateResponse('Invalid origin', 421);
            if (url.protocol !== 'https:' || host === 'www.' + BASE) {
                url.protocol = 'https:'; if (host === 'www.' + BASE) url.hostname = BASE;
                return privateResponse(null, 308, { location: url.href });
            }
            // Default is closed. Only a later reviewed cutover may enable forwarding.
            const operator = await operatorRequest(request, env);
            // Scheduled fetches can re-enter this route without an incoming
            // zone request context. Permit only the configured authenticated
            // worker endpoint independently of the temporary operator channel.
            const scheduled = env.SCHEDULER_ENABLED === '1'
                && request.method === 'POST' && url.pathname === '/api/worker'
                && request.headers.get('x-jobfray-worker-mode') === scheduledMode(env)
                && await operatorRequest(request, { ...env, ACCEPTANCE_ENABLED: '1' });
            // This permits transport, not authentication. The origin verifies
            // Stripe's HMAC over the untouched body before any persistence.
            const signature = request.headers.get('stripe-signature') || '';
            const signatureParts = signature.length <= 2048 ? signature.split(',').map(part => part.trim()) : [];
            const webhook = env.WEBHOOK_INGRESS_ENABLED === '1' && host === BASE
                && request.method === 'POST' && url.pathname === '/api/stripe/webhook'
                && request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json'
                && signatureParts.some(part => /^t=\d{1,12}$/.test(part))
                && signatureParts.some(part => /^v1=[a-fA-F0-9]{64}$/.test(part));
            if (webhook && Number(request.headers.get('content-length')) > 1000000) return privateResponse('Webhook too large', 413);
            if (operator && url.pathname === '/__jobfray/origin-denial' && request.method === 'GET') {
                const outcomes = [];
                for (const pathname of ['/', '/api/core', '/api/worker', '/api/stripe/webhook', '/media/private', '/_next/static/nonexistent.js']) {
                    const target = new URL('https://jobfray.com' + pathname);
                    const response = await originFetch(new Request(target, { headers: { 'x-jf-edge-secret': 'forged', 'x-jf-client-ip': '127.0.0.1', 'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy' }, redirect: 'manual' }), { cache: 'no-store', cf: { cacheEverything: false, cacheTtl: -1 } });
                    outcomes.push({ pathname, status: response.status }); await response.body?.cancel();
                }
                const invalidWorker = await originFetch(new Request('https://jobfray.com/api/worker', { method: 'POST', headers: { Authorization: 'Bearer forged', 'x-jf-edge-secret': env.JOBFRAY_EDGE_SECRET, 'x-jf-client-ip': '192.0.2.1' }, redirect: 'manual' }), { cache: 'no-store' });
                outcomes.push({ pathname: '/api/worker-invalid-bearer', status: invalidWorker.status }); await invalidWorker.body?.cancel();
                return privateResponse(JSON.stringify({ outcomes }), 200);
            }
            if (operator && url.pathname === '/__jobfray/scheduler-check' && request.method === 'POST') return privateResponse(JSON.stringify(await runScheduler(env)), 200);
            if (env.ROUTING_MODE !== 'live' && !operator && !scheduled && !webhook) return privateResponse('JobFray is preparing its new application. Please check back soon.', 503, { 'retry-after': '300', 'x-jobfray-stage': 'maintenance' });
            if (typeof env.JOBFRAY_EDGE_SECRET !== 'string' || env.JOBFRAY_EDGE_SECRET.length < 32) return privateResponse('Service unavailable', 503);
            // Cloudflare overwrites CF-Connecting-IP on inbound Internet requests.
            // The cf metadata requirement prevents this handler accepting arbitrary
            // non-Cloudflare requests. Never derive identity from forwarded chains.
            const clientIP = request.headers.get('cf-connecting-ip');
            if (!request.cf || !validClientIP(clientIP)) return privateResponse('Trusted connection required', 403);
            const headers = new Headers(request.headers);
            for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith('x-jf-') || ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'true-client-ip'].includes(name.toLowerCase())) headers.delete(name);
            headers.set('x-jf-edge-secret', env.JOBFRAY_EDGE_SECRET);
            headers.set('x-jf-client-ip', clientIP);
            headers.set('host', host);
            headers.set('x-forwarded-host', host);
            headers.set('x-forwarded-proto', 'https');
            headers.set('x-forwarded-for', clientIP);
            if (scheduled) headers.set('x-jobfray-worker-mode', scheduledMode(env));
            // Forward the original stream: do not parse, reserialize, decompress,
            // stringify or clone JSON. Stripe signatures bind the exact bytes.
            const outgoing = new Request(request, { headers, redirect: 'manual' });
            try {
                const upstream = await originFetch(outgoing, { cache: 'no-store', cf: { cacheEverything: false, cacheTtl: -1 } });
                const response = new Response(upstream.body, upstream);
                for (const name of [...response.headers.keys()]) if (name.toLowerCase().startsWith('x-jf-')) response.headers.delete(name);
                response.headers.set('cache-control', 'private, no-store, max-age=0');
                response.headers.set('cdn-cache-control', 'no-store');
                response.headers.set('cloudflare-cdn-cache-control', 'no-store');
                return response;
            } catch { return privateResponse('Origin unavailable', 502); }
        },
    };
}
export default createWorker();
