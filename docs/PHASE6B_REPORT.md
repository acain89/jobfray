# Phase 6B — Production database initialization

Status: owner-run initialization script prepared; no production initialization was performed. See [owner execution and verification runbook](PHASE6B_OWNER_RUNBOOK.md).

## Owner-run execution approach — November 24, 2026

Prepared `scripts/phase6b-initialize.ps1` and its strictly typed TypeScript implementation. The script reads the migration URL from its process environment, verifies pinned identity/TLS and empty catalog state, applies the seven unchanged committed migrations atomically with Prisma-compatible ledger entries, creates/verifies `jobfray_app`, and hands off its URL through Windows DPAPI storage and a cleared clipboard. It accepts verified empty partial migration boundaries and never automatically repairs or resets a database.

Local evidence includes mocked failure-path tests and an isolated loopback PostgreSQL 17 harness covering atomic rollback, all six partial boundaries, reruns, real SCRAM login, ACLs, empty Prisma drift, and data/guard/ledger rejection. The harness mocks TLS and Render's managed `earthdistance` installation capability; production has no bypass. No remote database, Stripe, deployment or provider connection was made. Earlier blocked-attempt sections below remain historical evidence, not results from the owner-run script.

Final validation passed: all 16 tests (15 mocked/CLI tests plus one synthetic-secret Windows DPAPI roundtrip), repository `tsc --noEmit`, targeted ESLint with zero warnings, both PowerShell AST parses, and the final local SQL harness. The fixture cluster was stopped after verification. No production validation result is claimed.

## DPAPI credential resume attempt — November 24, 2026

Attempted the owner-specified `Get-Content -Raw | ConvertTo-SecureString` load from `%LOCALAPPDATA%\JobFray\migration-url.enc` in the PowerShell process intended for database initialization. Credential loading failed before any connection or database command:

```text
Exception type: System.FormatException
Error ID: System.FormatException,Microsoft.PowerShell.Commands.ConvertToSecureStringCommand
Sanitized error: Input string was not in a correct format.
```

This error does not establish Windows account isolation as the cause. No decrypted credential was displayed or persisted. No identity/TLS verification, migration, role creation, or permission verification could proceed. Stripe remains disconnected and all existing restrictions remain in effect.

## Verified local state

- Branch: `feat/jobfray-rebuild`
- HEAD: `2bfc47143b703d124540a3408a7f1274cc19b8cf`
- Checkout was clean before this report; historical migrations match HEAD.
- Seven committed migration directories are present, ending in `20261124000400_browser_request_capabilities`.
- Read production setup, operations, release checklist, Phase 6A report, migration SQL, schema and Prisma repository implementation.
- PostgreSQL 17 client tools are installed. Prisma is pinned to 5.22.0.

## Blocking condition and database results

`JF_MIGRATION_DATABASE_URL` is absent from both execution environments checked. No credentials were loaded from `.env` files or alternate sources. No database connection was attempted.

Owner-supplied expected identity: service `jobfray-db`, ID `dpg-dc2u9qmtlv9c738ork2g-a`, database `jobfray`, migration user `jobfray_owner`, PostgreSQL 17, Oregon, 0.1 CPU / 256 MB RAM. These values have NOT been independently verified.

Before connecting, verify the service-specific external hostname, database, username and port, reject unexpected connection overrides, and require certificate and hostname verification. Then inspect database identity, version, current/session role, TLS, permissions and all non-system schema contents. Stop on any unexpected application tables, migration history or data.

Migrations applied in this attempt: none. Ledger, schema alignment, extensions, indexes, constraints, triggers and functions remain unverified. No role or password was created; no restricted URL exists for clipboard handoff. No synthetic records were inserted.

## Reviewed role requirements — not applied

- Snapshots, payment events and audits: SELECT/INSERT only.
- Requests and refunds: SELECT/INSERT/UPDATE, no DELETE.
- Other active Jf tables: application reads/writes; restrict DELETE to current removal/retention requirements. Session deletion needs push-device revocation trigger permissions.
- Directory projection: invoker-rights triggers need source business/offering SELECT, projection INSERT/UPDATE/DELETE and required function/type access.
- No legacy-table or migration-ledger access, administrative privileges, privileged memberships, ownership, schema CREATE, TRUNCATE, REFERENCES, TRIGGER or grant options. Revoke untrusted PUBLIC schema CREATE. Inspect effective inherited/PUBLIC/column privileges as well as explicit grants.

After initialization, verify all seven ledger checksums/completions and absence of failed/incomplete migrations. Compare Prisma schema and inspect SQL-only guards separately: immutable snapshot/event/audit history, immutable request/allocation facts, request/refund deletion guards, browser token purposes, notification channels, phone matching, directory projection and worker functions. Do not create synthetic production records for these checks.

Generate the app password only after database preflight. Secure handoff remains pending: use local owner-invoked clipboard transfer from an in-memory process or Windows-protected secret storage; never print credentials, pass them as command arguments, or save plaintext in tracked files/reports. Clear clipboard after transfer. No Render configuration change is authorized.

## Initial pool recommendation — provisional

For 256 MB RAM / 0.1 CPU, start with one process, one shared PrismaClient and URL parameters `connection_limit=2`, `pool_timeout=10`, `connect_timeout=10`. Budget each additional database-connected process separately; initially keep combined application pools at four connections or fewer and reserve server capacity for maintenance/migration/recovery. An HTTP scheduler using the existing web worker endpoint does not need a separate database pool.

Actual max_connections, reserved slots, active sessions, database/role connection limits and memory settings could not be inspected. Reconcile this recommendation against observed limits before deployment. Do not raise server connection limits or change plans. No load/capacity result is claimed. Reference: [Prisma pool configuration](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool). This checkout uses the Prisma 5.22 query engine and URL parameters, not Prisma 7 driver-adapter configuration.

## Backup acceptance still required

[Render documentation](https://render.com/docs/postgresql-backups) states Free compute has no managed recovery or managed logical exports; local pg_dump is an alternative. Paid databases support PITR with a three-day Hobby workspace window or seven days for Pro and higher; managed logical exports are retained for seven days. This service's actual plan and Recovery page have not been verified. Compute size alone is not treated as proof of its plan.

Verify actual backup capabilities, recovery window, encrypted access-controlled storage, retention, monitoring, RPO/RTO and recovery ownership. Obtain separate authorization for a production backup and isolated restore exercise. Validate ledger, guards, roles/ACLs, immutable history, confirmed obligations, media references and confirmation/signing-key recovery on the distinct restore target.

[Render lists cube, earthdistance and pg_trgm as supported](https://render.com/docs/postgresql-extensions); actual availability and installation permissions on this database remain pending.

No production backup/restore or load test was executed or passed. No RF/RFL, Stripe/provider, Render web-service, hosting-plan, DNS, deployment, push, merge or historical migration changes were made. Restore the inherited migration environment variable without posting its value in chat to unblock initialization.

## TLS trust-store remediation

The installed psql/libpq 17.10 uses OpenSSL 3.0.21. Its default CA file and
directory are absent, so the previous `PGSSLROOTCERT=system` could not reproduce
Node 22's successful Mozilla-root verification. Initialization now uses a
fingerprint-checked public ISRG Root X1 PEM for Node and libpq, preserving
`verify-full` and a TLS 1.2 minimum. A pre-mutation read-only Prisma 5.22 engine
connection uses its supported `require`, `strict`, and `sslcert` parameters with
an absolute path to the same root. No credential handoff was added.

28 local tests, TypeScript, and targeted ESLint passed. The installed psql and
Prisma engines each accepted a synthetic trusted chain and rejected untrusted
chains and hostname mismatches against a loopback-only TLS protocol fixture.
See the owner runbook for evidence, sources, limitations, and the unchanged
PowerShell execution command. Remote validation remains owner-run; Codex made
no remote database operations and Stripe remains disconnected.
