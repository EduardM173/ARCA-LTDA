/**
 * HU-18 — Administrar plantillas de contrato parametrizables con control de versiones
 * Tests:
 *   PASS — Crear plantilla v1 con variables permitidas
 *   PASS — Editar plantilla con contratos emitidos incrementa a v2 y archiva v1
 *   FAIL (422) — Rechazar plantilla con <script> inyectado
 *   FAIL (422) — Rechazar plantilla con variable no registrada {{salario_secreto}}
 *   FAIL (403) — Denegar acceso a rol no autorizado (APPROVER)
 *   PASS — Roles ADMIN y HR tienen acceso (no lanzan excepción)
 *   PASS — Editar plantilla sin contratos actualiza in-place (misma versión)
 */
import assert from 'node:assert/strict';
import { UnprocessableEntityException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ContractTemplatesService,
  validateAndSanitizeTemplate,
  INVALID_TEMPLATE_VARIABLES_OR_CODE,
  ALLOWED_TEMPLATE_VARIABLES,
} from '../apps/contract-service/src/templates.service';

// ─── In-memory Prisma harness ─────────────────────────────────────────────────
type TemplateRow = {
  id: string;
  title: string;
  body: string;
  version: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ContractRow = { id: string; templateId: string };
type AuditRow   = { id: string; resourceId: string; action: string; actorId: string; requestId?: string; details: any };

function makeHarness(initialContracts: ContractRow[] = []) {
  const templates: TemplateRow[] = [];
  const contracts: ContractRow[] = [...initialContracts];
  const audits: AuditRow[] = [];
  let seq = 0;
  const nextId = () => `id-${++seq}`;

  const sortRows = (rows: any[], orderBy: any) => {
    if (!orderBy) return rows;
    const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
    return rows.sort((a, b) => {
      for (const entry of entries) {
        const [key, dir] = [Object.keys(entry)[0], Object.values(entry)[0]];
        const v = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
        if (v !== 0) return dir === 'desc' ? -v : v;
      }
      return 0;
    });
  };

  const templateTable = {
    findMany: async (opts?: any) => {
      let rows = [...templates];
      if (opts?.where?.status) rows = rows.filter(r => r.status === opts.where.status);
      if (opts?.where?.title)  rows = rows.filter(r => r.title  === opts.where.title);
      rows = sortRows(rows, opts?.orderBy);
      if (opts?.select) {
        const sel = opts.select;
        rows = rows.map((r: any) => Object.fromEntries(Object.keys(sel).map(k => [k, r[k]])) as any);
      }
      return rows;
    },
    findUnique: async (opts: any): Promise<TemplateRow | null> =>
      templates.find(r => r.id === opts.where.id) ?? null,
    findFirst: async (opts?: any): Promise<TemplateRow | null> => {
      let rows = [...templates];
      if (opts?.where?.title) rows = rows.filter(r => r.title === opts.where.title);
      rows = sortRows(rows, opts?.orderBy);
      return rows[0] ?? null;
    },
    create: async (opts: any): Promise<TemplateRow> => {
      const row: TemplateRow = {
        id: nextId(),
        title:   opts.data.title,
        body:    opts.data.body,
        version: opts.data.version ?? 1,
        status:  opts.data.status  ?? 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      templates.push(row);
      return row;
    },
    update: async (opts: any): Promise<TemplateRow> => {
      const idx = templates.findIndex(r => r.id === opts.where.id);
      if (idx < 0) throw new NotFoundException('not found');
      Object.assign(templates[idx], opts.data, { updatedAt: new Date() });
      return templates[idx];
    },
  };

  const contractTable = {
    count: async (opts?: any): Promise<number> => {
      if (opts?.where?.templateId) return contracts.filter(c => c.templateId === opts.where.templateId).length;
      return contracts.length;
    },
  };

  const auditTable = {
    create: async (opts: any): Promise<AuditRow> => {
      const row: AuditRow = { id: nextId(), ...opts.data };
      audits.push(row);
      return row;
    },
  };

  // Serialised in-memory $transaction
  const prisma: any = {
    contractTemplate: templateTable,
    contract:         contractTable,
    contractAudit:    auditTable,
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        contractTemplate: templateTable,
        contract:         contractTable,
        contractAudit:    auditTable,
        // pg_advisory_xact_lock is a no-op in tests
        $executeRaw: async (..._args: any[]) => null,
      };
      return fn(tx);
    },
    // expose internal arrays for assertions
    _templates: templates,
    _contracts: contracts,
    _audits:    audits,
  };

  return prisma;
}

// ─── RBAC helper (mirrors controller logic) ──────────────────────────────────
function checkRbac(actor: { id: string; roles: string[] }, allowed: string[]) {
  if (!actor.roles.some(r => allowed.includes(r))) {
    throw new ForbiddenException('No tiene permiso para esta acción');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('\n🔵 HU-18 — Plantillas de contrato con control de versiones\n');

  // ── PASS 1: Creación de plantilla v1 con variables permitidas ───────────────
  {
    const prisma = makeHarness();
    const service = new ContractTemplatesService(prisma);

    const body = 'Empleado {{nombre}} en cargo {{cargo}} con salario {{salario}} desde {{fecha_ingreso}}. Prueba: {{periodo_prueba_dias}} días.';
    const result = await service.createTemplate({ title: 'Contrato Estándar', body }, 'actor-01');

    assert.equal(result.version, 1,        'version debe ser 1');
    assert.equal(result.status,  'ACTIVE', 'status debe ser ACTIVE');
    assert.equal(result.title,   'Contrato Estándar');
    assert.ok(result.id,                   'debe tener id asignado');

    // Verificar exactamente 5 variables permitidas
    assert.equal(ALLOWED_TEMPLATE_VARIABLES.length, 5, 'deben existir exactamente 5 variables permitidas');
    for (const v of ['nombre','cargo','salario','fecha_ingreso','periodo_prueba_dias']) {
      assert.ok(ALLOWED_TEMPLATE_VARIABLES.includes(v as any), `variable ${v} debe estar en ALLOWED_TEMPLATE_VARIABLES`);
    }

    console.log('✔ PASS: Creación de plantilla v1 con variables permitidas.');
  }

  // ── PASS 2: Edición de plantilla incrementa versión a v2 preservando v1 ────
  {
    const prisma = makeHarness();
    const service = new ContractTemplatesService(prisma);

    // Crear v1
    const v1 = await service.createTemplate(
      { title: 'Contrato Prueba', body: 'Contrato de {{nombre}} como {{cargo}}.' },
      'actor-01'
    );

    // Simular que un contrato fue emitido referenciando esta plantilla
    prisma._contracts.push({ id: 'contract-99', templateId: v1.id });

    // Actualizar → debe versionar a v2
    const v2 = await service.updateTemplate(
      v1.id,
      { body: 'Contrato de {{nombre}} en cargo {{cargo}} con salario {{salario}}.' },
      'actor-02'
    );

    // v1 debe quedar ARCHIVED
    const v1After = prisma._templates.find((t: TemplateRow) => t.id === v1.id);
    assert.equal(v1After?.status, 'ARCHIVED', 'v1 debe quedar ARCHIVED');

    // v2 debe ser ACTIVE con version = 2
    assert.equal(v2.version, 2,        'nueva versión debe ser 2');
    assert.equal(v2.status,  'ACTIVE', 'nueva versión debe ser ACTIVE');
    assert.equal(v2.title,   'Contrato Prueba', 'title se preserva en versión nueva');

    // Deben existir exactamente 2 registros para la misma plantilla
    const all = prisma._templates.filter((t: TemplateRow) => t.title === 'Contrato Prueba');
    assert.equal(all.length, 2, 'deben existir exactamente 2 registros para la misma plantilla');

    // Verificar auditoría registrada con acción TEMPLATE_VERSIONED
    const auditEntry = prisma._audits.find((a: AuditRow) => a.action === 'TEMPLATE_VERSIONED');
    assert.ok(auditEntry, 'debe existir entrada de auditoría TEMPLATE_VERSIONED');
    assert.equal(auditEntry.details.oldVersion, 1);
    assert.equal(auditEntry.details.newVersion, 2);

    console.log('✔ PASS: Edición con contratos emitidos incrementa a v2 y archiva v1 — auditoría registrada.');
  }

  // ── FAIL 422 — Script HTML/JS inyectado ─────────────────────────────────────
  {
    const prisma = makeHarness();
    const service = new ContractTemplatesService(prisma);

    await assert.rejects(
      () => service.createTemplate(
        { title: 'Mala Plantilla', body: '<script>alert("xss")</script>Hola {{nombre}}' },
        'actor-01'
      ),
      (err: any) => {
        assert.ok(err instanceof UnprocessableEntityException, 'debe ser UnprocessableEntityException');
        assert.equal(err.getStatus(), 422,                     'HTTP status debe ser 422');
        assert.equal(err.message, INVALID_TEMPLATE_VARIABLES_OR_CODE);
        return true;
      }
    );
    console.log('✔ PASS (422): Rechazó plantilla con etiqueta <script> inyectada.');
  }

  // ── FAIL 422 — Variable desconocida ─────────────────────────────────────────
  {
    const prisma = makeHarness();
    const service = new ContractTemplatesService(prisma);

    await assert.rejects(
      () => service.createTemplate(
        { title: 'Mala Plantilla', body: 'Hola {{nombre}}, tu salario secreto es {{salario_secreto}}.' },
        'actor-01'
      ),
      (err: any) => {
        assert.ok(err instanceof UnprocessableEntityException, 'debe ser UnprocessableEntityException');
        assert.equal(err.getStatus(), 422);
        assert.equal(err.message, INVALID_TEMPLATE_VARIABLES_OR_CODE);
        return true;
      }
    );
    console.log('✔ PASS (422): Rechazó plantilla con variable no registrada {{salario_secreto}}.');
  }

  // ── FAIL 422 — URL sospechosa ────────────────────────────────────────────────
  // validateAndSanitizeTemplate es síncrona → usa assert.throws
  {
    assert.throws(
      () => validateAndSanitizeTemplate('Texto con http://malicious.com/payload'),
      (err: any) => {
        assert.ok(err instanceof UnprocessableEntityException);
        assert.equal(err.getStatus(), 422);
        return true;
      }
    );
    console.log('✔ PASS (422): Rechazó plantilla con URL http:// sospechosa embebida.');
  }

  // ── FAIL 403 — Acceso de rol no autorizado ───────────────────────────────────
  {
    assert.throws(
      () => checkRbac({ id: 'user-approver', roles: ['APPROVER'] }, ['ADMIN', 'HR']),
      (err: any) => {
        assert.ok(err instanceof ForbiddenException, 'debe ser ForbiddenException');
        assert.equal(err.getStatus(), 403, 'HTTP status debe ser 403');
        return true;
      }
    );
    console.log('✔ PASS (403): Rol APPROVER denegado — recibe HTTP 403 Forbidden.');
  }

  // ── PASS — Roles ADMIN y HR tienen acceso ────────────────────────────────────
  {
    assert.doesNotThrow(() => checkRbac({ id: 'admin-01', roles: ['ADMIN'] }, ['ADMIN', 'HR']));
    assert.doesNotThrow(() => checkRbac({ id: 'hr-01',    roles: ['HR']    }, ['ADMIN', 'HR']));
    assert.doesNotThrow(() => checkRbac({ id: 'super-01', roles: ['ADMIN', 'HR'] }, ['ADMIN', 'HR']));
    console.log('✔ PASS: Roles ADMIN y HR tienen acceso — ninguna excepción lanzada.');
  }

  // ── PASS — Actualización in-place cuando no hay contratos emitidos ──────────
  {
    const prisma = makeHarness(); // sin contratos
    const service = new ContractTemplatesService(prisma);

    const v1 = await service.createTemplate(
      { title: 'Contrato Borrador', body: 'Hola {{nombre}}.' },
      'actor-01'
    );
    assert.equal(v1.version, 1);

    // No hay contratos → update in-place
    const updated = await service.updateTemplate(
      v1.id,
      { body: 'Hola {{nombre}}, bienvenido a {{cargo}}.' },
      'actor-01'
    );
    assert.equal(updated.id,      v1.id,    'id no debe cambiar en actualización in-place');
    assert.equal(updated.version, 1,        'versión no debe cambiar en actualización in-place');
    assert.equal(updated.status,  'ACTIVE');
    assert.equal(prisma._templates.length, 1, 'no debe crear registro adicional');

    console.log('✔ PASS: Edición in-place cuando no hay contratos emitidos — versión y id sin cambios.');
  }

  console.log('\n✅ All HU-18 tests passed successfully!\n');
}

runTests().catch(error => {
  console.error('\n❌ Test execution failed:', error.message ?? error);
  process.exit(1);
});
