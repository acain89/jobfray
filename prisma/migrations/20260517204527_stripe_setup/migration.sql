-- DropIndex
DROP INDEX "Worker_stripeCustomerId_key";

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "billingFailureReason" TEXT,
ADD COLUMN     "billingSuspendedAt" TIMESTAMP(3),
ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "cardVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "stripePaymentMethodId" TEXT;
