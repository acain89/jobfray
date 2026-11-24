# Render release preparation ? no settings changed

This branch is foundation-only and must not replace production without approval.
Existing JobFray Render service identity, live commit, environment groups, database,
backup status, jobs, callbacks and auto-deploy remain unverified. The public apex
and www domains served Squarespace at inventory time. Do not infer Render routing
from application metadata or alter DNS during foundation work.

## Proposed web-service settings, after verification/approval

| Setting            | Intended value                                                     |
| ------------------ | ------------------------------------------------------------------ |
| Resource           | Existing JobFray Node web service, if verified and suitable        |
| Repository         | acain89/jobfray                                                    |
| Branch             | Release branch to be approved; never switch during this task       |
| Root directory     | Repository root                                                    |
| Node               | 22.x (`.node-version` and package engines)                         |
| Build command      | `npm ci --ignore-scripts && npm run build`                         |
| Start command      | `npm run start`                                                    |
| Health-check path  | `/api/health` (liveness only)                                      |
| Pre-deploy command | Blank for this foundation; no migration or seed                    |
| Auto-deploy        | Inspect existing setting before any future push; do not change now |

Normal `next start` is used; no mixed standalone output/asset-copy setup. The
foundation has no database client runtime import and does not need Prisma client
generation to serve. A later database adapter will require an explicitly reviewed
client-generation/release step. No persistent disk or scheduled job is needed for
this foundation. Do not retire existing jobs until their ownership is verified.

## Environment variables

| Name                      | Foundation requirement                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JOBFRAY_PUBLIC_ORIGIN`   | Exact verified HTTPS public origin, with no path, query, credentials or fragment; local default is http://localhost:3000. `https://www.jobfray.com` is only a future candidate until domain routing is approved. Set before build; static canonical metadata requires a rebuild when it changes. |
| `NODE_ENV`                | production at runtime; normally supplied by the platform                                                                                                                                                                                                                                         |
| `NEXT_TELEMETRY_DISABLED` | 1 for verification/builds                                                                                                                                                                                                                                                                        |
| `PORT`                    | Render-managed; do not replace with a hard-coded port                                                                                                                                                                                                                                            |
| `DATABASE_URL`            | NOT used by the serving foundation. Only required for explicit Prisma CLI validation/generation; use isolated local credentials for those checks. Preserve any existing production value/settings without copying or overwriting them.                                                           |

No Stripe, Cloudinary, Mapbox, JWT or admin-password variables are needed
by the new serving application. Do not delete existing values, shared environment
groups, keys or provider accounts: verify ownership, legacy obligations and
retention first. No new payment/auth/provider secret is generated in this task.

## Before an eventual release

- Verify current remote main and the Render live commit; preserve intervening work.
- Confirm the correct web service/database, custom domains, callbacks and backups.
- Resolve legacy provider obligations and the product/auth/payment design gates.
- Review noindex policy; it is deliberately enforced by metadata, robots and HTTP
  headers throughout this foundation, including private route stubs.
- Re-run isolated verification; inspect the release diff and obtain approval.
- Do not merge, push, deploy, seed or apply migrations from these instructions now.
- Rollback would restore the recorded prior application commit/configuration.
  Preserve database contents; do not reset or remove tables to roll back code.

References: https://render.com/docs/deploy-nextjs-app and
https://render.com/docs/deploys . These describe platform capabilities, not proof
of the actual JobFray settings.
