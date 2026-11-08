import { Injectable, ConflictException, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaClient } from '../generated/client';
import { call, date, Actor, assertDepartment, businessToday } from '../../../packages/platform/src/http';
import { VacationEligibilityResponseDto, VacationPeriodDto } from './dto/vacation-eligibility-response.dto';
import {
  CreateVacationRequestInput,
  LeaveRequestResponseDto,
  VacationDecision,
  INSUFFICIENT_VACATION_BALANCE,
  INSUFFICIENT_VACATION_BALANCE_FOR_APPROVAL,
  OVERLAPPING_VACATION_REQUEST,
  REJECTION_REASON_REQUIRED,
  toLeaveRequestResponse,
} from './dto/leave-request-response.dto';
import { countDays } from './calendar';
import { z } from 'zod';

const uuid = z.uuid();

export function anniversary(h: Date, n: number, leap: string): Date {
  const year = h.getUTCFullYear() + n;
  if (h.getUTCMonth() === 1 && h.getUTCDate() === 29 && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1) {
    if (leap === 'PENDING') throw new ConflictException('Requiere aprobar política para aniversarios del 29 de febrero');
    return new Date(Date.UTC(year, leap === 'FEB28' ? 1 : 2, leap === 'FEB28' ? 28 : 1));
  }
  return new Date(Date.UTC(year, h.getUTCMonth(), h.getUTCDate()));
}

export function completedYears(hired: string, today: Date): number {
  const h = new Date(hired);
  return today.getUTCFullYear() - h.getUTCFullYear() - ((today.getUTCMonth() < h.getUTCMonth() || (today.getUTCMonth() === h.getUTCMonth() && today.getUTCDate() < h.getUTCDate())) ? 1 : 0);
}

/**
 * Determina los días de vacación anual otorgados según la escala de antigüedad laboral:
 * - De 1 a 4 años cumplidos: 15 días laborables por año.
 * - De 5 a 9 años cumplidos: 20 días laborables por año.
 * - De 10 o más años cumplidos: 30 días laborables por año.
 * (Conforme a la escala legal del Art. 33 de la Ley General del Trabajo y requerimiento docente).
 */
export function getVacationDaysByTenure(serviceYear: number): number {
  if (serviceYear >= 10) {
    return 30;
  }
  if (serviceYear >= 5) {
    return 20;
  }
  return 15;
}


@Injectable()
export class VacationsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Realiza una llamada HTTP síncrona interna hacia personnel-service
   * autenticada mediante cabeceras de aserción firmadas (JWT interno con aud=personnel, iss=vacation).
   */
  async getEmployeeData(employeeId: string, actor?: Actor) {
    return call('vacation', 'personnel', '/internal/employees/' + uuid.parse(employeeId), actor);
  }

  /**
   * HU-15 (ARCA-15): Consultar elegibilidad y saldo de vacaciones por gestión.
   * Reglas de negocio:
   * 1. Consumir internal personnel-service para obtener fecha_ingreso (hiredAt) y ratificado_en (ratifiedAt).
   * 2. Si ratifiedAt es nulo -> isEligible: false, reason: "El funcionario no ha sido ratificado previamente", availableDays: 0 (T05).
   * 3. Si antigüedad (hoy - fecha_ingreso) < 365 días -> isEligible: false, reason: "No ha completado una gestión de 365 días", availableDays: 0 (T06).
   * 4. Si ratificado y antigüedad >= 365 días -> isEligible: true, availableDays: Math.floor(diasAntiguedad / 365) * 15, detalle de periodos (T07).
   */
  async checkEligibility(
    employeeId: string,
    actor?: Actor,
    txClient?: any,
    excludeRequest?: string
  ): Promise<VacationEligibilityResponseDto> {
    const tx = txClient || this.prisma;
    const e = await this.getEmployeeData(employeeId, actor);
    if (actor) {
      assertDepartment(actor, e.departmentId);
    }

    const todayStr = businessToday();
    const today = date(todayStr);
    const hire = new Date(e.hiredAt);
    const diffMs = today.getTime() - hire.getTime();
    const diasAntiguedad = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const tenureKey = e.hiredAt.slice(0, 10);

    // Caso: Funcionario dado de baja
    if (e.status !== 'ACTIVO') {
      return {
        isEligible: false,
        eligible: false,
        availableDays: 0,
        available: 0,
        reason: 'Funcionario dado de baja',
        diasAntiguedad,
        gestiones: 0,
        totalDays: 0,
        usedDays: 0,
        reservedDays: 0,
        periods: [],
        buckets: [],
        employeeVersion: e.version,
        departmentId: e.departmentId,
        tenureKey,
      };
    }

    // Regla 2 (T05): Sin ratificación previa
    if (!e.ratifiedAt) {
      return {
        isEligible: false,
        eligible: false,
        availableDays: 0,
        available: 0,
        reason: 'El funcionario no ha sido ratificado previamente',
        diasAntiguedad,
        gestiones: Math.floor(diasAntiguedad / 365),
        totalDays: 0,
        usedDays: 0,
        reservedDays: 0,
        periods: [],
        buckets: [],
        employeeVersion: e.version,
        departmentId: e.departmentId,
        tenureKey,
      };
    }

    // Regla 3 (T06): Antigüedad menor a 365 días
    if (diasAntiguedad < 365) {
      return {
        isEligible: false,
        eligible: false,
        availableDays: 0,
        available: 0,
        reason: 'No ha completado una gestión de 365 días',
        diasAntiguedad,
        gestiones: 0,
        totalDays: 0,
        usedDays: 0,
        reservedDays: 0,
        periods: [],
        buckets: [],
        employeeVersion: e.version,
        departmentId: e.departmentId,
        tenureKey,
      };
    }

    // Regla 4 (T07): Ratificado con >= 365 días de antigüedad
    const gestiones = Math.floor(diasAntiguedad / 365);
    const policy = await tx.policy.findFirst({ orderBy: { approvedAt: 'desc' } });
    if (!policy) {
      throw new ConflictException('Requiere configurar y aprobar la política de vacaciones');
    }

    const leapDay = policy.leapDay || 'FEB28';
    let years = today.getUTCFullYear() - hire.getUTCFullYear();
    while (years > 0 && anniversary(hire, years, leapDay) > today) {
      years--;
    }
    const serviceYearsToCount = Math.max(gestiones, years);

    const periods: VacationPeriodDto[] = [];
    const buckets: any[] = [];
    const startYear = policy.carryover ? 1 : serviceYearsToCount;

    for (let y = startYear; y <= serviceYearsToCount; y++) {
      const cycleStart = anniversary(hire, y, leapDay);
      const cycleEnd = anniversary(hire, y + 1, leapDay);

      const daysForYear = getVacationDaysByTenure(y);

      const ent = await tx.entitlement.upsert({
        where: { employeeId_tenureKey_serviceYear: { employeeId, tenureKey, serviceYear: y } },
        update: { granted: daysForYear },
        create: { employeeId, tenureKey, serviceYear: y, cycleStart, policyId: policy.id, granted: daysForYear },
      });

      const moves = await tx.movement.aggregate({
        where: { employeeId, tenureKey, serviceYear: y },
        _sum: { days: true },
      });

      const usedForYear = moves._sum.days || 0;
      buckets.push({ year: y, granted: ent.granted, used: usedForYear, cycleStart: ent.cycleStart });

      periods.push({
        period: y,
        serviceYear: y,
        days: ent.granted,
        startDate: cycleStart.toISOString().slice(0, 10),
        endDate: cycleEnd.toISOString().slice(0, 10),
        granted: ent.granted,
        used: usedForYear,
        available: Math.max(0, ent.granted - usedForYear),
      });
    }

    // Legacy approvals check
    const legacy = await tx.leaveRequest.findMany({
      where: { employeeId, status: 'APROBADA' },
      select: { id: true, days: true },
    });
    for (const r of legacy) {
      if (!(await tx.movement.count({ where: { requestId: r.id } }))) {
        throw new ConflictException('Existe aprobación histórica pendiente de reconciliar en el libro de movimientos');
      }
    }

    const reserved = policy.reservePending
      ? (await tx.leaveRequest.aggregate({
          where: { employeeId, status: 'PENDIENTE', ...(excludeRequest ? { id: { not: excludeRequest } } : {}) },
          _sum: { days: true },
        }))._sum.days || 0
      : 0;

    const grantedTotal = buckets.reduce((n: number, b: any) => n + b.granted, 0);
    const usedTotal = buckets.reduce((n: number, b: any) => n + b.used, 0);
    const available = Math.max(0, grantedTotal - usedTotal - reserved);

    return {
      isEligible: true,
      eligible: true,
      availableDays: available,
      available,
      reason: null,
      diasAntiguedad,
      gestiones,
      totalDays: grantedTotal,
      usedDays: usedTotal,
      reservedDays: reserved,
      periods,
      buckets,
      policy,
      employeeVersion: e.version,
      departmentId: e.departmentId,
      tenureKey,
    };
  }

  /**
   * HU-16 (ARCA-16): Registrar una solicitud de vacaciones.
   * Validaciones:
   * A. Saldo insuficiente -> HTTP 422 con mensaje institucional.
   * B. Solapamiento con solicitud PENDIENTE/APROBADA -> HTTP 422.
   * C. Rango de fechas válido y con días laborables computables.
   */
  async createRequest(
    input: CreateVacationRequestInput,
    actor?: Actor,
    txClient?: any
  ): Promise<LeaveRequestResponseDto> {
    const tx = txClient || this.prisma;
    const { employeeId, startDate, endDate } = input;

    if (!z.iso.date().safeParse(startDate).success || !z.iso.date().safeParse(endDate).success) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (startDate > endDate) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (startDate < businessToday()) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (date(endDate).getTime() - date(startDate).getTime() > 366 * 86400000) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    const eligibility = await this.checkEligibility(employeeId, actor, tx);
    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason || 'El funcionario no es elegible para solicitar vacaciones');
    }

    const policy = eligibility.policy;
    if (!policy) {
      throw new ConflictException('Requiere configurar y aprobar la política de vacaciones');
    }

    const daysRequested = countDays(startDate, endDate, policy.counting, policy.holidays || [], policy.weekdays);
    if (daysRequested < 1) {
      throw new BadRequestException('El rango de fechas no contiene días laborables válidos');
    }

    const availableDays = eligibility.availableDays ?? eligibility.available ?? 0;
    if (daysRequested > availableDays) {
      throw new UnprocessableEntityException(INSUFFICIENT_VACATION_BALANCE);
    }

    const overlapping = await tx.leaveRequest.count({
      where: {
        employeeId,
        status: { in: ['PENDIENTE', 'APROBADA'] },
        startsAt: { lte: date(endDate) },
        endsAt: { gte: date(startDate) },
      },
    });
    if (overlapping > 0) {
      throw new UnprocessableEntityException(OVERLAPPING_VACATION_REQUEST);
    }

    const created = await tx.leaveRequest.create({
      data: {
        employeeId,
        departmentId: eligibility.departmentId,
        tenureKey: eligibility.tenureKey || 'legacy',
        requestKey: input.requestKey,
        startsAt: date(startDate),
        endsAt: date(endDate),
        days: daysRequested,
        reason: input.reason,
        createdBy: actor?.id || input.createdBy || 'system',
        policyId: policy.id,
      },
    });

    return toLeaveRequestResponse(created, { startDate, endDate, daysRequested });
  }

  /**
   * HU-17 (ARCA-17): Aprobar o rechazar una solicitud dentro de una transacción.
   * El llamador debe invocar este método dentro de prisma.$transaction y con el
   * bloqueo asesor del funcionario adquirido para garantizar el control T08.
   */
  async decideRequest(
    tx: any,
    requestId: string,
    decision: VacationDecision,
    rejectionReason?: string | null,
    actor?: Actor
  ): Promise<LeaveRequestResponseDto> {
    if (decision !== 'APROBADA' && decision !== 'RECHAZADA') {
      throw new BadRequestException('Decisión inválida');
    }

    const request = await tx.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (actor) {
      assertDepartment(actor, request.departmentId || undefined);
      if (request.createdBy === actor.id) {
        throw new ConflictException('No puede decidir su propia solicitud');
      }
    }
    if (request.status !== 'PENDIENTE') {
      throw new ConflictException('Solicitud ya decidida');
    }

    if (decision === 'RECHAZADA') {
      const reason = String(rejectionReason ?? '').trim();
      if (!reason) {
        throw new BadRequestException(REJECTION_REASON_REQUIRED);
      }
      const rejected = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'RECHAZADA',
          reason,
          decidedBy: actor?.id ?? 'system',
          version: { increment: 1 },
        },
      });
      return toLeaveRequestResponse(rejected);
    }

    const balance = await this.checkEligibility(request.employeeId, actor, tx, request.id);
    if (!balance.eligible) {
      throw new BadRequestException(balance.reason || 'El funcionario no es elegible para vacaciones');
    }
    if (request.tenureKey !== balance.tenureKey) {
      throw new ConflictException('El periodo laboral cambió; requiere nueva solicitud');
    }

    const availableDays = balance.availableDays ?? balance.available ?? 0;
    if (request.days > availableDays) {
      throw new UnprocessableEntityException(INSUFFICIENT_VACATION_BALANCE_FOR_APPROVAL);
    }
    if (!balance.policy || balance.policy.id !== request.policyId) {
      throw new ConflictException('La política cambió; rechace y registre una nueva solicitud');
    }

    let remaining = request.days;
    for (const bucket of balance.buckets || []) {
      const used = Math.min(remaining, bucket.granted - bucket.used);
      if (used > 0) {
        await tx.movement.create({
          data: {
            employeeId: request.employeeId,
            requestId,
            tenureKey: balance.tenureKey!,
            serviceYear: bucket.year,
            days: used,
            kind: 'CONSUMO',
            actor: actor?.id ?? 'system',
          },
        });
        remaining -= used;
      }
      if (!remaining) break;
    }
    if (remaining) {
      throw new ConflictException('Saldo inconsistente');
    }

    const approved = await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'APROBADA',
        decidedBy: actor?.id ?? 'system',
        version: { increment: 1 },
      },
    });
    return toLeaveRequestResponse(approved);
  }
}

