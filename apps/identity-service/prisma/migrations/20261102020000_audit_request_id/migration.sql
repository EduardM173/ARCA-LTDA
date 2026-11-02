ALTER TABLE "Audit" ADD COLUMN "requestId" TEXT;
CREATE INDEX "Audit_requestId_idx" ON "Audit"("requestId");
