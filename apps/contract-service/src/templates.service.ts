import { Injectable, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '../generated/client';
import { z } from 'zod';

export const ALLOWED_TEMPLATE_VARIABLES = [
  'nombre',
  'cargo',
  'salario',
  'fecha_ingreso',
  'periodo_prueba_dias',
] as const;

export const INVALID_TEMPLATE_VARIABLES_OR_CODE =
  'La plantilla contiene variables no permitidas o código no sanitizado';

export type AllowedTemplateVariable = (typeof ALLOWED_TEMPLATE_VARIABLES)[number];

export function validateAndSanitizeTemplate(body: string, extraAllowed: string[] = []): boolean {
  if (typeof body !== 'string' || !body.trim()) {
    throw new UnprocessableEntityException(INVALID_TEMPLATE_VARIABLES_OR_CODE);
  }

  // 1. Detección de etiquetas ejecutables de script o código embebido
  const scriptRegex = /<script\b[^>]*>[\s\S]*?<\/script>|<script\b|<iframe\b|<embed\b|<object\b|javascript:|onerror\s*=|onload\s*=|onclick\s*=/i;
  if (scriptRegex.test(body)) {
    throw new UnprocessableEntityException(INVALID_TEMPLATE_VARIABLES_OR_CODE);
  }

  // Si contiene tags HTML sospechosos con atributos ejecutables o enlaces
  if (/<[^>]+>/i.test(body) && /(script|href|src|data:)/i.test(body)) {
    throw new UnprocessableEntityException(INVALID_TEMPLATE_VARIABLES_OR_CODE);
  }

  // 2. URLs sospechosas o esquemas de red
  if (/(https?:\/\/|file:\/\/|javascript:|data:|vbscript:)/i.test(body)) {
    throw new UnprocessableEntityException(INVALID_TEMPLATE_VARIABLES_OR_CODE);
  }

  // 3. Rutas de sistema sospechosas
  if (/(\/etc\/|\/var\/|\/proc\/|\/sys\/|[a-zA-Z]:\\|\.\.[\/\\])/i.test(body)) {
    throw new UnprocessableEntityException(INVALID_TEMPLATE_VARIABLES_OR_CODE);
  }

  // 4. Marcadores de llaves incompletos o mal formados
  const variablePattern = /{{\s*([^{}]+?)\s*}}/g;
  const stripped = body.replace(variablePattern, '');
  if (stripped.includes('{{') || stripped.includes('}}')) {
    throw new UnprocessableEntityException(INVALID_TEMPLATE_VARIABLES_OR_CODE);
  }

  // 5. Verificación estricta de variables permitidas
  const allowedSet = new Set<string>([...ALLOWED_TEMPLATE_VARIABLES, ...extraAllowed]);
  const matches = Array.from(body.matchAll(variablePattern));
  for (const match of matches) {
    const varName = match[1].trim();
    if (!allowedSet.has(varName)) {
      throw new UnprocessableEntityException(INVALID_TEMPLATE_VARIABLES_OR_CODE);
    }
  }

  return true;
}

export function renderContractTemplate(
  body: string,
  employee: Record<string, any>,
  probationDays: number
): string {
  validateAndSanitizeTemplate(body);
  const values: Record<string, string> = {
    nombre: String(employee.name || ''),
    cargo: String(employee.position?.name || employee.position || ''),
    salario: String(employee.salary || employee.salaries?.[0]?.amount || ''),
    fecha_ingreso: String(employee.hiredAt || '').slice(0, 10),
    periodo_prueba_dias: String(probationDays ?? 90),
  };
  return body.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => values[key] ?? '');
}

export const createTemplateSchema = z.object({
  title: z.string().trim().min(3).max(150),
  body: z.string().min(10).max(20000),
}).strict();

export const updateTemplateSchema = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  body: z.string().min(10).max(20000),
}).strict();

@Injectable()
export class ContractTemplatesService {
  constructor(private readonly prisma: PrismaClient) {}

  async listTemplates(status?: 'ACTIVE' | 'ARCHIVED') {
    const where: Prisma.ContractTemplateWhereInput = status ? { status } : {};
    return this.prisma.contractTemplate.findMany({
      where,
      orderBy: [{ title: 'asc' }, { version: 'desc' }],
    });
  }

  async getTemplateById(id: string) {
    const template = await this.prisma.contractTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    const contractsCount = await this.prisma.contract.count({
      where: { templateId: id },
    });
    const versions = await this.prisma.contractTemplate.findMany({
      where: { title: template.title },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        title: true,
        version: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      ...template,
      contractsCount,
      versions,
    };
  }

  async createTemplate(
    input: { title: string; body: string },
    actorId: string,
    requestId?: string,
    clientTx?: any
  ) {
    validateAndSanitizeTemplate(input.body);

    const execute = async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'contract-template:' + input.title}))`;

      // Regla HU-18: Al crear una nueva plantilla, se inicializa con version = 1 y status = 'ACTIVE'
      const created = await tx.contractTemplate.create({
        data: {
          title: input.title,
          body: input.body,
          version: 1,
          status: 'ACTIVE',
        },
      });

      if (tx.contractAudit) {
        await tx.contractAudit.create({
          data: {
            resourceId: created.id,
            action: 'TEMPLATE_CREATED',
            actorId,
            requestId,
            details: { title: created.title, version: created.version },
          },
        });
      }

      return created;
    };

    if (clientTx) {
      return execute(clientTx);
    }
    return this.prisma.$transaction(execute);
  }

  async updateTemplate(
    id: string,
    input: { title?: string; body: string },
    actorId: string,
    requestId?: string,
    clientTx?: any
  ) {
    validateAndSanitizeTemplate(input.body);

    const execute = async (tx: any) => {
      const current = await tx.contractTemplate.findUnique({
        where: { id },
      });
      if (!current) {
        throw new NotFoundException('Plantilla no encontrada');
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'contract-template:' + current.title}))`;

      const contractsCount = await tx.contract.count({
        where: { templateId: current.id },
      });

      const title = input.title || current.title;

      // Si ya fue utilizada para emitir contratos o borradores, versionar:
      // marcar la versión previa como conservada (ARCHIVED) y crear v+1
      if (contractsCount > 0) {
        await tx.contractTemplate.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
        });

        const maxVer = await tx.contractTemplate.findFirst({
          where: { title },
          orderBy: { version: 'desc' },
        });
        const nextVersion = (maxVer?.version || current.version) + 1;

        const nextTemplate = await tx.contractTemplate.create({
          data: {
            title,
            body: input.body,
            version: nextVersion,
            status: 'ACTIVE',
          },
        });

        if (tx.contractAudit) {
          await tx.contractAudit.create({
            data: {
              resourceId: nextTemplate.id,
              action: 'TEMPLATE_VERSIONED',
              actorId,
              requestId,
              details: {
                previousId: current.id,
                oldVersion: current.version,
                newVersion: nextTemplate.version,
                preservedContractsCount: contractsCount,
              },
            },
          });
        }

        return nextTemplate;
      }

      // Si aún no ha sido utilizada, actualizar la versión actual in-place
      const updated = await tx.contractTemplate.update({
        where: { id: current.id },
        data: {
          title,
          body: input.body,
          status: 'ACTIVE',
        },
      });

      if (tx.contractAudit) {
        await tx.contractAudit.create({
          data: {
            resourceId: updated.id,
            action: 'TEMPLATE_UPDATED',
            actorId,
            requestId,
            details: { version: updated.version },
          },
        });
      }

      return updated;
    };

    if (clientTx) {
      return execute(clientTx);
    }
    return this.prisma.$transaction(execute);
  }
}

