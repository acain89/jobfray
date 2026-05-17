-- CreateEnum
CREATE TYPE "WorkerInterestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "WorkerInterest" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "WorkerInterestStatus" NOT NULL DEFAULT 'PENDING',
    "offeredAmountCents" INTEGER,
    "message" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerInterest_postId_status_idx" ON "WorkerInterest"("postId", "status");

-- CreateIndex
CREATE INDEX "WorkerInterest_workerId_status_idx" ON "WorkerInterest"("workerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerInterest_postId_workerId_key" ON "WorkerInterest"("postId", "workerId");

-- AddForeignKey
ALTER TABLE "WorkerInterest" ADD CONSTRAINT "WorkerInterest_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerInterest" ADD CONSTRAINT "WorkerInterest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
