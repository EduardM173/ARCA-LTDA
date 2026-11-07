/**
 * HU-21 — Registrar borrador de pago con múltiples partidas y cálculo decimal del neto
 *
 * Dominio de Pagos (Kata Módulo 4: 100%, Plan HU-13 / T11, ARCA RH v7.1 §2.5):
 *  - calculateTotals : suma decimal de abonos y deducciones sobre el salario base del periodo;
 *                      valida con exactitud Prisma.Decimal que el neto sea no negativo (net >= 0).
 *  - normalizeLines  : valida partidas contra catálogo de conceptos activos y verifica consistencia de tipos.
 *  - createDraft     : persiste borrador de boleta, congela snapshot y bloquea duplicados por periodo.
 *  - editDraft       : actualiza partidas y recalcula neto bajo control de concurrencia optimista (versión).
 */
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '../generated/client';
import { z } from 'zod';

export const moneySchema = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const lineInputSchema = z.object({
  conceptId: z.string().uuid().optional(),
  concept:   z.string().trim().min(2).max(100).optional(),
  type:      z.enum(['ABONO', 'DESCUENTO']).optional(),
  amount:    moneySchema,
}).strict().refine(l => l.conceptId || l.concept, 'Seleccione un concepto');

export type LineInput = z.infer<typeof lineInputSchema>;

export const createPaymentDraftSchema = z.object({
  employeeId: z.string().uuid(),
  period:     periodSchema,
  lines:      z.array(lineInputSchema).max(100),
}).strict();

export const updatePaymentDraftSchema = z.object({
  version: z.number().int().positive(),
  lines:   z.array(lineInputSchema).max(100),
}).strict();

export type CreatePaymentDraftInput = z.infer<typeof createPaymentDraftSchema>;
export type UpdatePaymentDraftInput = z.infer<typeof updatePaymentDraftSchema>;

// ─── Error constants ──────────────────────────────────────────────────────────
export const DUPLICATE_PAYMENT_PERIOD = 'Ya existe una boleta en este periodo; consulte el historial o la rectificación autorizada';
export const NEGATIVE_NET_CONFLICT    = 'El líquido pagable neto no puede ser negativo o está fuera del importe permitido';
export const INACTIVE_CONCEPT_ERROR   = 'Concepto inexistente o inactivo';
export const CONCEPT_TYPE_MISMATCH    = 'El tipo no coincide con el concepto';
export const PAYMENT_NOT_EDITABLE     = 'La boleta cambió o ya no admite edición; recargue antes de guardar';
export const EMPLOYEE_BAJA_PAYMENT    = 'Funcionario dado de baja';

export interface CalculatedTotals {
  earnings:   string;
  deductions: string;
  net:        string;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Cálculo decimal de haberes, descuentos y líquido neto (net >= 0).
   * Utiliza Prisma.Decimal para evitar errores de precisión de IEEE 754 float.
   */
  calculateTotals(baseSalary: string | number, lines: { type: string; amount: string | number }[]): CalculatedTotals {
    let earnings = new Prisma.Decimal(0);
    let deductions = new Prisma.Decimal(0);

    for (const l of lines) {
      const amt = new Prisma.Decimal(l.amount);
      if (amt.isNegative()) {
        throw new BadRequestException('El importe de cada partida debe ser mayor o igual a cero');
      }
      if (l.type === 'ABONO') {
        earnings = earnings.plus(amt);
      } else if (l.type === 'DESCUENTO') {
        deductions = deductions.plus(amt);
      } else {
        throw new BadRequestException('Tipo de partida no reconocido: ' + l.type);
      }
    }

    const base = new Prisma.Decimal(baseSalary);
    const net = base.plus(earnings).minus(deductions);

    if (net.isNegative() || net.greaterThan('999999999999.99')) {
      throw new BadRequestException(NEGATIVE_NET_CONFLICT);
    }

    return {
      earnings:   earnings.toFixed(2),
      deductions: deductions.toFixed(2),
      net:        net.toFixed(2),
    };
  }

  /**
   * Normaliza y valida las partidas contra los conceptos activos en BD.
   */
  async normalizeLines(lines: LineInput[], tx?: any): Promise<any[]> {
    const client = tx || this.prisma;
    const concepts = await client.concept.findMany({ where: { active: true } });

    return lines.map(l => {
      const c = concepts.find((item: any) =>
        l.conceptId ? item.id === l.conceptId : item.name === l.concept
      );
      if (!c) {
        throw new BadRequestException(INACTIVE_CONCEPT_ERROR);
      }
      if (l.type && l.type !== c.type) {
        throw new BadRequestException(CONCEPT_TYPE_MISMATCH);
      }
      return {
        conceptId: c.id,
        concept:   c.name,
        type:      c.type,
        amount:    new Prisma.Decimal(l.amount).toFixed(2),
      };
    });
  }

  /**
   * HU-21 — Creación de borrador de pago con múltiples partidas y cálculo decimal del neto.
   */
  async createDraft(
    input:    CreatePaymentDraftInput,
    employee: any,
    actorId:  string,
    reqId?:   string,
  ) {
    if (employee.status !== 'ACTIVO') {
      throw new BadRequestException(EMPLOYEE_BAJA_PAYMENT);
    }

    const runTransaction = async (tx: any) => {
      // 1. Verificación de unicidad por empleado y periodo
      const existing = await tx.payment.count({
        where: {
          employeeId: input.employeeId,
          period:     input.period,
        },
      });
      if (existing > 0) {
        throw new ConflictException(DUPLICATE_PAYMENT_PERIOD);
      }

      // 2. Normalización de partidas y cálculo decimal
      const normalizedLines = await this.normalizeLines(input.lines, tx);
      const totals = this.calculateTotals(employee.salary, normalizedLines);

      // 3. Persistencia de la boleta en borrador
      const payment = await tx.payment.create({
        data: {
          employeeId: input.employeeId,
          period:     input.period,
          lines:      normalizedLines,
          currency:   employee.currency || 'BOB',
          base:       new Prisma.Decimal(employee.salary),
          earnings:   new Prisma.Decimal(totals.earnings),
          deductions: new Prisma.Decimal(totals.deductions),
          net:        new Prisma.Decimal(totals.net),
          snapshot:   employee,
          createdBy:  actorId,
          status:     'BORRADOR',
          version:    1,
        },
      });

      // 4. Auditoría de creación
      if (tx.paymentAudit) {
        await tx.paymentAudit.create({
          data: {
            actor:     actorId,
            action:    'BORRADOR_CREADO',
            paymentId: payment.id,
            requestId: reqId,
            data: {
              period:     payment.period,
              base:       totals.net,
              linesCount: normalizedLines.length,
            },
          },
        });
      }

      return payment;
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(runTransaction);
    }
    return runTransaction(this.prisma);
  }

  /**
   * HU-21 — Edición de borrador de pago con recálculo decimal y control de concurrencia optimista.
   */
  async editDraft(
    id:       string,
    input:    UpdatePaymentDraftInput,
    employee: any,
    actorId:  string,
    reqId?:   string,
  ) {
    const runTransaction = async (tx: any) => {
      const p = await tx.payment.findUnique({ where: { id } });
      if (!p) {
        throw new NotFoundException('Boleta no encontrada');
      }

      if (!['BORRADOR', 'ERROR_EMISION'].includes(p.status) || p.version !== input.version) {
        throw new ConflictException(PAYMENT_NOT_EDITABLE);
      }

      const normalizedLines = await this.normalizeLines(input.lines, tx);
      const totals = this.calculateTotals(employee.salary, normalizedLines);

      const updated = await tx.payment.update({
        where: { id },
        data: {
          lines:      normalizedLines,
          currency:   employee.currency || 'BOB',
          base:       new Prisma.Decimal(employee.salary),
          earnings:   new Prisma.Decimal(totals.earnings),
          deductions: new Prisma.Decimal(totals.deductions),
          net:        new Prisma.Decimal(totals.net),
          snapshot:   employee,
          status:     'BORRADOR',
          version:    { increment: 1 },
        },
      });

      if (tx.paymentAudit) {
        await tx.paymentAudit.create({
          data: {
            actor:     actorId,
            action:    'BORRADOR_ACTUALIZADO',
            paymentId: id,
            requestId: reqId,
            data: {
              version: updated.version,
              net:     totals.net,
            },
          },
        });
      }

      return updated;
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(runTransaction);
    }
    return runTransaction(this.prisma);
  }
}
