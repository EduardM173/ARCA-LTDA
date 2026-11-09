/**
 * HU-19 (ARCA-20) — Generar y previsualizar borrador de contrato vinculado a Personal
 *
 * Lógica de negocio:
 *  - createDraft  : consulta personnel-service, congela snapshot, persiste BORRADOR v1
 *  - previewDraft : devuelve texto resuelto sin cambiar estado
 *  - updateDraft  : actualiza template/probationDays e incrementa versión (solo BORRADOR)
 */
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '../generated/client';
import { z } from 'zod';
import { renderContractTemplate, validateAndSanitizeTemplate } from './templates.service';

// ─── Re-exported constants ────────────────────────────────────────────────────
export const DRAFT_EDIT_CONFLICT  = 'No se puede editar un contrato emitido';
export const EMPLOYEE_NOT_ACTIVE  = 'Funcionario no activo o no encontrado';
export const TEMPLATE_NOT_ACTIVE  = 'La plantilla está desactivada; seleccione una versión activa';
export const DRAFT_VERSION_STALE  = 'El borrador cambió; recargue antes de guardar';

// ─── Input schemas ─────────────────────────────────────────────────────────────
export const createDraftSchema = z.object({
  employeeId:   z.string().uuid(),
  templateId:   z.string().uuid(),
  probationDays: z.number().int().min(0).max(365),
  requestKey:   z.string().uuid().optional(),
}).strict();

export const updateDraftSchema = z.object({
  templateId:    z.string().uuid(),
  probationDays: z.number().int().min(0).max(365),
  version:       z.number().int().positive(),
  refreshSnapshot: z.boolean().default(false),
}).strict();

export type CreateDraftInput  = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput  = z.infer<typeof updateDraftSchema>;

/** Snapshot shape frozen at draft-creation time */
export interface EmployeeSnapshot {
  id:           string;
  code:         string;
  name:         string;
  hiredAt:      string | Date;
  status:       string;
  currency:     string;
  salary:       string;
  position:     { id?: string; name: string };
  departmentId: string;
  version:      number;
}

@Injectable()
export class ContractDraftsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Render body using the HU-19 modern template variables */
  resolveBody(body: string, snapshot: EmployeeSnapshot, probationDays: number): string {
    return renderContractTemplate(body, snapshot, probationDays);
  }

  /** Resolve template from either ContractTemplate (HU-18) or legacy Template table */
  async resolveTemplate(tx: any, templateId: string) {
    const ct = await tx.contractTemplate.findUnique({ where: { id: templateId } });
    if (ct) return { id: ct.id, name: ct.title, version: ct.version, body: ct.body, active: ct.status === 'ACTIVE', isModern: true };
    const t = await tx.template?.findUnique({ where: { id: templateId } });
    if (t) return { id: t.id, name: t.name, version: t.version, body: t.body, active: t.active, isModern: false };
    throw new NotFoundException('Plantilla no encontrada');
  }

  // ─── Create draft ──────────────────────────────────────────────────────────

  /**
   * HU-19 §1 — Genera un borrador de contrato congelando los datos del funcionario.
   *
   * @param input     Validated CreateDraftInput
   * @param snapshot  Employee data fetched from personnel-service (already validated active)
   * @param actorId   ID of the user creating the draft
   * @param reqId     Request-ID for idempotency audit
   */
  async createDraft(
    input: CreateDraftInput,
    snapshot: EmployeeSnapshot,
    actorId: string,
    reqId?: string,
  ) {
    if (snapshot.status !== 'ACTIVO') {
      throw new BadRequestException(EMPLOYEE_NOT_ACTIVE);
    }

    return this.prisma.$transaction(async (tx: any) => {
      // Idempotency guard using requestKey
      if (input.requestKey) {
        const existing = await tx.contract.findUnique({
          where: { createdBy_requestKey: { createdBy: actorId, requestKey: input.requestKey } },
        });
        if (existing) {
          if (
            existing.employeeId   !== input.employeeId ||
            existing.templateId   !== input.templateId ||
            existing.probationDays !== input.probationDays
          ) {
            throw new ConflictException('La clave del intento ya corresponde a otro borrador');
          }
          return existing;
        }
      }

      const tpl = await this.resolveTemplate(tx, input.templateId);
      if (!tpl.active) throw new ConflictException(TEMPLATE_NOT_ACTIVE);

      // Resolve text — preview only; stored in resolvedBody for quick read
      let resolvedBody: string;
      try {
        resolvedBody = this.resolveBody(tpl.body, snapshot, input.probationDays);
      } catch {
        resolvedBody = tpl.body; // fallback: keep raw body if template uses old vars
      }

      const contract = await tx.contract.create({
        data: {
          employeeId:    input.employeeId,
          templateId:    input.templateId,
          probationDays: input.probationDays,
          snapshot:      snapshot as any,
          createdBy:     actorId,
          requestKey:    input.requestKey,
          status:        'BORRADOR',
          version:       1,
        },
      });

      await tx.contractAudit?.create({
        data: {
          resourceId: contract.id,
          action:     'DRAFT_CREATED',
          actorId,
          requestId:  reqId,
          details: {
            employeeId:    input.employeeId,
            templateId:    input.templateId,
            templateVersion: tpl.version,
            probationDays: input.probationDays,
            snapshotName:  snapshot.name,
          },
        },
      });

      return {
        ...contract,
        resolvedBody,
        templateName:    tpl.name,
        templateVersion: tpl.version,
      };
    });
  }

  // ─── Preview draft ─────────────────────────────────────────────────────────

  /**
   * HU-19 §2 — Retorna el texto exacto del documento sin modificar estado.
   * El texto es idéntico al que se usaría para emitir el PDF.
   */
  async previewDraft(id: string): Promise<{
    text: string;
    templateName: string;
    templateVersion: number;
    status: string;
    contract: any;
  }> {
    const contract = await this.prisma.contractTemplate
      ? await this.prisma.contract.findUnique({ where: { id } })
      : null;

    // Fallback: direct query
    const c = await (this.prisma as any).contract.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Borrador no encontrado');

    const tpl = await this.resolveTemplate(this.prisma, c.templateId);

    let text: string;
    try {
      text = this.resolveBody(tpl.body, c.snapshot as EmployeeSnapshot, c.probationDays);
    } catch {
      // Legacy template with old-style variables — use legacy render
      text = tpl.body;
    }

    return {
      text,
      templateName:    tpl.name,
      templateVersion: tpl.version,
      status:          c.status,
      contract:        c,
    };
  }

  // ─── Update draft ──────────────────────────────────────────────────────────

  /**
   * HU-19 §3 — Actualiza plantilla/probationDays e incrementa versión interna.
   * Rechaza con 409 si el contrato ya fue emitido.
   */
  async updateDraft(
    id: string,
    input: UpdateDraftInput,
    snapshot: EmployeeSnapshot | null,
    actorId: string,
    reqId?: string,
  ) {
    return this.prisma.$transaction(async (tx: any) => {
      // Advisory lock to serialize concurrent edits
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;

      const c = await tx.contract.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Borrador no encontrado');

      // HU-19 Rule: reject edit if already EMITIDO
      if (c.status === 'EMITIDO' || c.status === 'ANULADO') {
        throw new ConflictException(DRAFT_EDIT_CONFLICT);
      }
      if (!['BORRADOR', 'ERROR_EMISION'].includes(c.status)) {
        throw new ConflictException('Solo se pueden editar borradores o emisiones fallidas');
      }

      // Optimistic concurrency
      if (c.version !== input.version) {
        throw new ConflictException(DRAFT_VERSION_STALE);
      }

      const tpl = await this.resolveTemplate(tx, input.templateId);
      if (!tpl.active) throw new ConflictException(TEMPLATE_NOT_ACTIVE);

      const newSnapshot = snapshot ?? c.snapshot;

      const updated = await tx.contract.update({
        where: { id },
        data: {
          templateId:    input.templateId,
          probationDays: input.probationDays,
          snapshot:      newSnapshot as any,
          status:        'BORRADOR',
          fileHash:      null,
          version:       { increment: 1 },
        },
      });

      await tx.contractAudit?.create({
        data: {
          resourceId: id,
          action:     'DRAFT_UPDATED',
          actorId,
          requestId:  reqId,
          details: {
            templateId:       input.templateId,
            templateVersion:  tpl.version,
            probationDays:    input.probationDays,
            snapshotRefreshed: snapshot !== null,
            newVersion:       updated.version,
          },
        },
      });

      return updated;
    });
  }
}

