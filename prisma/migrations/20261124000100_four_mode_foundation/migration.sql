-- REVIEW ONLY. Generated offline; never applied. Requires isolated-database verification.
-- CreateEnum
CREATE TYPE "JfBusinessMode" AS ENUM ('RENTAL', 'SERVICE', 'QUOTE', 'RESERVATION');

-- CreateEnum
CREATE TYPE "JfFulfillment" AS ENUM ('MOBILE', 'STOREFRONT');

-- CreateTable
CREATE TABLE "JfAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfToken" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfBusiness" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfOffering" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "resourceId" TEXT,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfResource" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfAllocation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "start" TIMESTAMPTZ(3) NOT NULL,
    "end" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "document" JSONB NOT NULL,

    CONSTRAINT "JfAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfCheckoutSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "underlyingSubtotalCents" BIGINT,
    "pricingPolicyVersion" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfCheckoutSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfPaymentEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfOutbox" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfMedia" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "document" JSONB NOT NULL,

    CONSTRAINT "JfMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfAudit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "requestId" TEXT,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfRateBucket" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfRateBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfRefund" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JfAccount_email_key" ON "JfAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "JfSession_tokenHash_key" ON "JfSession"("tokenHash");

-- CreateIndex
CREATE INDEX "JfSession_accountId_expiresAt_idx" ON "JfSession"("accountId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JfToken_hash_key" ON "JfToken"("hash");

-- CreateIndex
CREATE INDEX "JfToken_purpose_expiresAt_idx" ON "JfToken"("purpose", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JfBusiness_ownerId_key" ON "JfBusiness"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "JfBusiness_slug_key" ON "JfBusiness"("slug");

-- CreateIndex
CREATE INDEX "JfBusiness_status_idx" ON "JfBusiness"("status");

-- CreateIndex
CREATE UNIQUE INDEX "JfOffering_businessId_id_key" ON "JfOffering"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JfResource_businessId_id_key" ON "JfResource"("businessId", "id");

-- CreateIndex
CREATE INDEX "JfRequest_businessId_status_idx" ON "JfRequest"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JfRequest_businessId_id_key" ON "JfRequest"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JfRequest_businessId_idempotencyKey_key" ON "JfRequest"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "JfAllocation_businessId_resourceId_start_end_status_idx" ON "JfAllocation"("businessId", "resourceId", "start", "end", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JfAllocation_businessId_requestId_resourceId_key" ON "JfAllocation"("businessId", "requestId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JfCheckoutSnapshot_businessId_requestId_key" ON "JfCheckoutSnapshot"("businessId", "requestId");

-- CreateIndex
CREATE INDEX "JfPaymentEvent_providerId_idx" ON "JfPaymentEvent"("providerId");

-- CreateIndex
CREATE INDEX "JfPaymentEvent_businessId_requestId_idx" ON "JfPaymentEvent"("businessId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "JfOutbox_key_key" ON "JfOutbox"("key");

-- CreateIndex
CREATE INDEX "JfOutbox_state_availableAt_idx" ON "JfOutbox"("state", "availableAt");

-- CreateIndex
CREATE INDEX "JfMedia_businessId_expiresAt_idx" ON "JfMedia"("businessId", "expiresAt");

-- CreateIndex
CREATE INDEX "JfAudit_businessId_requestId_idx" ON "JfAudit"("businessId", "requestId");

-- CreateIndex
CREATE INDEX "JfRateBucket_expiresAt_idx" ON "JfRateBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "JfRefund_businessId_requestId_idx" ON "JfRefund"("businessId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "JfRefund_businessId_paymentId_key" ON "JfRefund"("businessId", "paymentId");

-- AddForeignKey
ALTER TABLE "JfSession" ADD CONSTRAINT "JfSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "JfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfBusiness" ADD CONSTRAINT "JfBusiness_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "JfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfOffering" ADD CONSTRAINT "JfOffering_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfOffering" ADD CONSTRAINT "JfOffering_businessId_resourceId_fkey" FOREIGN KEY ("businessId", "resourceId") REFERENCES "JfResource"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfResource" ADD CONSTRAINT "JfResource_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_businessId_offeringId_fkey" FOREIGN KEY ("businessId", "offeringId") REFERENCES "JfOffering"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfAllocation" ADD CONSTRAINT "JfAllocation_businessId_requestId_fkey" FOREIGN KEY ("businessId", "requestId") REFERENCES "JfRequest"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfAllocation" ADD CONSTRAINT "JfAllocation_businessId_resourceId_fkey" FOREIGN KEY ("businessId", "resourceId") REFERENCES "JfResource"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfCheckoutSnapshot" ADD CONSTRAINT "JfCheckoutSnapshot_businessId_requestId_fkey" FOREIGN KEY ("businessId", "requestId") REFERENCES "JfRequest"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfPaymentEvent" ADD CONSTRAINT "JfPaymentEvent_businessId_requestId_fkey" FOREIGN KEY ("businessId", "requestId") REFERENCES "JfRequest"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfOutbox" ADD CONSTRAINT "JfOutbox_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfMedia" ADD CONSTRAINT "JfMedia_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfAudit" ADD CONSTRAINT "JfAudit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfAudit" ADD CONSTRAINT "JfAudit_businessId_requestId_fkey" FOREIGN KEY ("businessId", "requestId") REFERENCES "JfRequest"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfRefund" ADD CONSTRAINT "JfRefund_businessId_requestId_fkey" FOREIGN KEY ("businessId", "requestId") REFERENCES "JfRequest"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 4 versioned additive migration; tested only on a disposable local cluster.
-- Preserve historical migrations. Run preflight/backup before any authorized release.
ALTER TABLE "JfBusiness" ADD CONSTRAINT "JfBusiness_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','SUSPENDED'));
ALTER TABLE "JfResource" ADD CONSTRAINT "JfResource_capacity_check" CHECK ("capacity" > 0 AND "capacity" <= 10000);
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_mode_check" CHECK ("mode" IN ('RENTAL','SERVICE','QUOTE','RESERVATION'));
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_state_check" CHECK ("status" IN ('PENDING_PAYMENT','CONFIRMED','DELIVERED','EXPIRED','RELEASED','REFUND_REQUIRED'));
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_quote_schedule_check" CHECK (
  ("mode"='QUOTE' AND "document"->>'start' IS NULL AND "document"->>'end' IS NULL)
  OR ("mode"<>'QUOTE' AND ("document"->>'start')::timestamptz < ("document"->>'end')::timestamptz));
ALTER TABLE "JfAllocation" ADD CONSTRAINT "JfAllocation_interval_check" CHECK ("start" < "end" AND "units" > 0 AND "units" <= 10000);
ALTER TABLE "JfAllocation" ADD CONSTRAINT "JfAllocation_hold_check" CHECK (
  ("status"='HELD' AND "expiresAt" IS NOT NULL) OR ("status" IN ('CONFIRMED','RELEASED') AND "expiresAt" IS NULL));
ALTER TABLE "JfCheckoutSnapshot" ADD CONSTRAINT "JfSnapshot_money_check" CHECK (
  "underlyingSubtotalCents" IS NULL OR "underlyingSubtotalCents" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "JfCheckoutSnapshot" ADD CONSTRAINT "JfSnapshot_identity_check" CHECK (
  "document"->>'recipient'='JOBFRAY' AND "document"->>'processingCostPayer'='JOBFRAY' AND "document"->>'currency'='USD'
  AND ("document"->>'platformFeeCents')::int="platformFeeCents"
  AND "document"->>'pricingPolicyVersion'="pricingPolicyVersion"
  AND ("document"->>'underlyingSubtotalCents')::bigint IS NOT DISTINCT FROM "underlyingSubtotalCents");
ALTER TABLE "JfCheckoutSnapshot" ADD CONSTRAINT "JfSnapshot_fee_policy_v2_check" CHECK (
  "pricingPolicyVersion"='jobfray-platform-fees-v2-2026-11-23' AND "platformFeeCents" = CASE
  WHEN "document"->>'mode'='QUOTE' OR "underlyingSubtotalCents" IS NULL THEN 300
  WHEN "underlyingSubtotalCents" <= 3000 THEN 200 WHEN "underlyingSubtotalCents" <= 7500 THEN 300
  WHEN "underlyingSubtotalCents" <= 15099 THEN 400 ELSE 500 END);
ALTER TABLE "JfOutbox" ADD CONSTRAINT "JfOutbox_state_check" CHECK ("state" IN ('PENDING','SENDING','SENT'));
ALTER TABLE "JfRefund" ADD CONSTRAINT "JfRefund_state_check" CHECK ("state" IN ('REQUIRED','SIMULATED_REFUNDED'));
CREATE UNIQUE INDEX "JfRequest_confirmation_hash_key" ON "JfRequest" (("document"->>'confirmationHash'));
CREATE INDEX "JfToken_subject_purpose_idx" ON "JfToken" (("document"->>'subject'),"purpose");
CREATE INDEX "JfBusiness_directory_idx" ON "JfBusiness" ("status",(("document"->>'directory')::boolean));
CREATE OR REPLACE FUNCTION jf_reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable JobFray history cannot be changed'; END $$;
CREATE TRIGGER jf_snapshot_immutable BEFORE UPDATE OR DELETE ON "JfCheckoutSnapshot" FOR EACH ROW EXECUTE FUNCTION jf_reject_immutable_change();
CREATE TRIGGER jf_event_immutable BEFORE UPDATE OR DELETE ON "JfPaymentEvent" FOR EACH ROW EXECUTE FUNCTION jf_reject_immutable_change();
CREATE TRIGGER jf_audit_immutable BEFORE UPDATE OR DELETE ON "JfAudit" FOR EACH ROW EXECUTE FUNCTION jf_reject_immutable_change();
CREATE OR REPLACE FUNCTION jf_validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_mode text;
BEGIN
  SELECT "mode" INTO STRICT request_mode FROM "JfRequest" WHERE "businessId"=NEW."businessId" AND "id"=NEW."requestId";
  IF request_mode='QUOTE' THEN RAISE EXCEPTION 'Quote requests cannot allocate scheduling capacity'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jf_allocation_mode BEFORE INSERT OR UPDATE ON "JfAllocation" FOR EACH ROW EXECUTE FUNCTION jf_validate_allocation();
-- Advisory tenant locks + SERIALIZABLE transactions are mandatory for all scheduling mutations.
-- Review app-role privileges, JSON validation, policy-version evolution and backup/recovery before release.
ALTER TABLE "JfAccount" ADD CONSTRAINT "JfAccount_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfSession" ADD CONSTRAINT "JfSession_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfToken" ADD CONSTRAINT "JfToken_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfBusiness" ADD CONSTRAINT "JfBusiness_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfOffering" ADD CONSTRAINT "JfOffering_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfResource" ADD CONSTRAINT "JfResource_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfAllocation" ADD CONSTRAINT "JfAllocation_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfCheckoutSnapshot" ADD CONSTRAINT "JfCheckoutSnapshot_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfPaymentEvent" ADD CONSTRAINT "JfPaymentEvent_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfOutbox" ADD CONSTRAINT "JfOutbox_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfMedia" ADD CONSTRAINT "JfMedia_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfAudit" ADD CONSTRAINT "JfAudit_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfRateBucket" ADD CONSTRAINT "JfRateBucket_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfRefund" ADD CONSTRAINT "JfRefund_document_id_check" CHECK (("document"->>'id'="id") IS TRUE);
ALTER TABLE "JfOffering" ADD CONSTRAINT "JfOffering_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);
ALTER TABLE "JfResource" ADD CONSTRAINT "JfResource_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);
ALTER TABLE "JfAllocation" ADD CONSTRAINT "JfAllocation_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);
ALTER TABLE "JfCheckoutSnapshot" ADD CONSTRAINT "JfCheckoutSnapshot_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);
ALTER TABLE "JfPaymentEvent" ADD CONSTRAINT "JfPaymentEvent_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);
ALTER TABLE "JfMedia" ADD CONSTRAINT "JfMedia_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);
ALTER TABLE "JfRefund" ADD CONSTRAINT "JfRefund_document_tenant_check" CHECK (("document"->>'businessId'="businessId") IS TRUE);

CREATE UNIQUE INDEX "JfRequest_reference_key" ON "JfRequest" (("document"->>'reference'));
CREATE TRIGGER jf_request_no_delete BEFORE DELETE ON "JfRequest" FOR EACH ROW EXECUTE FUNCTION jf_reject_immutable_change();
CREATE TRIGGER jf_refund_no_delete BEFORE DELETE ON "JfRefund" FOR EACH ROW EXECUTE FUNCTION jf_reject_immutable_change();
