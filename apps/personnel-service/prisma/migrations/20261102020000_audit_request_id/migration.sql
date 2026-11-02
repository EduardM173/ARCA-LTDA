ALTER TABLE "EmploymentEvent" ADD COLUMN "requestId" TEXT;
CREATE INDEX "EmploymentEvent_requestId_idx" ON "EmploymentEvent"("requestId");
