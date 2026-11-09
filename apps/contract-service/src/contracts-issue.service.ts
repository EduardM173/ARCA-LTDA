/**
 * HU-20 (ARCA-21) — Emitir contrato inmutable con generación de PDF descargable e inmutabilidad salarial
 *
 * Lógica de negocio (T09, T10):
 *  - issueContract   : valida estado BORRADOR/EMITIENDO, resuelve template, genera PDF físico,
 *                      guarda fileHash SHA-256, congela snapshot de forma inmutable y pasa a EMITIDO.
 *  - getContractPdf  : valida estado EMITIDO y firma de archivo, sirve buffer binario con Content-Disposition.
 *  - Inmutabilidad   : cambios salariales posteriores en Personal NO modifican el snapshot ni el PDF emitido (T09).
 */
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '../generated/client';
import { renderContractTemplate } from './templates.service';
import { generatePdf, readPdf } from '../../../packages/platform/src/documents';

// ─── Error constants ──────────────────────────────────────────────────────────
export const CONTRACT_ALREADY_ISSUED   = 'El contrato ya fue emitido previamente';
export const CONTRACT_VOIDED           = 'No se puede emitir un contrato anulado';
export const CONTRACT_NOT_EMITTABLE    = 'Solo se pueden emitir contratos en estado BORRADOR o con emisión interrumpida';
export const EMPLOYEE_BAJA_CONFLICT    = 'No se puede emitir contrato para un funcionario en estado BAJA';
export const TEMPLATE_NOT_ACTIVE       = 'La plantilla está desactivada; seleccione una versión activa';
export const PDF_NOT_YET_ISSUED        = 'Documento no emitido; solo se descargan contratos emitidos';
export const PDF_INTEGRITY_ERROR       = 'Documento histórico no disponible o integridad inválida; requiere restaurar una copia de respaldo autorizada';

export interface ContractIssueResult {
  id:            string;
  employeeId:    string;
  templateId:    string;
  status:        string;
  fileHash:      string;
  issuedAt:      Date;
  version:       number;
  snapshot:      any;
  probationDays: number;
  pdfUrl:        string;
}

export interface IssueOptions {
  requestId?:        string;
  employeeFetcher?:  (empId: string) => Promise<any>;
  pdfGenerator?:     (id: string, title: string, lines: string[]) => Promise<string>;
  pdfReader?:        (id: string, hash: string) => Promise<Buffer>;
}

@Injectable()
export class ContractIssueService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resuelve la plantilla activa (moderna o legado).
   */
  private async resolveTemplate(tx: any, templateId: string) {
    if (tx.contractTemplate) {
      const modern = await tx.contractTemplate.findUnique({ where: { id: templateId } });
      if (modern) {
        return {
          id:       modern.id,
          name:     modern.title,
          body:     modern.body,
          version:  modern.version,
          active:   modern.status === 'ACTIVE',
          isModern: true,
        };
      }
    }
    if (tx.template) {
      const legacy = await tx.template.findUnique({ where: { id: templateId } });
      if (legacy) {
        return {
          id:       legacy.id,
          name:     legacy.name,
          body:     legacy.body,
          version:  legacy.version,
          active:   legacy.active,
          isModern: false,
        };
      }
    }
    throw new NotFoundException('Plantilla no encontrada');
  }

  /**
   * Resuelve el texto del contrato con el snapshot congelado.
   */
  private resolveBody(tpl: { body: string; isModern?: boolean }, snapshot: any, probationDays: number): string {
    if (tpl.isModern) {
      return renderContractTemplate(tpl.body, snapshot, probationDays);
    }
    return tpl.body
      .replace(/{{nombre}}|{{name}}/g, snapshot.name || '')
      .replace(/{{cargo}}|{{position}}/g, snapshot.position?.name || snapshot.position || '')
      .replace(/{{salario}}|{{salary}}/g, String(snapshot.salary || ''))
      .replace(/{{moneda}}|{{currency}}/g, snapshot.currency || 'BOB')
      .replace(/{{fecha_ingreso}}|{{hiredAt}}/g, String(snapshot.hiredAt || ''))
      .replace(/{{periodo_prueba_dias}}|{{probationDays}}/g, String(probationDays));
  }

  /**
   * HU-20 §1 — Emisión de contrato inmutable con generación de PDF.
   * Transición: BORRADOR -> EMITIENDO -> EMITIDO.
   * Almacena fileHash SHA-256 e inmutabilidad salarial (T09, T10).
   */
  async issueContract(
    contractId: string,
    actorId:    string,
    options:    IssueOptions = {},
  ): Promise<ContractIssueResult> {
    const runTransaction = async (tx: any) => {
      // 1. Obtener contrato
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) {
        throw new NotFoundException('Contrato no encontrado');
      }

      const wasRecovered = contract.status === 'EMITIENDO';

      // 2. Comprobaciones de estado
      if (contract.status === 'EMITIDO') {
        throw new ConflictException(CONTRACT_ALREADY_ISSUED);
      }
      if (contract.status === 'ANULADO') {
        throw new ConflictException(CONTRACT_VOIDED);
      }
      if (!['BORRADOR', 'EMITIENDO', 'ERROR_EMISION'].includes(contract.status)) {
        throw new ConflictException(CONTRACT_NOT_EMITTABLE);
      }

      // 3. Validar empleado (si está en BAJA rechaza emisión)
      const snap = contract.snapshot as any;
      if (snap?.status === 'BAJA') {
        throw new BadRequestException(EMPLOYEE_BAJA_CONFLICT);
      }

      // 4. Validar plantilla activa
      const tpl = await this.resolveTemplate(tx, contract.templateId);
      if (!tpl.active) {
        throw new ConflictException(TEMPLATE_NOT_ACTIVE);
      }

      // 5. Validar política si es rectificación
      if (contract.originalId && tx.contractPolicy) {
        const policy = await tx.contractPolicy.findFirst({ orderBy: { approvedAt: 'desc' } });
        if (!policy?.allowRectification) {
          throw new ConflictException('Requiere política de rectificación aprobada');
        }
      }

      // 6. Transición a EMITIENDO
      await tx.contract.update({
        where: { id: contractId },
        data:  { status: 'EMITIENDO' },
      });

      // 7. Generar PDF físico
      const renderedText = this.resolveBody(tpl, snap, contract.probationDays);
      const lines = [
        `Plantilla: ${tpl.name} · Versión ${tpl.version}`,
        ...(contract.originalId ? [`Rectifica el documento: ${contract.originalId}`] : []),
        '',
        renderedText,
      ];

      const genPdf = options.pdfGenerator || generatePdf;
      const chkPdf = options.pdfReader || readPdf;

      let fileHash: string;
      try {
        fileHash = await genPdf(contractId, `Contrato de Trabajo · ${contractId}`, lines);
        await chkPdf(contractId, fileHash);
      } catch (err) {
        // En caso de fallo de IO o generación, marca ERROR_EMISION para recuperación
        await tx.contract.update({
          where: { id: contractId },
          data:  { status: 'ERROR_EMISION' },
        }).catch(() => {});
        throw new BadRequestException('Fallo al generar archivo PDF del contrato; el borrador se conserva para reintento');
      }

      // 8. Pasar a EMITIDO con fileHash y fecha de emisión
      const issuedAt = new Date();
      const updated = await tx.contract.update({
        where: { id: contractId },
        data: {
          status:   'EMITIDO',
          fileHash,
          issuedAt,
          version:  { increment: 1 },
        },
      });

      // 9. Auditoría de emisión
      if (tx.contractAudit) {
        await tx.contractAudit.create({
          data: {
            resourceId: contractId,
            action:     wasRecovered ? 'ISSUE_RECOVERED' : 'ISSUED',
            actorId,
            requestId:  options.requestId,
            details: {
              fileHash,
              templateId:      contract.templateId,
              templateVersion: tpl.version,
              probationDays:   contract.probationDays,
              snapshotSalary:  snap?.salary,
              snapshotCurrency:snap?.currency,
              originalId:      contract.originalId,
            },
          },
        });
      }

      return {
        id:            updated.id,
        employeeId:    updated.employeeId,
        templateId:    updated.templateId,
        status:        'EMITIDO',
        fileHash,
        issuedAt,
        version:       updated.version,
        snapshot:      updated.snapshot,
        probationDays: updated.probationDays,
        pdfUrl:        `/api/v1/contracts/${contractId}/pdf`,
      };
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(runTransaction);
    }
    return runTransaction(this.prisma);
  }

  /**
   * HU-20 §2 — Descarga de PDF histórico autenticado.
   */
  async getContractPdf(
    contractId: string,
    actorId:    string,
    options:    Pick<IssueOptions, 'pdfReader'> = {},
  ): Promise<{ data: Buffer; filename: string; contentType: string; fileHash: string }> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }

    if (!['EMITIDO', 'ANULADO'].includes(contract.status) || !contract.fileHash) {
      throw new ConflictException(PDF_NOT_YET_ISSUED);
    }

    const chkPdf = options.pdfReader || readPdf;
    try {
      const data = await chkPdf(contractId, contract.fileHash);
      return {
        data,
        filename:    `contrato-${contractId}.pdf`,
        contentType: 'application/pdf',
        fileHash:    contract.fileHash,
      };
    } catch {
      throw new HttpException(PDF_INTEGRITY_ERROR, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
