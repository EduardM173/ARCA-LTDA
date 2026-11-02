ALTER TABLE "Payment" ADD COLUMN "paymentMode" TEXT,
 ADD COLUMN "paidBy" TEXT,
 ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "revisionOf" UUID,
 ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "voidReason" TEXT,
 ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
DROP INDEX "Payment_employeeId_period_key";
CREATE UNIQUE INDEX "Payment_employeeId_period_revision_key" ON "Payment"("employeeId","period","revision");
CREATE TABLE "Concept" (
 "id" UUID NOT NULL,
 "name" TEXT NOT NULL,
 "type" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Concept_name_key" ON "Concept"("name");
CREATE TABLE "PaymentAudit" (
 "id" UUID NOT NULL,
 "paymentId" TEXT,
 "actor" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "data" JSONB NOT NULL,
 "requestId" TEXT,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PaymentAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentAudit_paymentId_createdAt_idx" ON "PaymentAudit"("paymentId","createdAt");
CREATE TABLE "PaymentPolicy" (
 "id" UUID NOT NULL,
 "allowVoid" BOOLEAN NOT NULL,
 "allowCorrections" BOOLEAN NOT NULL,
 "reason" TEXT NOT NULL,
 "approvedBy" TEXT NOT NULL,
 "approvedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PaymentPolicy_pkey" PRIMARY KEY ("id")
);
