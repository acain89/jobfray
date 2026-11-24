-- REVIEW ONLY. Run only with the additive DDL in a separately authorized disposable database.
-- These database-specific statements have NOT been executed or validated against PostgreSQL.
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
