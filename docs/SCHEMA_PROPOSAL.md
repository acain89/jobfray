# Additive Prisma proposal ? not applied

Active schema: `prisma/schema.prisma`. It retains all historical enums and models:
Worker, WorkerServiceArea, PosterContact, Category, Post, PostPhoto, JobInterest,
Review, Report, SmsVerification and WorkerInterest. The only active-schema edit
is `url = env("DATABASE_URL")` for Prisma 5. No Prisma 7 config/driver adapter or
seed hook remains; nothing instantiates a Prisma client in application code.

`prisma/proposals/rebuild.prisma` is a separately validated standalone proposal.
It is deliberately outside `prisma/migrations` and is NOT a replacement active
schema. It adds prefixed models to avoid reinterpreting or colliding with legacy
Post/Worker/Category data:

| Area            | Proposed models                             |
| --------------- | ------------------------------------------- |
| Tenancy         | JfOwner, JfBusiness, JfMembership           |
| Publishing      | JfWebsite, JfDomain                         |
| Discovery       | JfCategory, JfService, JfServiceArea        |
| Availability    | JfAvailabilityRule, JfAvailabilityException |
| Requests        | JfBooking, JfQuoteRequest                   |
| Platform fees   | JfFeeOrder, JfPaymentEvent                  |
| Owner workspace | JfJob, JfNotification                       |

Business-owned child references use composite foreign keys where they reference
another business-owned record. Restrict deletion for financial/history retention;
there are no cascading deletes. Exact hostnames are unique and unverified by
default. Fee orders have immutable-correlation candidates and globally unique
idempotency/provider references. No connected-account destination exists.

## Later migration strategy (separate approval required)

1. Establish the actual target database identity, applied migration history,
   existing data/constraints and a verified backup/restore plan without exposing
   customer data. No such database access was performed for this foundation.
2. Retain all three historical migration SQL files and their lock unchanged.
   Do not rebaseline, reset, use `db push`, or migrate this standalone proposal.
3. Finalize ownership/authentication, booking/payment semantics and schema design.
   Merge approved new models into the retained active schema. Generate a NEW
   additive migration on an independently verified disposable PostgreSQL instance.
4. Add/review database constraints not expressible here: positive duration/capacity,
   nonnegative buffers, weekday/window ranges, startsAt < endsAt, exactly one
   quote/booking target matching fee purpose, fee cents 300/500 and USD/JobFray
   recipient, and exactly one matching source for a job. Validate JSON exception
   windows and IANA time zones at the API boundary. Do not mistake Prisma validate
   for validation of these missing runtime/database invariants.
5. Define the concurrency lock strategy before booking writes. A fee-order unique
   key alone does not prevent overlapping capacity reservations or confirm a paid
   appointment. Verify transactions, retries, idempotency and state ordering.
6. Test the additive migration and old/new client compatibility against isolated
   copies/fixtures. Review generated SQL for drops, alters of legacy columns,
   cascades and data rewrites. None is authorized in this task.
7. Apply only after explicit release approval. Keep new tables during application
   rollback; never use a destructive down migration or erase live records.

Existing billing/identity/provider obligations need inventory before replacing the
old production application. The new app does not cancel or service those external
obligations. Prisma 5 validation/generation proves local schema compatibility,
not production drift, provider state or full database compatibility.
