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
