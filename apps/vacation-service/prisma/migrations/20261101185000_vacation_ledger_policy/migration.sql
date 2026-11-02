-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "departmentId" UUID,
ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Outbox" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "cancelApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leapDay" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reservePending" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "serviceYear" INTEGER NOT NULL,
    "cycleStart" DATE NOT NULL,
    "granted" INTEGER NOT NULL DEFAULT 15,
    "policyId" TEXT NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "serviceYear" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacationAudit" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "employeeId" UUID,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_employeeId_serviceYear_key" ON "Entitlement"("employeeId", "serviceYear");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_requestId_serviceYear_kind_key" ON "Movement"("requestId", "serviceYear", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_requestKey_key" ON "LeaveRequest"("requestKey");

