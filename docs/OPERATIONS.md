# JobFray operational release runbook

Phase 4 prepares local verification; this is not deployment authorization. No existing
or remote database or live provider was operated. Noindex and financial checkout gates
remain in place. `/api/health` is liveness, not payment/database readiness.
`/api/ready` deliberately returns 503 until real provider verification is implemented.

## Environment and startup

Production persistence requires `JOBFRAY_DATABASE_ENABLED=1`,
`JOBFRAY_RELEASE_DB_VERIFIED=1`, an independently verified `DATABASE_URL`, HTTPS
`JOBFRAY_PUBLIC_ORIGIN`, and a random `JOBFRAY_CONFIRMATION_KEY` of at least 32
characters. Set the exact `JOBFRAY_BASE_HOST` and normalized administrator email
allowlist in `JOBFRAY_ADMIN_EMAILS`. Do not put secrets in NEXT_PUBLIC variables.
Startup validates these settings without opening a database. Missing/invalid enabled
configuration fails startup. An unconfigured application is a disabled public preview.
New profile writes persist a provider-verified public ZIP centroid for private-base
directory ranking, avoiding provider calls per listed business. Older synthetic
profiles without that field use a bounded per-search ZIP cache; resolve any legacy
centroids during separately authorized provider rollout. Production providers deliberately return 503; there is no File/Memory/mock fallback.

Local production-build verification additionally requires `JOBFRAY_SANDBOX=1`,
`JOBFRAY_LOCAL_TEST=1`, a loopback public origin, and an explicit loopback Next CLI
listener (`next start --hostname 127.0.0.1 --port <local-port>`). Never deploy these
settings. Request Host/forwarding checks supplement this listener restriction.
Sandbox files and keys stay in ignored artifacts and contain synthetic data only.

## Database release and rollback

Before any separately authorized release, verify database identity, host, role,
provider account, migration ledger and backup restore target. Never infer a target
from a developer environment file. Test against an isolated restored copy first.
Keep all three historical migrations unchanged. Versioned additions are
`20261124000100_four_mode_foundation` and `20261124000200_persistence_hardening`.
Use `prisma migrate deploy`, not db push/reset/seed or an edited historical baseline.
Prisma drift checks do not inspect all CHECK constraints, triggers, expression/partial
indexes or grants: review those explicitly against the versioned SQL.

Use a migration-owner role distinct from the application role. The application role
must have no superuser, CREATE DATABASE, CREATE ROLE, replication, schema creation,
TRUNCATE, trigger-disable or function-definition privileges. Grant only required
SELECT/INSERT/UPDATE and retention DELETE access on Jf tables. Immutable snapshots,
events and audit tables need SELECT/INSERT only; request/refund DELETE is prohibited.
Do not grant application access to legacy business/provider tables. The isolated test
role verifies these immutable-table restrictions; review actual deployed grants again.
Tenant authorization is enforced by application services and compound foreign keys;
the database connection is trusted server infrastructure, not a customer SQL interface.

Take an encrypted database backup plus protected signing-key backups before migration.
Restore into a distinct isolated database, verify row counts, financial/event history,
constraints and representative confirmation access. Test restoration regularly.
Do not drop the Jf tables or rewrite financial history for rollback. Roll back application
traffic to a compatible release or disable new requests; preserve confirmed obligations.
Use forward repair migrations and an independently reviewed restore plan for corruption.
Do not roll back the database to a backup while accepting new payments/requests.

## Background work

`POST /api/worker` requires a separate random `JOBFRAY_WORKER_KEY` (32+ characters)
as an exact Bearer authorization value. Cookies do not authorize it. Keep the endpoint
behind TLS and scheduler/network restrictions. No provider or scheduler was connected.
Schedule a non-overlapping invocation approximately every minute; repeat bounded
batches until caught up. Jobs expire holds, remove expired sessions/tokens/rate buckets
and quote media, redact sent delivery bodies after 24 hours, and claim up to 50
notification deliveries with expiring leases, stable delivery keys and capped backoff.
Lease tokens prevent stale acknowledgements. External transports must honor delivery
idempotency keys because crash recovery is necessarily at least once.

Dashboard confirmation records are authoritative during notification outages. Alert
on repeated delivery failures, overdue batches, refund-required rows, transaction retry
exhaustion and worker failures. Never delete payment/refund/event/confirmation history.
Reconciliation currently expires local pending holds; a separately authorized real
payment adapter must add provider status/event reconciliation and refund execution.
No browser redirect proves payment. Delayed successes must enter remediation rather
than reacquiring another customer's occupied capacity.

## Key rotation and recovery

Set `JOBFRAY_CONFIRMATION_KEY_VERSION` (default v1) when installing a new signing key.
Retain old versions in the protected JSON object `JOBFRAY_CONFIRMATION_PREVIOUS_KEYS`.
Deploy the old key under its old version and the new key under the new version together.
Verify both an old confirmation and historical idempotent checkout before removing
any retired material. Old hashed capabilities continue to authorize existing links;
old derivation keys are still required for historical replay and notification recovery.
Do not discard them merely because the active key changed. Backups must include the
appropriate versioned keys separately and securely. Missing old keys fail closed.
For compromise, disable new checkout, rotate affected credentials, assess existing
capabilities and arrange verified customer reissuance through the authorized provider.
That incident workflow requires operator review; do not silently invalidate history.
Rotate the worker key with a coordinated scheduler update. Revoke sessions after
credential compromise. Password recovery already revokes all account sessions.

## Logging, retention and external gates

Unhandled HTTP errors return a generic message and opaque reference. Structured logs
contain the reference/event kind, never request bodies, passwords, token material,
addresses, uploaded bytes or database error text. Do not enable raw query/body logging.
Provider transports need separately verified redaction, timeouts, retry classification,
request IDs and actionable alerting before release. Protect logs and synthetic artifacts.

Before real customers, separately authorize and verify: platform-fee payment/refund
adapter and signed event ingress; email verification/recovery and mandatory business
notifications; customer SMS verification/confirmation; exact-address/ZIP geocoding;
secure production image storage and lifecycle deletion; optional push delivery;
background scheduling/monitoring; TLS/subdomains and any domain verification; backup
storage and restoration; legal/provider Terms, privacy, retention and support review.
No subscriptions, Connect, commissions, underlying business payment collection,
automatic business-nonperformance refunds or paid ranking may be introduced.

## Local PostgreSQL evidence and reproduction

The Phase 4 cluster was newly initialized under `artifacts/phase4-postgres/data`,
listening exclusively on 127.0.0.1:55487, system identifier 7711613122963596620.
Its new roles are jf_phase4_disposable (migration owner) and jf_phase4_app (restricted
application role). It uses local trust solely for disposable synthetic data; never copy
that authentication setting into production. No existing credentials were used.
The test runner requires `JOBFRAY_DISPOSABLE_PG=7711613122963596620`, checks that
identity, uses explicit loopback connection settings, and creates fresh test schemas.
Run `node scripts/phase4-postgres.mjs` only while that exact disposable instance is
running. The harness reuses core scenarios with the Prisma adapter and closes clients
between tests; generated scenarios/logs remain ignored. If creating a new cluster,
verify its identity and deliberately update the harness target/acknowledgement first.
Never point this runner at an existing application database. Stop the test cluster
with pg_ctl using that exact data directory after verification. Preserve artifacts
until reviewed; do not recursively delete an inferred path.
