-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "issuedAt" TIMESTAMPTZ,
ADD COLUMN     "originalId" UUID,
ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ContractAudit" (
    "id" UUID NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractPolicy" (
    "id" UUID NOT NULL,
    "allowVoid" BOOLEAN NOT NULL,
    "allowRectification" BOOLEAN NOT NULL,
    "rationale" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractAudit_resourceId_createdAt_idx" ON "ContractAudit"("resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "Contract_employeeId_status_createdAt_idx" ON "Contract"("employeeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_createdBy_requestKey_key" ON "Contract"("createdBy", "requestKey");

