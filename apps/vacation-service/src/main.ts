import { Controller, Get, Post, Req, Body, Param, Query, ConflictException, BadRequestException, ForbiddenException, Res } from '@nestjs/common';
import { PrismaClient } from '../generated/client';
import { start, authorize, call, date, Actor, identity, assertDepartment, departmentWhere, requirePermission, businessToday, currentRequestId } from '../../../packages/platform/src/http';
import { z } from 'zod';
import { countDays } from './calendar';
import { VacationsService, anniversary, completedYears } from './vacations.service';

export { anniversary, completedYears };

const db = new PrismaClient({ transactionOptions: { maxWait: 15000, timeout: 20000 } });
const uuid = z.uuid(), day = z.iso.date();

async function data(employeeId: string) {
  return call('vacation', 'personnel', '/internal/employees/' + uuid.parse(employeeId));
}

async function audit(tx: any, actor: string, action: string, resource: string, employeeId?: string) {
  await tx.vacationAudit.create({ data: { requestId: currentRequestId(), actor, action, resource, employeeId } });
}

@Controller()
export class VacationController {
  constructor(private readonly vacationsService: VacationsService = new VacationsService(db)) {}

  @Get('health')
  async health() {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }

  @Get('vacations/internal/open/:id')
  async open(@Req() req: any, @Param('id') id: string) {
    await identity(req, 'vacation', ['personnel']);
    return { count: await db.leaveRequest.count({ where: { employeeId: uuid.parse(id), OR: [{ status: 'PENDIENTE' }, { status: 'APROBADA', endsAt: { gte: date(businessToday()) } }] } }) };
  }

  @Get('vacations/summary')
  async summary(@Req() req: any) {
    const a = await authorize(req, 'vacation', ['ADMIN', 'HR', 'APPROVER', 'BOARD']);
    const rows = await db.leaveRequest.groupBy({ by: ['status'], where: a.scopeAll ? {} : { departmentId: { in: a.departmentIds || [] } }, _count: true });
    return { total: rows.reduce((n, r) => n + r._count, 0), byStatus: Object.fromEntries(rows.map(r => [r.status, r._count])) };
  }

  @Get('vacations/policy')
  async policy(@Req() req: any, @Res({ passthrough: true }) res: any) {
    await authorize(req, 'vacation', ['ADMIN', 'HR', 'APPROVER']);
    const policy = await db.policy.findFirst({ orderBy: { approvedAt: 'desc' } });
    if (!policy) res.status(204);
    return policy;
  }

  @Get('vacations/audit')
  async audits(@Req() req: any, @Query() q: any) {
    const a = await authorize(req, 'vacation', ['ADMIN']);
    if (!a.scopeAll) throw new ForbiddenException('La auditoría global requiere ámbito organizacional');
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(q.page);
    const action = z.string().trim().max(80).optional().parse(q.action || undefined), actor = uuid.optional().parse(q.actor || undefined);
    const from = day.optional().parse(q.from || undefined), to = day.optional().parse(q.to || undefined);
    if (from && to && from > to) throw new BadRequestException('Rango de fechas inválido');
    const where = { ...(action ? { action: { contains: action, mode: 'insensitive' as const } } : {}), ...(actor ? { actor } : {}), ...(from || to ? { createdAt: { ...(from ? { gte: date(from) } : {}), ...(to ? { lt: new Date(date(to).getTime() + 86400000) } : {}) } } : {}) };
    const [total, items] = await db.$transaction([db.vacationAudit.count({ where }), db.vacationAudit.findMany({ where, orderBy: { createdAt: 'desc' }, take: 25, skip: (page - 1) * 25 })]);
    return { total, page, items };
  }

  @Post('vacations/policy')
  async configure(@Req() req: any, @Body() body: unknown) {
    const a = await authorize(req, 'vacation', ['ADMIN']);
    const i = z.object({ counting: z.enum(['CALENDAR', 'BUSINESS']), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]).refine(v => new Set(v).size === v.length, 'No repita días laborables'), carryover: z.boolean(), holidays: z.array(day).max(1000), reservePending: z.boolean(), leapDay: z.enum(['FEB28', 'MAR1', 'PENDING']), cancelPending: z.boolean(), cancelApproved: z.boolean(), approval: z.literal(true) }).strict().parse(body);
    const { approval, ...p } = i;
    return db.$transaction(async tx => {
      const r = await tx.policy.create({ data: { ...p, approvedBy: a.id } });
      await audit(tx, a.id, 'POLICY_APPROVED', r.id);
      return r;
    });
  }

  /**
   * HU-15 (ARCA-15): Consultar elegibilidad y saldo de vacaciones por gestión.
   * Endpoint específico requerido para consulta de elegibilidad.
   */
  @Get('vacations/eligibility/:employeeId')
  async getEligibility(@Req() req: any, @Param('employeeId') employeeId: string) {
    const a = await authorize(req, 'vacation', ['ADMIN', 'HR', 'APPROVER']);
    return this.vacationsService.checkEligibility(employeeId, a);
  }

  /**
   * Endpoint de saldo de vacaciones compatible con casos T05, T06 y T07.
   */
  @Get('vacations/balance/:id')
  async balance(@Req() req: any, @Param('id') id: string) {
    const a = await authorize(req, 'vacation', ['ADMIN', 'HR', 'APPROVER']);
    return db.$transaction(tx => this.vacationsService.checkEligibility(id, a, tx));
  }

  @Get('vacations/requests')
  async list(@Req() req: any, @Query() q: any) {
    const a = await authorize(req, 'vacation', ['ADMIN', 'HR', 'APPROVER']);
    const page = z.coerce.number().int().min(1).default(1).parse(q.page);
    const where: any = a.scopeAll ? {} : { departmentId: { in: a.departmentIds || [] } };
    if (q.employeeId) {
      where.employeeId = uuid.parse(q.employeeId);
      assertDepartment(a, (await data(q.employeeId)).departmentId);
    }
    if (q.status) where.status = z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA']).parse(q.status);
    const [total, items] = await db.$transaction([db.leaveRequest.count({ where }), db.leaveRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 25, skip: (page - 1) * 25 })]);
    return q.page ? { total, items, page } : items;
  }

  @Get('vacations/requests/:id/history')
  async history(@Req() req: any, @Param('id') id: string) {
    const a = await authorize(req, 'vacation', ['ADMIN', 'HR', 'APPROVER']);
    const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
    assertDepartment(a, r.departmentId || undefined);
    return { audit: await db.vacationAudit.findMany({ where: { resource: id }, orderBy: { createdAt: 'asc' } }), movements: await db.movement.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } }) };
  }

  @Post('vacations/requests')
  async create(@Req() req: any, @Body() body: unknown) {
    const a = await authorize(req, 'vacation', ['ADMIN', 'HR']);
    const i = z.object({ employeeId: uuid, start: day, end: day, requestKey: z.uuid().optional() }).strict().parse(body);
    assertDepartment(a, (await data(i.employeeId)).departmentId);
    if (i.start > i.end || i.start < businessToday() || date(i.end).getTime() - date(i.start).getTime() > 366 * 86400000) throw new BadRequestException('Fechas inválidas');
    return db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${i.employeeId}))`;
      if (i.requestKey) {
        const old = await tx.leaveRequest.findUnique({ where: { requestKey: i.requestKey } });
        if (old) {
          if (old.createdBy !== a.id || old.employeeId !== i.employeeId || old.startsAt.toISOString().slice(0, 10) !== i.start || old.endsAt.toISOString().slice(0, 10) !== i.end) throw new ConflictException('La clave ya corresponde a otra solicitud');
          return old;
        }
      }
      const b = await this.vacationsService.checkEligibility(i.employeeId, a, tx);
      if (!b.eligible) throw new BadRequestException(b.reason!);
      const days = countDays(i.start, i.end, b.policy.counting, b.policy.holidays, b.policy.weekdays);
      if (days < 1 || days > b.available) throw new BadRequestException('Saldo insuficiente o rango sin días computables');
      if (await tx.leaveRequest.count({ where: { employeeId: i.employeeId, status: { in: ['PENDIENTE', 'APROBADA'] }, startsAt: { lte: date(i.end) }, endsAt: { gte: date(i.start) } } })) throw new ConflictException('Hay una solicitud solapada');
      const r = await tx.leaveRequest.create({ data: { employeeId: i.employeeId, departmentId: b.departmentId, tenureKey: b.tenureKey!, requestKey: i.requestKey, startsAt: date(i.start), endsAt: date(i.end), days, createdBy: a.id, policyId: b.policy.id } });
      await tx.outbox.create({ data: { requestId: r.id, event: 'PENDIENTE' } });
      await audit(tx, a.id, 'REQUEST_CREATED', r.id, r.employeeId);
      return r;
    });
  }

  @Post('vacations/requests/:id/approve')
  async approve(@Req() req: any, @Param('id') id: string) {
    return this.decide(req, id, 'APROBADA');
  }

  @Post('vacations/requests/:id/reject')
  async reject(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = z.object({ reason: z.string().min(5).max(500) }).strict().parse(body);
    return this.decide(req, id, 'RECHAZADA', reason);
  }

  async decide(req: any, id: string, status: string, reason?: string) {
    const a = await authorize(req, 'vacation', ['APPROVER']);
    requirePermission(a, 'vacations.approve');
    return db.$transaction(async tx => {
      const initial = await tx.leaveRequest.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
      assertDepartment(a, initial.departmentId || undefined);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.employeeId}))`;
      const r = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
      if (r.createdBy === a.id) throw new ConflictException('No puede decidir su propia solicitud');
      if (r.status === status) return r;
      if (r.status !== 'PENDIENTE') throw new ConflictException('Solicitud ya decidida');
      if (status === 'APROBADA') {
        const b = await this.vacationsService.checkEligibility(r.employeeId, a, tx, r.id);
        assertDepartment(a, b.departmentId);
        if (r.tenureKey !== b.tenureKey) throw new ConflictException('El periodo laboral cambió; requiere nueva solicitud');
        if (!b.eligible || r.days > b.available) throw new ConflictException('Funcionario no elegible o saldo insuficiente');
        if (b.policy.id !== r.policyId) throw new ConflictException('La política cambió; rechace y registre una nueva solicitud');
        let remaining = r.days;
        for (const bucket of b.buckets || []) {
          const used = Math.min(remaining, bucket.granted - bucket.used);
          if (used > 0) {
            await tx.movement.create({ data: { employeeId: r.employeeId, requestId: id, tenureKey: b.tenureKey!, serviceYear: bucket.year, days: used, kind: 'CONSUMO', actor: a.id } });
            remaining -= used;
          }
          if (!remaining) break;
        }
        if (remaining) throw new ConflictException('Saldo inconsistente');
      }
      const result = await tx.leaveRequest.update({ where: { id }, data: { status, decidedBy: a.id, reason, version: { increment: 1 } } });
      await tx.outbox.create({ data: { requestId: id, event: status } });
      await audit(tx, a.id, status, id, r.employeeId);
      return result;
    });
  }

  @Post('vacations/requests/:id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const a = await authorize(req, 'vacation', ['ADMIN', 'HR', 'APPROVER']);
    const { reason } = z.object({ reason: z.string().min(5).max(500) }).strict().parse(body);
    return db.$transaction(async tx => {
      const first = await tx.leaveRequest.findUniqueOrThrow({ where: { id: uuid.parse(id) } });
      assertDepartment(a, first.departmentId || undefined);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${first.employeeId}))`;
      const r = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
      if (r.status === 'CANCELADA') return r;
      const policy = await tx.policy.findUniqueOrThrow({ where: { id: r.policyId } });
      if (r.status === 'PENDIENTE') {
        if (!policy.cancelPending || (r.createdBy !== a.id && !a.roles.includes('ADMIN'))) throw new ConflictException('La política no permite esta cancelación');
      } else if (r.status === 'APROBADA') {
        requirePermission(a, 'vacations.approve');
        if (!policy.cancelApproved || r.startsAt <= date(businessToday())) throw new ConflictException('Solo se permite cancelar antes del inicio con política aprobada');
        for (const m of await tx.movement.findMany({ where: { requestId: id, kind: 'CONSUMO' } })) {
          await tx.movement.create({ data: { employeeId: r.employeeId, requestId: id, tenureKey: m.tenureKey, serviceYear: m.serviceYear, days: -m.days, kind: 'REVERSO', actor: a.id } });
        }
      } else throw new ConflictException('Estado no cancelable');
      const result = await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELADA', reason, decidedBy: a.id, version: { increment: 1 } } });
      await tx.outbox.create({ data: { requestId: id, event: 'CANCELADA' } });
      await audit(tx, a.id, 'CANCELADA', id, r.employeeId);
      return result;
    });
  }

  @Get('vacations/mail-status')
  async mails(@Req() req: any) {
    await authorize(req, 'vacation', ['ADMIN']);
    return db.outbox.findMany({ orderBy: { nextAttemptAt: 'desc' }, take: 100 });
  }

  @Post('vacations/mail-status/:id/retry')
  async retry(@Req() req: any, @Param('id') id: string) {
    await authorize(req, 'vacation', ['ADMIN']);
    const m = await db.outbox.findUniqueOrThrow({ where: { id } });
    if (m.state === 'EN_COLA_IDENTIDAD') throw new ConflictException('Aviso ya transferido a Identidad');
    return db.outbox.update({ where: { id }, data: { attempts: 0, nextAttemptAt: new Date(), state: 'PENDIENTE' } });
  }
}

let running = false;
async function deliver() {
  if (running) return;
  running = true;
  try {
    for (const m of await db.outbox.findMany({ where: { state: 'PENDIENTE', attempts: { lt: 5 }, nextAttemptAt: { lte: new Date() } }, take: 10 })) {
      try {
        const r = await db.leaveRequest.findUniqueOrThrow({ where: { id: m.requestId } });
        if (!r.departmentId) throw new Error('DEPARTMENT_MISSING');
        const result = await call('vacation', 'identity', '/internal/vacation-mail', undefined, { requestId: r.id, event: m.event, createdBy: r.createdBy, departmentId: r.departmentId });
        await db.outbox.update({ where: { id: m.id }, data: { state: result.suppressed ? 'SUPRIMIDO_DEMO' : 'EN_COLA_IDENTIDAD', attempts: { increment: 1 }, lastError: null } });
      } catch {
        await db.outbox.update({ where: { id: m.id }, data: { attempts: { increment: 1 }, lastError: 'IDENTITY_OR_VERIFIED_RECIPIENT_UNAVAILABLE', nextAttemptAt: new Date(Date.now() + 30000 * 2 ** m.attempts) } });
      }
    }
  } finally {
    running = false;
  }
}

void start(VacationController, 'vacation', 3003, db, [VacationsService, { provide: PrismaClient, useValue: db }]).then(() => {
  void deliver().catch(() => {});
  setInterval(() => void deliver().catch(() => {}), 10000).unref();
});
