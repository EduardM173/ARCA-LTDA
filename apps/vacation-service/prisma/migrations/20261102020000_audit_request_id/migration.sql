ALTER TABLE "VacationAudit" ADD COLUMN "requestId" TEXT;
CREATE INDEX "VacationAudit_requestId_idx" ON "VacationAudit"("requestId");
