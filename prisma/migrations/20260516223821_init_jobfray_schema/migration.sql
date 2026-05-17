-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('PENDING_PHONE', 'PENDING_SUBSCRIPTION', 'PENDING_IDENTITY', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'DELETED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('JOB', 'FREE_STUFF');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PENDING_PHONE', 'LIVE', 'MATCHED', 'COMPLETED', 'EXPIRED', 'DELETED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "NeedBy" AS ENUM ('ASAP', 'TODAY', 'TOMORROW', 'THIS_WEEK', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('INTERESTED', 'COUNTERED', 'SELECTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('NO_SHOW', 'SPAM', 'FAKE_POST', 'HARASSMENT', 'UNSAFE', 'PAYMENT_DISPUTE', 'OTHER');

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastInitial" TEXT,
    "phone" TEXT NOT NULL,
    "homeZip" TEXT NOT NULL,
    "profilePhotoUrl" TEXT,
    "status" "WorkerStatus" NOT NULL DEFAULT 'PENDING_PHONE',
    "phoneVerifiedAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionActive" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
    "stripeIdentitySessionId" TEXT,
    "identityVerifiedAt" TIMESTAMP(3),
    "identityExpiresAt" TIMESTAMP(3),
    "identityRetentionDeleteAt" TIMESTAMP(3),
    "ratingAverage" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "completedJobCount" INTEGER NOT NULL DEFAULT 0,
    "noShowReportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerServiceArea" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "radiusMiles" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosterContact" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosterContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'PENDING_PHONE',
    "posterContactId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payAmountCents" INTEGER,
    "needBy" "NeedBy",
    "zip" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "exactAddress" TEXT,
    "privateLatitude" DECIMAL(10,7),
    "privateLongitude" DECIMAL(10,7),
    "publicLatitude" DECIMAL(10,7),
    "publicLongitude" DECIMAL(10,7),
    "posterPhoneUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "selectedWorkerId" TEXT,
    "selectedAt" TIMESTAMP(3),
    "managementTokenHash" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPhoto" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInterest" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "InterestStatus" NOT NULL DEFAULT 'INTERESTED',
    "counterAmountCents" INTEGER,
    "counterMessage" VARCHAR(200),
    "counterSubmittedAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "filedByWorkerId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsVerification" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Worker_username_key" ON "Worker"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_phone_key" ON "Worker"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_stripeCustomerId_key" ON "Worker"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_stripeSubscriptionId_key" ON "Worker"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_stripeIdentitySessionId_key" ON "Worker"("stripeIdentitySessionId");

-- CreateIndex
CREATE INDEX "Worker_status_idx" ON "Worker"("status");

-- CreateIndex
CREATE INDEX "Worker_homeZip_idx" ON "Worker"("homeZip");

-- CreateIndex
CREATE INDEX "Worker_subscriptionActive_idx" ON "Worker"("subscriptionActive");

-- CreateIndex
CREATE INDEX "WorkerServiceArea_zip_idx" ON "WorkerServiceArea"("zip");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerServiceArea_workerId_zip_key" ON "WorkerServiceArea"("workerId", "zip");

-- CreateIndex
CREATE INDEX "PosterContact_phone_idx" ON "PosterContact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Post_managementTokenHash_key" ON "Post"("managementTokenHash");

-- CreateIndex
CREATE INDEX "Post_type_status_createdAt_idx" ON "Post"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Post_zip_status_createdAt_idx" ON "Post"("zip", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Post_categoryId_status_idx" ON "Post"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Post_expiresAt_idx" ON "Post"("expiresAt");

-- CreateIndex
CREATE INDEX "Post_selectedWorkerId_idx" ON "Post"("selectedWorkerId");

-- CreateIndex
CREATE INDEX "PostPhoto_postId_sortOrder_idx" ON "PostPhoto"("postId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobInterest_workerId_status_idx" ON "JobInterest"("workerId", "status");

-- CreateIndex
CREATE INDEX "JobInterest_postId_status_idx" ON "JobInterest"("postId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobInterest_postId_workerId_key" ON "JobInterest"("postId", "workerId");

-- CreateIndex
CREATE INDEX "Review_workerId_idx" ON "Review"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_postId_workerId_key" ON "Review"("postId", "workerId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reason_idx" ON "Report"("reason");

-- CreateIndex
CREATE INDEX "SmsVerification_phone_purpose_idx" ON "SmsVerification"("phone", "purpose");

-- CreateIndex
CREATE INDEX "SmsVerification_expiresAt_idx" ON "SmsVerification"("expiresAt");

-- AddForeignKey
ALTER TABLE "WorkerServiceArea" ADD CONSTRAINT "WorkerServiceArea_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_posterContactId_fkey" FOREIGN KEY ("posterContactId") REFERENCES "PosterContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPhoto" ADD CONSTRAINT "PostPhoto_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInterest" ADD CONSTRAINT "JobInterest_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInterest" ADD CONSTRAINT "JobInterest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_filedByWorkerId_fkey" FOREIGN KEY ("filedByWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
