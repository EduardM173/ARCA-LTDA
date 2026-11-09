import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { VacationsService } from '../apps/vacation-service/src/vacations.service';
import { businessToday, date, Actor, requirePermission } from '../packages/platform/src/http';
import {
  INSUFFICIENT_VACATION_BALANCE_FOR_APPROVAL,
  REJECTION_REASON_REQUIRED,
} from '../apps/vacation-service/src/dto/leave-request-response.dto';

const APPROVER: Actor = {
  id: '00000000-0000-4000-8000-0000000000aa',
  roles: ['APPROVER'],
  permissions: ['vacations.approve'],
  scopeAll: true,
};

const ADMIN_ACTOR: Actor = {
  id: '00000000-0000-4000-8000-0000000000ad',
  roles: ['ADMIN'],
  scopeAll: true,
};

const HR_ACTOR: Actor = {
  id: '00000000-0000-4000-8000-0000000000hr',
  roles: ['HR'],
  scopeAll: true,
};

const UNAUTHORIZED_ACTOR: Actor = {
  id: '00000000-0000-4000-8000-0000000000xx',
  roles: ['OPERATOR'],
  scopeAll: true,
};

function verifyRbac(actor: Actor) {
  const allowed = ['APPROVER', 'ADMIN', 'HR'];
  if (!actor.roles.some(r => allowed.includes(r))) {
    throw new ForbiddenException('No tiene permiso para esta acción');
  }
  if (!actor.roles.some(r => r === 'ADMIN' || r === 'HR')) {
    requirePermission(actor, 'vacations.approve');
  }
}

const POLICY = {
  id: 'policy-hu17',
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

function matches(row: any, where: any = {}): boolean {
  if (where.id !== undefined) {
    if (typeof where.id === 'string' && row.id !== where.id) return false;
    if (where.id && typeof where.id === 'object' && 'not' in where.id && row.id === where.id.not) return false;
  }
  if (where.employeeId && row.employeeId !== where.employeeId) return false;
  if (where.requestId && row.requestId !== where.requestId) return false;
  if (where.kind && row.kind !== where.kind) return false;
  if (where.tenureKey && row.tenureKey !== where.tenureKey) return false;
  if (where.serviceYear !== undefined && row.serviceYear !== where.serviceYear) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'string' && row.status !== where.status) return false;
    if (where.status?.in && !where.status.in.includes(row.status)) return false;
  }
  if (where.startsAt?.lte && row.startsAt.getTime() > where.startsAt.lte.getTime()) return false;
  if (where.endsAt?.gte && row.endsAt.getTime() < where.endsAt.gte.getTime()) return false;
  return true;
}

function createHarness() {
  const employee = {
    id: '00000000-0000-4000-8000-000000000001',
    departmentId: '00000000-0000-4000-8000-0000000000d1',
    status: 'ACTIVO',
    hiredAt: day(-400),
    ratifiedAt: day(-380),
    version: 1,
  };
  const requests: any[] = [];
  const movements: any[] = [];
  const entitlements = new Map<string, any>();
  let sequence = 0;

  const tx: any = {
    policy: { findFirst: async () => POLICY },
    entitlement: {
      upsert: async ({ create }: any) => {
        const key = `${create.employeeId}|${create.tenureKey}|${create.serviceYear}`;
        if (!entitlements.has(key)) {
          entitlements.set(key, { id: 'ent-' + create.serviceYear, ...create, granted: 15 });
        }
        return entitlements.get(key);
      },
    },
    movement: {
      create: async ({ data }: any) => {
        sequence += 1;
        const row = { id: 'mov-' + sequence, createdAt: new Date(), ...data };
        movements.push(row);
        return row;
      },
      aggregate: async ({ where }: any) => ({
        _sum: { days: movements.filter(row => matches(row, where)).reduce((total, row) => total + row.days, 0) },
      }),
      count: async ({ where }: any) => movements.filter(row => matches(row, where)).length,
    },
    leaveRequest: {
      findMany: async ({ where }: any) => requests.filter(row => matches(row, where)),
      aggregate: async ({ where }: any) => ({
        _sum: { days: requests.filter(row => matches(row, where)).reduce((total, row) => total + row.days, 0) },
      }),
      count: async ({ where }: any) => requests.filter(row => matches(row, where)).length,
      findUniqueOrThrow: async ({ where }: any) => {
        const row = requests.find(item => item.id === where.id);
        if (!row) throw new Error('Registro no encontrado');
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = requests.find(item => item.id === where.id);
        if (!row) throw new Error('Registro no encontrado');
        for (const [key, value] of Object.entries(data)) {
          if (key === 'version' && value && typeof value === 'object' && 'increment' in value) {
            row.version += Number((value as any).increment);
          } else {
            row[key] = value;
          }
        }
        return row;
      },
    },
  };

  let queue: Promise<unknown> = Promise.resolve();
  const prisma: any = {
    $transaction: <T>(fn: (client: any) => Promise<T>): Promise<T> => {
      const run = queue.then(() => fn(tx));
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  };

  const service = new VacationsService(prisma);
  service.getEmployeeData = async () => employee;

  function addRequest(overrides: Record<string, unknown> = {}) {
    sequence += 1;
    const request = {
      id: '00000000-0000-4000-8000-0000000001' + String(sequence).padStart(2, '0'),
      employeeId: employee.id,
      departmentId: employee.departmentId,
      tenureKey: employee.hiredAt,
      policyId: POLICY.id,
      startsAt: date(day(10)),
      endsAt: date(day(14)),
      days: 5,
      status: 'PENDIENTE',
      createdBy: '00000000-0000-4000-8000-0000000000cc',
      decidedBy: null,
      reason: null,
      version: 1,
      createdAt: new Date(),
      ...overrides,
    };
    requests.push(request);
    return request;
  }

  return { prisma, service, requests, movements, employee, addRequest };
}

async function runTests() {
  console.log('--- Running HU-17 Vacation Decision Unit Tests ---');

  // PASS: aprobación exitosa → estado APROBADA + movimiento de débito.
  {
    const h = createHarness();
    const request = h.addRequest({ days: 5 });

    const result = await h.prisma.$transaction((tx: any) =>
      h.service.decideRequest(tx, request.id, 'APROBADA', undefined, APPROVER)
    );

    assert.equal(result.status, 'APROBADA');
    assert.equal(h.requests[0].status, 'APROBADA');
    assert.equal(h.movements.length, 1, 'PASS: debe registrarse un movimiento de débito');
    assert.equal(h.movements[0].days, 5);
    assert.equal(h.movements[0].kind, 'CONSUMO');
    assert.equal(h.movements[0].requestId, request.id);
    console.log('PASS: aprobación cambia a APROBADA y registra el débito en el libro de movimientos.');
  }

  // PASS: rechazo exitoso → estado RECHAZADA, guarda motivo y no descuenta.
  {
    const h = createHarness();
    const request = h.addRequest({ days: 5 });

    const result = await h.prisma.$transaction((tx: any) =>
      h.service.decideRequest(tx, request.id, 'RECHAZADA', 'Motivo institucional documentado', APPROVER)
    );

    assert.equal(result.status, 'RECHAZADA');
    assert.equal(h.requests[0].status, 'RECHAZADA');
    assert.equal(h.requests[0].reason, 'Motivo institucional documentado');
    assert.equal(h.movements.length, 0, 'PASS: el rechazo no debe generar débitos');
    console.log('PASS: rechazo guarda el motivo y no afecta el saldo.');
  }

  // FAIL 400: rechazo sin motivo obligatorio.
  {
    const h = createHarness();
    const request = h.addRequest({ days: 5 });

    await assert.rejects(
      () =>
        h.prisma.$transaction((tx: any) =>
          h.service.decideRequest(tx, request.id, 'RECHAZADA', '   ', APPROVER)
        ),
      (error: any) => {
        assert.equal(error.getStatus?.(), 400, 'FAIL: debe responder HTTP 400');
        assert.equal(error.message, REJECTION_REASON_REQUIRED);
        return true;
      }
    );

    assert.equal(h.requests[0].status, 'PENDIENTE');
    assert.equal(h.movements.length, 0);
    console.log('PASS: rechazo sin motivo obligatorio es rechazado con HTTP 400.');
  }

  // FAIL 422 / T08: dos aprobaciones simultáneas con saldo para una sola.
  {
    const h = createHarness();
    const first = h.addRequest({ id: '00000000-0000-4000-8000-0000000000a1', days: 10 });
    const second = h.addRequest({
      id: '00000000-0000-4000-8000-0000000000a2',
      days: 10,
      startsAt: date(day(20)),
      endsAt: date(day(29)),
    });

    const results = await Promise.allSettled([
      h.prisma.$transaction((tx: any) =>
        h.service.decideRequest(tx, first.id, 'APROBADA', undefined, APPROVER)
      ),
      h.prisma.$transaction((tx: any) =>
        h.service.decideRequest(tx, second.id, 'APROBADA', undefined, APPROVER)
      ),
    ]);

    const fulfilled = results.filter(result => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'T08: exactamente una aprobación debe completarse');
    assert.equal(rejected.length, 1, 'T08: la otra aprobación debe rechazarse');
    const failure: any = (rejected[0] as PromiseRejectedResult).reason;
    assert.equal(failure.getStatus?.(), 422, 'T08: la segunda aprobación debe responder HTTP 422');
    assert.equal(failure.message, INSUFFICIENT_VACATION_BALANCE_FOR_APPROVAL);

    const debited = h.movements.reduce((total, movement) => total + movement.days, 0);
    assert.equal(debited, 10, 'T08: solo debe existir un débito de 10 días');
    assert.ok(h.movements.every(movement => movement.days > 0), 'T08: no debe existir saldo negativo');
    assert.deepEqual(h.requests.map(request => request.status).sort(), ['APROBADA', 'PENDIENTE']);
    console.log('PASS: concurrencia T08, una aprobación gana y la otra recibe HTTP 422 sin saldo negativo.');
  }

  // RBAC: Roles autorizados (APPROVER, ADMIN, HR) y bloqueo 403 para roles no autorizados.
  {
    // FAIL 403 para rol no autorizado
    assert.throws(
      () => verifyRbac(UNAUTHORIZED_ACTOR),
      (error: any) => {
        assert.equal(error.getStatus?.(), 403, 'FAIL: debe responder HTTP 403 para rol no autorizado');
        return true;
      }
    );

    // FAIL 403 para APPROVER sin permiso explícito
    assert.throws(
      () => verifyRbac({ id: 'any', roles: ['APPROVER'], scopeAll: true, permissions: [] }),
      (error: any) => {
        assert.equal(error.getStatus?.(), 403, 'FAIL: APPROVER sin permiso vacations.approve debe responder 403');
        return true;
      }
    );

    // PASS para APPROVER con permiso, ADMIN y HR
    assert.doesNotThrow(() => verifyRbac(APPROVER));
    assert.doesNotThrow(() => verifyRbac(ADMIN_ACTOR));
    assert.doesNotThrow(() => verifyRbac(HR_ACTOR));
    console.log('PASS: control RBAC restringe acceso a APPROVER/ADMIN/HR y responde HTTP 403 para no autorizados.');
  }

  // FAIL 409: no puede decidir su propia solicitud.
  {
    const h = createHarness();
    const request = h.addRequest({ createdBy: APPROVER.id, days: 5 });

    await assert.rejects(
      () =>
        h.prisma.$transaction((tx: any) =>
          h.service.decideRequest(tx, request.id, 'APROBADA', undefined, APPROVER)
        ),
      (error: any) => {
        assert.equal(error.getStatus?.(), 409, 'FAIL: debe responder HTTP 409 Conflict');
        assert.equal(error.message, 'No puede decidir su propia solicitud');
        return true;
      }
    );
    console.log('PASS: prohibido decidir la propia solicitud con HTTP 409.');
  }

  // FAIL 409: solicitud ya decidida.
  {
    const h = createHarness();
    const request = h.addRequest({ status: 'APROBADA', days: 5 });

    await assert.rejects(
      () =>
        h.prisma.$transaction((tx: any) =>
          h.service.decideRequest(tx, request.id, 'APROBADA', undefined, APPROVER)
        ),
      (error: any) => {
        assert.equal(error.getStatus?.(), 409, 'FAIL: debe responder HTTP 409');
        assert.equal(error.message, 'Solicitud ya decidida');
        return true;
      }
    );
    console.log('PASS: solicitud ya decidida no puede volver a decidirse con HTTP 409.');
  }

  console.log('All HU-17 unit tests passed successfully!');
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
