-- CreateTable
CREATE TABLE "PersonnelPolicy" (
    "id" TEXT NOT NULL,
    "allowRetroactiveSalary" BOOLEAN NOT NULL,
    "allowReentry" BOOLEAN NOT NULL,
    "reentryTenure" TEXT NOT NULL,
    "compensationPoint" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonnelPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentPeriod" (
    "id" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE,
    "actor" TEXT NOT NULL,

    CONSTRAINT "EmploymentPeriod_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EmploymentPeriod" ADD CONSTRAINT "EmploymentPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "EmploymentPeriod" (id,"employeeId","startsAt","endsAt",actor)
SELECT gen_random_uuid()::text,id,"hiredAt","terminatedAt",'migration' FROM "Employee";
