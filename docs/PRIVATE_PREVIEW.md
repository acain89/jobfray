# Private owner preview

Open **https://jobfray.com/__jobfray/preview** in Safari or Chrome on the phone. Enter the separately delivered private preview access key and select **Unlock preview for 16 hours**. No extension, custom header, VPN or new service account is required. Paste the preview key rather than a saved JobFray account password. Surrounding pasted spaces are ignored. Keep the key private; it is unrelated to Stripe, Render, worker scheduling and JobFray account passwords.

The preview session is an apex-host-only `__Host-` cookie with `Secure`, `HttpOnly`, `SameSite=Lax`, an sixteen-hour absolute expiry and an HMAC signature. The random 256-bit access key is a dedicated Cloudflare Worker secret. It is submitted only in an HTTPS POST body, never a link or query string. The preview cookie is removed before forwarding to Render. Responses remain private/no-store and noindex. Worker secret storage is described in [Cloudflare's official documentation](https://developers.cloudflare.com/workers/configuration/secrets/).

After unlocking:

1. Visit **https://jobfray.com/register** and create the actual owner account using an email address you control. This is the production application and production persistence.
2. Open the verification email in the same phone browser. If another browser opens, unlock preview there first, then reopen the email link. Normal email verification and JobFray sign-in remain required.
3. Visit **https://jobfray.com/login**, then **https://jobfray.com/dashboard**. Configure the business, resources and offerings, use the builder and review its live inline preview. Drafts, uploads and changes are real production data.
4. To inspect a published business page in this authenticated browser, use **https://jobfray.com/sites/YOUR-BUSINESS-SLUG**. The apex-only preview cookie intentionally does not open public business subdomains; those remain in maintenance.
5. To lock preview on this browser, return to **https://jobfray.com/__jobfray/preview** and select **Lock preview on this browser**. Normal application sign-out is separate. Log out of JobFray as well on a shared device.

When the sixteen-hour cookie expires, unlock again with the preview key. The access key remains valid until rotated or preview is disabled. Rotating the Worker secret invalidates every existing preview cookie; setting `PREVIEW_ENABLED=0` closes all preview access immediately. The deployment publisher preserves the existing preview flag and secret unless explicitly changed. Do not put the key in documentation, source control, screenshots or support reports.

Public `ROUTING_MODE=maintenance`, the closed operator channel, financial minute cron, webhook ingress, `JOBFRAY_CHECKOUT_ENABLED=0` and `JOBFRAY_PUBLIC_INDEXING_ENABLED=0` remain unchanged. Preview access does not grant any application login, administrator role, payment creation, worker bearer or ingress-secret authority. It cannot bypass worker/acceptance/operator endpoints. No RF/RFL resource or Render application deployment is part of this Worker-only configuration.
