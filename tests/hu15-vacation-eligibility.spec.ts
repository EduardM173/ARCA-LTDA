import assert from 'node:assert/strict';
import { VacationsService } from '../apps/vacation-service/src/vacations.service';
import { businessToday, date } from '../packages/platform/src/http';

function createMockService(employeeData: any, policyData: any = { id: 'pol-1', counting: 'CALENDAR', carryover: true, leapDay: 'FEB28', reservePending: false }) {
  const mockPrisma: any = {
    policy: {
      findFirst: async () => policyData,
    },
    entitlement: {
      upsert: async ({ create }: any) => ({ ...create, granted: 15 }),
    },
    movement: {
      aggregate: async () => ({ _sum: { days: 0 } }),
      count: async () => 1,
    },
    leaveRequest: {
      findMany: async () => [],
      aggregate: async () => ({ _sum: { days: 0 } }),
      count: async () => 0,
    },
  };

  const service = new VacationsService(mockPrisma);
  service.getEmployeeData = async () => employeeData;
  return service;
}

async function runTests() {
  console.log('--- Running HU-15 Vacation Eligibility Unit Tests ---');

  // Test Case T05: Sin ratificación no genera derecho vacacional
  {
    const today = businessToday();
    const hireDate = new Date(date(today).getTime() - 400 * 86400000).toISOString().slice(0, 10);
    const service = createMockService({
      id: 'emp-001',
      departmentId: 'dep-001',
      status: 'ACTIVO',
      hiredAt: hireDate,
      ratifiedAt: null, // No ratificado
      version: 1,
    });

    const res = await service.checkEligibility('emp-001');
    assert.equal(res.isEligible, false, 'T05: isEligible must be false');
    assert.equal(res.eligible, false, 'T05: eligible must be false');
    assert.equal(res.availableDays, 0, 'T05: availableDays must be 0');
    assert.equal(res.available, 0, 'T05: available must be 0');
    assert.equal(res.reason, 'El funcionario no ha sido ratificado previamente', 'T05: reason check');
    assert.equal(res.periods.length, 0, 'T05: periods must be empty');
    console.log('PASS: T05 - Funcionario sin ratificación previa no es elegible.');
  }

  // Test Case T06: Ratificado con menos de 365 días de antigüedad
  {
    const today = businessToday();
    const hireDate = new Date(date(today).getTime() - 180 * 86400000).toISOString().slice(0, 10);
    const service = createMockService({
      id: 'emp-002',
      departmentId: 'dep-001',
      status: 'ACTIVO',
      hiredAt: hireDate,
      ratifiedAt: hireDate, // Ratificado pero con 180 días (< 365)
      version: 1,
    });

    const res = await service.checkEligibility('emp-002');
    assert.equal(res.isEligible, false, 'T06: isEligible must be false');
    assert.equal(res.eligible, false, 'T06: eligible must be false');
    assert.equal(res.availableDays, 0, 'T06: availableDays must be 0');
    assert.equal(res.available, 0, 'T06: available must be 0');
    assert.equal(res.reason, 'No ha completado una gestión de 365 días', 'T06: reason check');
    assert.equal(res.periods.length, 0, 'T06: periods must be empty');
    console.log('PASS: T06 - Funcionario ratificado con antigüedad < 365 días no es elegible.');
  }

  // Test Case T07: Ratificado con antigüedad >= 365 días genera 15 días por gestión
  {
    const today = businessToday();
    const hireDate = new Date(date(today).getTime() - 400 * 86400000).toISOString().slice(0, 10);
    const service = createMockService({
      id: 'emp-003',
      departmentId: 'dep-001',
      status: 'ACTIVO',
      hiredAt: hireDate,
      ratifiedAt: hireDate, // Ratificado y >= 365 días
      version: 1,
    });

    const res = await service.checkEligibility('emp-003');
    assert.equal(res.isEligible, true, 'T07: isEligible must be true');
    assert.equal(res.eligible, true, 'T07: eligible must be true');
    assert.equal(res.availableDays, 15, 'T07: availableDays must be 15 for 1 completed gestión');
    assert.equal(res.available, 15, 'T07: available must be 15');
    assert.equal(res.reason, null, 'T07: reason must be null');
    assert.equal(res.periods.length, 1, 'T07: periods must contain 1 gestión');
    assert.equal(res.periods[0].period, 1);
    assert.equal(res.periods[0].days, 15);
    console.log('PASS: T07 - Funcionario ratificado con 1 gestión completa genera 15 días.');
  }

  // Test Case: Funcionario ratificado con 2 gestiones (>= 730 días) genera 30 días
  {
    const today = businessToday();
    const hireDate = new Date(date(today).getTime() - 750 * 86400000).toISOString().slice(0, 10);
    const service = createMockService({
      id: 'emp-004',
      departmentId: 'dep-001',
      status: 'ACTIVO',
      hiredAt: hireDate,
      ratifiedAt: hireDate,
      version: 1,
    });

    const res = await service.checkEligibility('emp-004');
    assert.equal(res.isEligible, true);
    assert.equal(res.availableDays, 30, '2 completed gestiones must generate 30 days');
    assert.equal(res.periods.length, 2, 'periods must contain 2 gestiones');
    assert.equal(res.periods[0].period, 1);
    assert.equal(res.periods[0].days, 15);
    assert.equal(res.periods[1].period, 2);
    assert.equal(res.periods[1].days, 15);
    console.log('PASS: Funcionario con 2 gestiones completadas acumula 30 días con desglose de 2 periodos.');
  }

  // Test Case: Funcionario en estado BAJA
  {
    const service = createMockService({
      id: 'emp-005',
      departmentId: 'dep-001',
      status: 'BAJA',
      hiredAt: '2020-01-01',
      ratifiedAt: '2020-01-01',
      version: 1,
    });

    const res = await service.checkEligibility('emp-005');
    assert.equal(res.isEligible, false);
    assert.equal(res.reason, 'Funcionario dado de baja');
    assert.equal(res.availableDays, 0);
    console.log('PASS: Funcionario dado de baja no es elegible.');
  }

  console.log('All HU-15 unit tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
