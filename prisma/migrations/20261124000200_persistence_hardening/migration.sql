-- Reject SQL NULL bypasses and mismatches between relational and document projections.
ALTER TABLE "JfRequest" DROP CONSTRAINT "JfRequest_quote_schedule_check";
ALTER TABLE "JfRequest" ADD CONSTRAINT "JfRequest_quote_schedule_check" CHECK ((("mode"='QUOTE' AND "document" ? 'start' AND "document" ? 'end' AND "document"->>'start' IS NULL AND "document"->>'end' IS NULL) OR ("mode"<>'QUOTE' AND ("document"->>'start')::timestamptz < ("document"->>'end')::timestamptz)) IS TRUE);
ALTER TABLE "JfCheckoutSnapshot" DROP CONSTRAINT "JfSnapshot_identity_check";
ALTER TABLE "JfCheckoutSnapshot" ADD CONSTRAINT "JfSnapshot_identity_check" CHECK (("document"->>'recipient'='JOBFRAY' AND "document"->>'processingCostPayer'='JOBFRAY' AND "document"->>'currency'='USD' AND ("document"->>'platformFeeCents')::int="platformFeeCents" AND "document"->>'pricingPolicyVersion'="pricingPolicyVersion" AND "document" ? 'underlyingSubtotalCents' AND ("document"->>'underlyingSubtotalCents')::bigint IS NOT DISTINCT FROM "underlyingSubtotalCents") IS TRUE);
CREATE FUNCTION jf_validate_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text;
BEGIN
  FOREACH field IN ARRAY TG_ARGV LOOP
    IF NOT (NEW.document ? field) OR NEW.document->field IS DISTINCT FROM to_jsonb(NEW)->field THEN
      RAISE EXCEPTION 'JobFray document projection mismatch: %',field USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER jf_request_projection BEFORE INSERT OR UPDATE ON "JfRequest" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('businessId','offeringId','mode','status','idempotencyKey','payloadHash');
CREATE TRIGGER jf_resource_projection BEFORE INSERT OR UPDATE ON "JfResource" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('businessId','capacity');
CREATE TRIGGER jf_business_projection BEFORE INSERT OR UPDATE ON "JfBusiness" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('ownerId','slug','status');
CREATE TRIGGER jf_allocation_projection BEFORE INSERT OR UPDATE ON "JfAllocation" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('businessId','resourceId','requestId','units','status');
CREATE INDEX "JfSession_expiresAt_idx" ON "JfSession" ("expiresAt");
CREATE INDEX "JfToken_expiresAt_idx" ON "JfToken" ("expiresAt");
CREATE INDEX "JfMedia_expiresAt_idx" ON "JfMedia" ("expiresAt");
CREATE INDEX "JfRequest_expiry_idx" ON "JfRequest" ("status",("document"->>'expiresAt'));
CREATE INDEX "JfRequest_confirmed_idx" ON "JfRequest" ("businessId","id") WHERE "document"->>'confirmedAt' IS NOT NULL;
CREATE INDEX "JfMedia_owner_idx" ON "JfMedia" ("businessId",("document"->>'ownerId'));
CREATE INDEX "JfMedia_proof_idx" ON "JfMedia" ("businessId",("document"->>'proofHash'));

CREATE INDEX "JfRequest_history_idx" ON "JfRequest" ("businessId",("document"->>'createdAt') DESC,"id" DESC) WHERE "document"->>'confirmedAt' IS NOT NULL;

CREATE INDEX "JfRequest_photos_idx" ON "JfRequest" USING GIN (("document"->'photos')) WHERE "document"->>'confirmedAt' IS NOT NULL;

CREATE TRIGGER jf_account_projection BEFORE INSERT OR UPDATE ON "JfAccount" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('email');
CREATE TRIGGER jf_session_projection BEFORE INSERT OR UPDATE ON "JfSession" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('accountId','tokenHash');
CREATE TRIGGER jf_token_projection BEFORE INSERT OR UPDATE ON "JfToken" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('hash','purpose');
CREATE TRIGGER jf_offering_projection BEFORE INSERT OR UPDATE ON "JfOffering" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('businessId','resourceId');
CREATE TRIGGER jf_event_projection BEFORE INSERT OR UPDATE ON "JfPaymentEvent" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('businessId','requestId','providerId');
CREATE TRIGGER jf_outbox_projection BEFORE INSERT OR UPDATE ON "JfOutbox" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('businessId','key','state');
CREATE TRIGGER jf_refund_projection BEFORE INSERT OR UPDATE ON "JfRefund" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('businessId','requestId','paymentId','state');
CREATE FUNCTION jf_preserve_request_facts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mutable_fields text[] := ARRAY['status','payment','paymentIntentId','confirmedAt','priceLabel','refundReason','settledPaymentId'];
BEGIN
  IF NEW.document - mutable_fields IS DISTINCT FROM OLD.document - mutable_fields
    OR (OLD.document->>'paymentIntentId' IS NOT NULL AND NEW.document->>'paymentIntentId' IS DISTINCT FROM OLD.document->>'paymentIntentId')
    OR (OLD.document->>'settledPaymentId' IS NOT NULL AND NEW.document->>'settledPaymentId' IS DISTINCT FROM OLD.document->>'settledPaymentId')
    OR (OLD.document->>'confirmedAt' IS NOT NULL AND (NEW.document->>'confirmedAt' IS DISTINCT FROM OLD.document->>'confirmedAt' OR NEW.document->>'priceLabel' IS DISTINCT FROM OLD.document->>'priceLabel'))
  THEN RAISE EXCEPTION 'Immutable JobFray request facts cannot be changed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jf_request_facts BEFORE UPDATE ON "JfRequest" FOR EACH ROW EXECUTE FUNCTION jf_preserve_request_facts();
CREATE FUNCTION jf_preserve_allocation_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.document - ARRAY['status','expiresAt'] IS DISTINCT FROM OLD.document - ARRAY['status','expiresAt']
    OR (OLD.status<>'HELD' AND NEW.status='HELD')
  THEN RAISE EXCEPTION 'Immutable JobFray allocation facts cannot be changed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jf_allocation_facts BEFORE UPDATE ON "JfAllocation" FOR EACH ROW EXECUTE FUNCTION jf_preserve_allocation_facts();

CREATE FUNCTION jf_validate_time_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text;
BEGIN
  FOREACH field IN ARRAY TG_ARGV LOOP
    IF NOT (NEW.document ? field) OR (NEW.document->>field)::timestamptz IS DISTINCT FROM (to_jsonb(NEW)->>field)::timestamptz THEN
      RAISE EXCEPTION 'JobFray timestamp projection mismatch: %',field USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER jf_allocation_times BEFORE INSERT OR UPDATE ON "JfAllocation" FOR EACH ROW EXECUTE FUNCTION jf_validate_time_projection('start','end','expiresAt');
CREATE TRIGGER jf_session_times BEFORE INSERT OR UPDATE ON "JfSession" FOR EACH ROW EXECUTE FUNCTION jf_validate_time_projection('expiresAt');
CREATE TRIGGER jf_token_times BEFORE INSERT OR UPDATE ON "JfToken" FOR EACH ROW EXECUTE FUNCTION jf_validate_time_projection('expiresAt');
CREATE TRIGGER jf_outbox_times BEFORE INSERT OR UPDATE ON "JfOutbox" FOR EACH ROW EXECUTE FUNCTION jf_validate_time_projection('availableAt');
CREATE TRIGGER jf_media_times BEFORE INSERT OR UPDATE ON "JfMedia" FOR EACH ROW EXECUTE FUNCTION jf_validate_time_projection('expiresAt');
CREATE TRIGGER jf_rate_times BEFORE INSERT OR UPDATE ON "JfRateBucket" FOR EACH ROW EXECUTE FUNCTION jf_validate_time_projection('expiresAt');
