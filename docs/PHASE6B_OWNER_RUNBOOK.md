# Phase 6B owner execution

Prepared and tested locally; no remote database connection has been made by this work. Stripe remains disconnected. Deployment, provider calls, Render configuration, DNS, plan changes, backup/restore, load testing, push and merge remain outside this authorization.

## Run

Use the owner's Windows account and an existing Windows PowerShell process with `JF_MIGRATION_DATABASE_URL` already populated. The script reads only that process variable, not `.env` or the previously invalid encrypted migration file. Node 22, the installed dependencies, and PostgreSQL 17 client tools at `C:\Program Files\PostgreSQL\17\bin` are required.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\acain\.codex\worktrees\jobfray-rebuild\scripts\phase6b-initialize.ps1"
```

The execution-policy override applies only to the invoked processes. The launcher selects the repository directory itself. No credential is supplied as a command argument or printed.

## Verification and changes

- Pins the external hostname `dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com`, port 5432, database `jobfray`, owner `jobfray_owner`, PostgreSQL 17, and rejects unexpected URL overrides. Uses libpq `sslmode=verify-full` with an explicit, fingerprint-checked public ISRG Root X1 PEM (`prisma/certs/isrg-root-x1.pem`), then checks server-reported TLS 1.2/1.3 and at least 128-bit encryption on both owner and application connections. Node uses the same explicit root for its credential-free diagnostic. Before initialization, the installed Prisma 5.22 schema engine makes a read-only connection using `sslmode=require&sslaccept=strict` plus an absolute `sslcert` path to that root. Native TLS verifies the hostname. Prisma 5.22 does not support libpq `verify-full` or `sslrootcert`; those values are never passed to its engine. Failure stops execution without weakening verification. The existing generated application URL retains `require&sslaccept=strict`, using the application runtime trust store.
- Compares the exact PostgreSQL catalog to eight migration-boundary fixtures generated from the seven pinned migrations. The Prisma schema checksum is pinned as well; the final fixture was independently compared with `prisma migrate diff` and returned an empty migration. Checks columns, defaults, enums/types, validated constraints and compound foreign keys, expression/partial/geographic/text indexes, enabled triggers, custom function definitions including search paths, directory projection, device revocation and all immutable-history/browser/phone guards. Extension names and schemas are checked. Unknown non-system schemas, foreign servers, event triggers, schema drift, or any application rows stop the run.
- Requires an empty database or an exact completed migration prefix. Validates every ledger name/checksum/completion/step count and rejects incomplete, rolled-back, unexpected or failed entries. Does not run reset, db push, seed, automatic repair or synthetic production writes.
- Runs the pending committed migration SQL, Prisma-compatible ledger entries, restricted role creation, grants and final checks in one transaction under an advisory lock. Failure before commit rolls back that transaction. Existing application tables are locked against concurrent writes during the check. No historical migration is edited.
- Creates `jobfray_app` only if absent, with a generated 256-bit password supplied to PostgreSQL as a SCRAM verifier, connection limit 2, no administrative attributes, no inheritance and no roles granted to it. PostgreSQL 17 may retain its automatic creator ADMIN membership for `jobfray_owner`; only that owner-only incoming membership is allowed, with INHERIT and SET disabled. Unexpected existing roles stop execution. Existing passwords are never rotated.
- Grants SELECT/INSERT only for snapshots/events/audits; SELECT/INSERT/UPDATE for requests/refunds and remaining active Jf tables; DELETE only for sessions, tokens, rate buckets, media and the directory projection. Grants invoker function/type access needed for directory/device triggers. Denies legacy tables, ledger, ownership, schema/database creation, temporary tables, sequences, TRUNCATE, REFERENCES, TRIGGER, column grants and grant options. Checks effective PUBLIC/inherited privileges and unsafe default ACLs. Revokes PUBLIC schema CREATE and database TEMP on this dedicated database. It does not change server connection limits or hosting plans.
- Verifies the application password by making a fresh TLS-verified application login and repeating effective permission checks. Prints only fixed status messages and connection/memory capacity observations. Starts with one shared PrismaClient, pool 2; keep initial combined application pools at four or fewer, subject to the observed connection budget. Insufficient free slots or a database limit below six stops initialization.

The SQL connection establishes the authorized hostname/service-ID binding, database/user/version and TLS. It cannot independently prove the Render dashboard label `jobfray-db`, compute size, physical region, plan or recovery settings. Those remain owner/dashboard acceptance items. Production backup and isolated restore still need separate authorization; this script does neither.

## Secret handoff and reruns

After successful read-only preflight, the URL is written to `%LOCALAPPDATA%\JobFray\phase6b-app-url.enc` using Windows DPAPI for the executing Windows account. Creation is exclusive, the encrypted file is flushed and decrypted back for comparison before database mutation. The helper uses a private redirected pipe and refuses direct interactive output. No plaintext secret file is created.

After all database checks pass, the launcher copies the application URL to the clipboard. Paste it into the approved secure destination, then press Enter; the launcher clears its clipboard value in `finally`. The DPAPI file remains available for recovery and later reruns under the same Windows account. This handoff does not authorize changing Render configuration.

Rerun the same command after an interruption. The script rechecks identity/TLS/catalog/ledger/emptiness, skips completed migrations, and reuses the protected credential. A committed role without the matching decryptable protected credential stops before mutation; do not delete that file or rotate passwords automatically. A failed protected-file write before database mutation may require owner repair of that local file. After application traffic begins, the nonempty-database guard intentionally prevents this initialization script from being reused as a deployment migrator.

Before initialization, sequential read-only diagnostics report credential availability, URL parsing and the authorized target, DNS resolution, TCP port 5432, PostgreSQL SSLRequest/TLS certificate and hostname validation, PostgreSQL authentication using libpq verify-full/system trust, database identity/PostgreSQL 17, the catalog query, and server availability of cube, earthdistance and pg_trgm. Each stage reports checking/passed or its exact failure, sanitized message and applicable OS code, SQLSTATE, exit status or signal. Later database/helper child failures also preserve sanitized diagnostics. Passwords, connection URLs and SCRAM verifiers are redacted. A failure stops dependent work without repair. Node certificate trust and libpq system trust are independently checked; neither validation is bypassed. Extension availability is read-only and does not prove installation privileges; the existing atomic migration checks remain authoritative. A connection/trust/process failure may provide only a sanitized connection/process error. A failed application login or clipboard handoff can happen after the database transaction committed; retain the protected credential and rerun rather than resetting the database.

## Validation evidence

- 15 mocked tests cover URL identity/override rejection, checksum drift, fail-closed SQL assertions, privilege policy, secret ordering/non-disclosure, interruptions, missing protected credentials, SCRAM derivation and the direct CLI entry point with no migration environment variable. One additional Windows test exercises actual DPAPI persistence and recovery using only a synthetic test secret in an isolated test directory.
- Isolated loopback PostgreSQL 17 tests cover all seven migrations, atomic rollback before role creation, all six partial migration prefixes, completed reruns, real SCRAM login/wrong-password rejection, effective application privileges, unexpected data, function tampering and ledger corruption rejection. Prisma reports an empty schema diff.
- TLS and managed Render permission to install `earthdistance` are mocked only in the local harness. Neither has been remotely verified. The production script has no test bypass or environment switch for either check.
- All 16 tests passed. Repository strict TypeScript checking and targeted ESLint checks passed. Both PowerShell scripts passed the Windows PowerShell AST parser. The final local SQL harness passed and its cluster was stopped. No remote or provider integration tests are claimed.

Fixtures: `scripts/phase6b/baseline.json`; production implementation: `scripts/phase6b/initialize.ts`; launcher: `scripts/phase6b-initialize.ps1`; mocked tests: `tests/phase6b-initialize.test.ts`. Local SQL evidence is in ignored `artifacts/phase6b-local-verification.json`. The fixture builder and local harness are development tools, not owner production entry points.

## TLS trust remediation (local verification)

Installed psql and libpq: 17.10; bundled OpenSSL: 3.0.21; Node: 22.20.0;
Prisma: 5.22.0. `PGSSLROOTCERT`, `SSL_CERT_FILE`, and `SSL_CERT_DIR` were unset
in the inspected process. The driver previously overrode `PGSSLROOTCERT=system`.
The installed OpenSSL library reports default paths
`C:\Program Files\Common Files\SSL/cert.pem` and
`C:\Program Files\Common Files\SSL/certs`; neither exists.
`%APPDATA%\postgresql\root.crt` is also absent. Node's bundled Mozilla roots
include ISRG Root X1, explaining why its earlier diagnostic succeeded.
The driver continues to allowlist child environment variables, excluding inherited
PG settings and SSL overrides, and supplies the explicit CA path itself.

The PEM is a public trust anchor extracted from Node's existing trusted root set;
its fingerprint and validity are checked before use. No runtime CA download,
server-leaf trust, credential transfer, or Windows trust-store edit is required.
Render documents public Let's Encrypt certificates for external connections:
[Render connection guidance](https://render.com/tutorials/postgres-on-render/connection-strings).
See [ISRG chains](https://letsencrypt.org/certificates/) and
[libpq verification](https://www.postgresql.org/docs/17/libpq-ssl.html).
Prisma parameter behavior was checked against the
[5.22 parser](https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/url.rs)
and [native TLS implementation](https://github.com/prisma/prisma-engines/blob/5.22.0/quaint/src/connector/postgres/native/mod.rs).

Local validation: 28 tests passed, strict TypeScript and targeted ESLint passed.
`node scripts/phase6b/local-tls-verification.mjs` exercised the installed psql and
Prisma schema engine against a loopback PostgreSQL TLS protocol fixture with
synthetic credentials and certificates. Both accepted a trusted chain, rejected
an untrusted chain, and rejected a hostname mismatch before StartupMessage.
The fixture closes after startup and never authenticates or executes SQL.
Windows Schannel and tsx required running these local tests outside the restricted
sandbox; initial sandbox failures are not database or certificate failures.
No remote chain or remote database operation was tested by Codex. The unchanged
owner command above performs the live verification before initialization.
