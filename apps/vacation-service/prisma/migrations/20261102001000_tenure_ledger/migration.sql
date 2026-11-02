-- DropIndex
DROP INDEX "Entitlement_employeeId_serviceYear_key";

-- AlterTable
ALTER TABLE "Entitlement" ADD COLUMN     "tenureKey" TEXT NOT NULL DEFAULT 'legacy';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "tenureKey" TEXT NOT NULL DEFAULT 'legacy';

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "tenureKey" TEXT NOT NULL DEFAULT 'legacy';

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_employeeId_tenureKey_serviceYear_key" ON "Entitlement"("employeeId", "tenureKey", "serviceYear");

