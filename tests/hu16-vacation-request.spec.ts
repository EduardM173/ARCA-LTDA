import assert from 'node:assert/strict';
import { VacationsService } from '../apps/vacation-service/src/vacations.service';
import { businessToday, date } from '../packages/platform/src/http';
import {
  INSUFFICIENT_VACATION_BALANCE,
  OVERLAPPING_VACATION_REQUEST,
} from '../apps/vacation-service/src/dto/leave-request-response.dto';

const POLICY = {
  id: 'policy-hu16',
  counting: 'CALENDAR',
  weekdays: [1, 2, 3, 4, 5],
  holidays: [] as string[],
  carryover: true,
  leapDay: 'FEB28',
  reservePending: false,
  approvedAt: new Date(),
};

function day(offset: number): string {
  const value = date(businessToday());
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    departmentId: '00000000-0000-4000-8000-000000000010',
    status: 'ACTIVO',
    hiredAt: day(-400),
    ratifiedAt: day(-380),
    version: 1,
    ...overrides,
  };
}

function createMockService(employeeData: any, existing: any[] = []) {
  const created: any[] = [];
  const rows = [...existing];
  let sequence = 0;

  const prisma: any = {
    policy: { findFirst: async () => POLICY },
    entitlement: {
      upsert: async ({ create }: any) => ({ ...create, granted: 15 }),
    },
    movement: {
      aggregate: async () => ({ _sum: { days: 0 } }),
      count: async () => 0,
    },
    leaveRequest: {
      findMany: async ({ where }: any) =>
        rows.filter(row => row.employeeId === where.employeeId && row.status === where.status),
      aggregate: async ({ where }: any) => ({
        _sum: {
          days: rows
            .filter(row => row.employeeId === where.employeeId && row.status === 'PENDIENTE')
            .reduce((total, row) => total + row.days, 0),
        },
      }),
      count: async ({ where }: any) =>
        rows.filter(row => {
          if (where.employeeId && row.employeeId !== where.employeeId) return false;
          if (where.status?.in && !where.status.in.includes(row.status)) return false;
          if (where.startsAt?.lte && row.startsAt.getTime() > where.startsAt.lte.getTime()) return false;
          if (where.endsAt?.gte && row.endsAt.getTime() < where.endsAt.gte.getTime()) return false;
          return true;
        }).length,
      create: async ({ data }: any) => {
        sequence += 1;
        const record = {
          id: '00000000-0000-4000-8000-0000000000' + String(sequence).padStart(2, '0'),
          ...data,
          status: data.status || 'PENDIENTE',
          createdAt: new Date(),
        };
        rows.push(record);
        created.push(record);
        return record;
      },
    },
  };

  const service = new VacationsService(prisma);
  service.getEmployeeData = async () => employeeData;
  return { service, created, rows };
}

async function runTests() {
  console.log('--- Running HU-16 Vacation Request Unit Tests ---');

  // PASS: registro exitoso de solicitud válida en estado PENDIENTE.
  {
    const { service, created } = createMockService(employee());
    const startDate = day(10);
    const endDate = day(14);

    const response = await service.createRequest({
      employeeId: '00000000-0000-4000-8000-000000000001',
      startDate,
      endDate,
      reason: 'Viaje familiar planificado',
    });

    assert.ok(response.id, 'PASS: la solicitud debe tener identificador');
    assert.equal(response.employeeId, '00000000-0000-4000-8000-000000000001');
    assert.equal(response.startDate, startDate);
    assert.equal(response.endDate, endDate);
    assert.equal(response.daysRequested, 5);
    assert.equal(response.reason, 'Viaje familiar planificado');
    assert.equal(response.status, 'PENDIENTE');
    assert.ok(response.createdAt, 'PASS: createdAt debe registrarse');
    assert.equal(created.length, 1, 'PASS: debe persistirse exactamente una solicitud');
    assert.equal(created[0].status, 'PENDIENTE', 'PASS: el estado inicial debe ser PENDIENTE');
    console.log('PASS: registro exitoso de una solicitud válida en estado PENDIENTE.');
  }

  // FAIL 422: días solicitados superiores al saldo disponible.
  {
    const { service, created } = createMockService(employee());

    await assert.rejects(
      () =>
        service.createRequest({
          employeeId: '00000000-0000-4000-8000-000000000001',
          startDate: day(10),
          endDate: day(29),
          reason: 'Periodo extenso',
        }),
      (error: any) => {
        assert.equal(error.getStatus?.(), 422, 'FAIL: debe responder HTTP 422');
        assert.equal(error.message, INSUFFICIENT_VACATION_BALANCE, 'FAIL: mensaje de saldo insuficiente');
        return true;
      }
    );
    assert.equal(created.length, 0, 'FAIL: no debe persistirse la solicitud con saldo insuficiente');
    console.log('PASS: rechazo HTTP 422 por saldo de vacaciones insuficiente.');
  }

  // FAIL 422: solapamiento con una solicitud PENDIENTE previa.
  {
    const { service, created } = createMockService(employee(), [
      {
        id: '00000000-0000-4000-8000-000000000099',
        employeeId: '00000000-0000-4000-8000-000000000001',
        startsAt: date(day(12)),
        endsAt: date(day(16)),
        days: 5,
        status: 'PENDIENTE',
        reason: 'Solicitud previa',
      },
    ]);

    await assert.rejects(
      () =>
        service.createRequest({
          employeeId: '00000000-0000-4000-8000-000000000001',
          startDate: day(10),
          endDate: day(14),
          reason: 'Intento solapado',
        }),
      (error: any) => {
        assert.equal(error.getStatus?.(), 422, 'FAIL: debe responder HTTP 422');
        assert.equal(error.message, OVERLAPPING_VACATION_REQUEST, 'FAIL: mensaje de solapamiento');
        return true;
      }
    );
    assert.equal(created.length, 0, 'FAIL: no debe persistirse una solicitud solapada');
    console.log('PASS: rechazo HTTP 422 por solapamiento de fechas.');
  }

  // FAIL: rango inválido (inicio posterior al fin).
  {
    const { service } = createMockService(employee());

    await assert.rejects(
      () =>
        service.createRequest({
          employeeId: '00000000-0000-4000-8000-000000000001',
          startDate: day(20),
          endDate: day(10),
        }),
      (error: any) => {
        assert.equal(error.getStatus?.(), 400, 'FAIL: rango inválido debe responder HTTP 400');
        assert.equal(error.message, 'Rango de fechas inválido');
        return true;
      }
    );
    console.log('PASS: rechazo de rango de fechas inválido (inicio posterior al fin).');
  }

  console.log('All HU-16 unit tests passed successfully!');
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
