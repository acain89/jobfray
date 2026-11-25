# JobFray Cloudflare and Render infrastructure

Configured 2026-11-24 America/Chicago (2026-11-25 UTC). Infrastructure is staged; the rebuilt application has not been deployed. Public traffic sees maintenance. The obsolete Render service is deliberately suspended and its default hostname is disabled. **Trusted ingress is not declared verified against a deployed rebuild.**

## Identity and scope

Cloudflare active zone `jobfray.com`, zone ID `6f85c3b911a2bc25841633e12523530f`, account ID `13d3aeb19d46ac0a61c23cedd1d2fa0c`; Free Website plan confirmed. Render service `jobfray`, `srv-d851un6q1p3s73ebcqm0`, repository `https://github.com/acain89/jobfray`, workspace `JobFray`, `tea-d851u6mgvqtc73daclr0`; Free compute confirmed. No other zone, Worker or Render service was modified. No Stripe operations, database mutations, GitHub push or application deployment occurred. Credentials stayed in local process memory and were not saved in source or reports.

All existing Render environment values were compared before and after and preserved exactly. All 30 deployment IDs remained unchanged. Autodeploy remains off. All nine release gates remain `0`: `JOBFRAY_DATABASE_ENABLED`, `JOBFRAY_RELEASE_DB_VERIFIED`, `JOBFRAY_PRODUCTION_PROVIDERS`, `JOBFRAY_PROVIDER_OPERATIONS_ENABLED`, `JOBFRAY_RELEASE_PROVIDERS_VERIFIED`, `JOBFRAY_CHECKOUT_ENABLED`, `JOBFRAY_PUBLIC_INDEXING_ENABLED`, `JOBFRAY_SANDBOX`, `JOBFRAY_LOCAL_TEST`.

## DNS and certificates

| DNS name | Type / target | Cloudflare proxy |
| --- | --- | --- |
| jobfray.com | CNAME jobfray.onrender.com | On |
| www.jobfray.com | CNAME jobfray.onrender.com | On |
| *.jobfray.com | CNAME jobfray.onrender.com | On |
| _acme-challenge.jobfray.com | CNAME jobfray.verify.renderdns.com | DNS-only |
| _cf-custom-hostname.jobfray.com | CNAME jobfray.hostname.renderdns.com | DNS-only |

Four Squarespace apex A records and its www CNAME were replaced. TTL is automatic. Seven other existing records were preserved with identical IDs, names, types, contents, TTL and proxy flags, including Domain Connect and all email authentication records. No CAA records existed, so none were added or weakened.

The three Resend records remain DNS-only and unchanged: `rsend.mail.jobfray.com -> rsend.forge.rmta.net`, `send.mail.jobfray.com -> send.forge.rmta.net`, and the TXT DKIM key at `resend._domainkey.mail.jobfray.com`. Public DNS confirmed both CNAME targets and parsed the DKIM public key successfully. Root SPF, DMARC and the existing root domain-key record were preserved. This verifies DNS preservation and syntax, not a new Resend delivery or provider-account entitlement test; no Resend API operation was performed.

Render verified apex, www and wildcard domains. DNS-only verification was needed for apex/www. To prevent the obsolete application from being exposed during that interval, only the dedicated JobFray service was suspended first; Render Free compute has no maintenance mode. Valid CA/hostname-checked apex and www TLS certificates were then verified, and both records were restored to proxied mode only after a fresh certificate prerequisite check passed. Wildcard and apex share a valid certificate. Cloudflare SSL mode is Full (strict), minimum TLS 1.2; actual public probes negotiated TLS 1.3 for apex, www and a previously nonexistent business subdomain.

## Dedicated Worker and application boundary

`jobfray-trusted-ingress`, source [workers/jobfray-ingress.mjs](../workers/jobfray-ingress.mjs), is published with routes `jobfray.com/*` and `*.jobfray.com/*`. Both routes have `request_limit_fail_open=false`. Its workers.dev and preview URLs are disabled. Existing Render `JOBFRAY_EDGE_SECRET` was transferred directly in memory into a Worker `secret_text` binding and confirmed by secret-name/type readback. It was never printed or saved locally. Worker source was read back from Cloudflare and matched the local source. Observability/logpush are disabled.

Worker `ROUTING_MODE=maintenance` remains set. Every eligible HTTPS application request returns 503 without calling Render. HTTP and www requests receive method-preserving 308 redirects, with path and query intact. Actual apex/wildcard maintenance and www/HTTPS redirects were tested, including forged `x-jf-*` and forwarding headers. The default Render hostname returns 404.

The prepared live handler strips every incoming `x-jf-*` header and untrusted forwarding chains, derives the client IP from Cloudflare's overwritten CF-Connecting-IP together with Cloudflare request metadata, and injects the edge secret and client IP. It preserves original URL hostname, method, path, query, cookies, authorization and Stripe signature header. The body is forwarded as the original stream, without parsing or serialization. Origin redirects stay manual. Origin failures return a closed 502 response. Cache API storage is not used; upstream cache is bypassed and responses are forced private/no-store at browser and CDN layers, including checkout and confirmation responses.

[lib/core/ingress.ts](../lib/core/ingress.ts) and [proxy.ts](../proxy.ts) now apply the authenticated ingress boundary to every production path, including documents, APIs, webhooks, media and Next assets. Previously only selected protected operations checked assertions. The narrow public exception is GET/HEAD `/api/health`, which contains no tenant or operational data; POST and lookalike health paths do not bypass authentication. Unexpected/reserved/deep hosts are rejected. One-level business homepage dispatch is preserved. The proxy never reads request bodies. Explicit local sandbox behavior remains local and existing application auth/CSRF checks still apply.

## Evidence and limits

All 179 regression tests, affected-source lint, TypeScript checking, the production build, public HTTP smoke checks, local full application workflows and disabled-production HTTP checks passed. Local HTTP requests with missing or forged edge assertions were rejected on document/API/webhook/media/asset paths. Worker tests verified exact non-ASCII/whitespace/raw-byte preservation, header stripping, cookie/auth preservation, no-store policy, canonical redirects and closed failure paths.

Recovery and sanitized evidence are in [artifacts/jobfray-infrastructure](../artifacts/jobfray-infrastructure): `dns-recovery-before.json`, `routes-recovery-before.json`, `render-before.json`, `worker-stage.json`, `certificate-readiness-before-proxy.json`, `proxy-restoration.json`, `origin-isolation.json`, `final-api-readback.json`, `public-verification.json`, `capabilities-costs.json`, and local verification logs. DNS recovery snapshots contain public DNS records, not credentials. Restore only web records through a reviewed batch, preserving the email records. Re-enabling the obsolete service is not part of recovery.

A request forced to Render's shared edge IP still reached Cloudflare maintenance. That diagnostic does not prove independent origin isolation across all possible routes. The current obsolete origin is additionally isolated by Render suspension and the disabled default hostname. A Worker alone is not origin protection. Render inbound IP restrictions for web services require Scale/Enterprise, so no unsupported Free-plan allowlist or paid upgrade was attempted.

## Remaining deployment-dependent acceptance

1. Keep the obsolete service suspended, Worker maintenance active, and all nine gates disabled until a separately authorized reviewed rebuild deployment. Do not resume the obsolete build just to probe it. The deployment procedure must preserve isolation while replacing the old build. Set the intended build/start settings and `/api/health` health check under that deployment authorization; these unrelated service settings were not changed here.
2. Test actual Render hostname/forwarding behavior against the deployed rebuild, including invalid/missing/spoofed edge assertions through every direct-origin route, static/dynamic paths, private media and API boundaries. Confirm direct-origin denial from outside Cloudflare and the disabled default hostname. Do not enable public forwarding merely because local tests passed.
3. Verify actual Worker-derived client IP and rate-limit principal, end-to-end origin TLS, canonical redirects, wildcard tenant dispatch and private/authenticated cache behavior. Test exact webhook byte/signature compatibility with the deployed route only when provider testing is separately authorized.
4. Only after deployed ingress acceptance should a separately authorized cutover set Worker routing live. Keep checkout/provider/database/indexing gates closed until their own release approvals. `JOBFRAY_WORKER_KEY` remains separate: scheduled application worker calls still require their bearer authorization as well as edge ingress.

## Costs and capabilities

No plan upgrade, purchase or additional Render compute service was requested. Cloudflare Free supports the required proxied DNS, one-level wildcard Universal SSL and Worker routes. Workers Free supports 100,000 requests/day with a 10 ms CPU allowance; the configured fail-closed routes prevent quota exhaustion from bypassing the Worker. Zone Free and Workers billing are separate: the token cannot read account subscriptions (403), so the account's existing Workers billing plan/invoice is not asserted or changed.

Render automatically issues TLS certificates, including wildcards. Workspace plans include a domain allowance; excess custom domains cost $0.25/domain/month. Three Render domain entries were added, so the conservative upper bound for added domain charges is $0.75/month if all are over the workspace allowance. Actual incremental billing was not exposed by these API responses; it may be lower or zero. The Render workspace read confirmed identity but did not expose its subscription tier. No invoice amount or zero-cost guarantee is claimed.

Official evidence: [Render Cloudflare DNS verification](https://render.com/docs/configure-cloudflare-dns), [custom domains and certificate requirements](https://render.com/docs/custom-domains), [no automatic deployment for service updates](https://api-docs.render.com/reference/update-service), [DNS verification API](https://api-docs.render.com/reference/refresh-custom-domain), [Render maintenance availability](https://render.com/docs/maintenance-mode), [inbound IP plan requirements](https://render.com/docs/inbound-ip-rules), [Workers limits and fail modes](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Cloudflare original-host routing](https://developers.cloudflare.com/workers/configuration/routing/routes/).
