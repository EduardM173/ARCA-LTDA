-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "earnings" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "createdBy" TEXT NOT NULL,
    "fileHash" TEXT,
    "paymentDate" DATE,
    "paymentReference" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_employeeId_period_key" ON "Payment"("employeeId", "period");

