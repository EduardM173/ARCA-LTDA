/**
 * HU-19 (ARCA-20) — Generar y previsualizar borrador de contrato vinculado a Personal
 *
 * Tests:
 *   PASS — Creación de borrador congela snapshot del funcionario activo
 *   PASS — Preview fidedigno sustituye variables {{nombre}}, {{cargo}}, {{salario}}, etc.
 *   PASS — Edición de borrador actualiza datos e incrementa versión
 *   FAIL (409) — Intento de editar contrato ya EMITIDO
 *   FAIL (400) — Funcionario no activo (status !== 'ACTIVO')
 *   FAIL (404) — Borrador no encontrado al previsualizar
 */
import assert from 'node:assert/strict';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ContractDraftsService,
  DRAFT_EDIT_CONFLICT,
  EMPLOYEE_NOT_ACTIVE,
  TEMPLATE_NOT_ACTIVE,
  DRAFT_VERSION_STALE,
  type EmployeeSnapshot,
} from '../apps/contract-service/src/contracts-draft.service';

// ─── Mock employee snapshots ──────────────────────────────────────────────────
const EMPLOYEE_ACTIVO: EmployeeSnapshot = {
  id:           '00000000-0000-4000-8000-000000000001',
  code:         'ARCA-001',
  name:         'María García López',
  hiredAt:      '2024-03-15',
  status:       'ACTIVO',
  currency:     'BOB',
  salary:       '8500.00',
  position:     { id: 'pos-01', name: 'Analista de Sistemas' },
  departmentId: 'dept-01',
  version:      3,
};

const EMPLOYEE_BAJA: EmployeeSnapshot = {
  ...EMPLOYEE_ACTIVO,
  id:     '00000000-0000-4000-8000-000000000002',
  status: 'BAJA',
  name:   'Juan Pérez Inactivo',
};

// ─── In-memory Prisma harness ─────────────────────────────────────────────────
type ContractRow = {
  id:            string;
  employeeId:    string;
  templateId:    string;
  probationDays: number;
  snapshot:      any;
  createdBy:     string;
  requestKey?:   string;
  status:        string;
  version:       number;
  fileHash?:     string | null;
  createdAt:     Date;
  updatedAt:     Date;
};

type TemplateRow = { id: string; title?: string; name?: string; body: string; version: number; status?: string; active?: boolean };
type AuditRow    = { id: string; resourceId: string; action: string; actorId: string; requestId?: string; details: any };

function makeHarness(opts: { initialContracts?: Partial<ContractRow>[]; templates?: TemplateRow[] } = {}) {
  const contracts: ContractRow[] = (opts.initialContracts || []).map(c => ({
    id:            c.id ?? `c-${Math.random().toString(36).slice(2)}`,
    employeeId:    c.employeeId ?? EMPLOYEE_ACTIVO.id,
    templateId:    c.templateId ?? 'tmpl-01',
    probationDays: c.probationDays ?? 90,
    snapshot:      c.snapshot ?? EMPLOYEE_ACTIVO,
    createdBy:     c.createdBy ?? 'actor-01',
    requestKey:    c.requestKey,
    status:        c.status ?? 'BORRADOR',
    version:       c.version ?? 1,
    fileHash:      c.fileHash ?? null,
    createdAt:     new Date(),
    updatedAt:     new Date(),
  }));

  const ctTemplates: TemplateRow[] = opts.templates ?? [
    {
      id: 'tmpl-01',
      title: 'Contrato Estándar HU-18',
      body: 'Empleado {{nombre}} en cargo {{cargo}} con salario {{salario}} desde {{fecha_ingreso}}. Prueba: {{periodo_prueba_dias}} días.',
      version: 1,
      status: 'ACTIVE',
    },
    {
      id: 'tmpl-archived',
      title: 'Plantilla Archivada',
      body: 'Texto {{nombre}}',
      version: 1,
      status: 'ARCHIVED',
    },
  ];

  const audits: AuditRow[] = [];
  let seq = 0;
  const nextId = () => `id-${++seq}`;

  const contractTable = {
    findUnique: async (opts: any): Promise<ContractRow | null> => {
      // Soporte para composite unique key createdBy_requestKey
      if (opts?.where?.createdBy_requestKey) {
        const { createdBy, requestKey } = opts.where.createdBy_requestKey;
        return contracts.find(c => c.createdBy === createdBy && c.requestKey === requestKey) ?? null;
      }
      return contracts.find(c => c.id === opts.where.id) ?? null;
    },
    findUniqueOrThrow: async (opts: any): Promise<ContractRow> => {
      const c = contracts.find(c => c.id === opts.where.id);
      if (!c) throw new NotFoundException('Borrador no encontrado');
      return c;
    },
    findFirst: async (opts: any): Promise<ContractRow | null> => {
      if (opts?.where?.createdBy_requestKey) {
        const { createdBy, requestKey } = opts.where.createdBy_requestKey;
        return contracts.find(c => c.createdBy === createdBy && c.requestKey === requestKey) ?? null;
      }
      return null;
    },
    create: async (opts: any): Promise<ContractRow> => {
      const row: ContractRow = {
        id:            nextId(),
        employeeId:    opts.data.employeeId,
        templateId:    opts.data.templateId,
        probationDays: opts.data.probationDays,
        snapshot:      opts.data.snapshot,
        createdBy:     opts.data.createdBy,
        requestKey:    opts.data.requestKey,
        status:        opts.data.status ?? 'BORRADOR',
        version:       opts.data.version ?? 1,
        fileHash:      null,
        createdAt:     new Date(),
        updatedAt:     new Date(),
      };
      contracts.push(row);
      return row;
    },
    update: async (opts: any): Promise<ContractRow> => {
      const idx = contracts.findIndex(c => c.id === opts.where.id);
      if (idx < 0) throw new NotFoundException('not found');
      const c = contracts[idx];
      // Apply all data fields except version (handle increment separately)
      const { version: versionUpdate, ...restData } = opts.data;
      Object.assign(c, restData);
      if (versionUpdate?.increment) {
        c.version = c.version + versionUpdate.increment;
      } else if (versionUpdate !== undefined) {
        c.version = versionUpdate;
      }
      c.updatedAt = new Date();
      return contracts[idx];
    },
  };

  const ctTemplateTable = {
    findUnique: async (opts: any): Promise<TemplateRow | null> =>
      ctTemplates.find(t => t.id === opts.where.id) ?? null,
  };

  const auditTable = {
    create: async (opts: any): Promise<AuditRow> => {
      const row: AuditRow = { id: nextId(), ...opts.data };
      audits.push(row);
      return row;
    },
  };

  const prisma: any = {
    contract:         contractTable,
    contractTemplate: ctTemplateTable,
    contractAudit:    auditTable,
    // No legacy template table in this harness — service falls back gracefully
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        contract:         contractTable,
        contractTemplate: ctTemplateTable,
        contractAudit:    auditTable,
        $executeRaw:      async (..._: any[]) => null,
      };
      return fn(tx);
    },
    // Expose internals for assertions
    _contracts: contracts,
    _audits:    audits,
  };

  return prisma;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════
async function runTests() {
  console.log('\n🔵 HU-19 — Generar y previsualizar borrador de contrato\n');

  // ── PASS 1: Crear borrador → snapshot congelado, versión = 1, status = BORRADOR ───
  {
    const prisma  = makeHarness();
    const service = new ContractDraftsService(prisma);

    const result = await service.createDraft(
      { employeeId: EMPLOYEE_ACTIVO.id, templateId: 'tmpl-01', probationDays: 90 },
      EMPLOYEE_ACTIVO,
      'actor-01',
      'req-001',
    );

    assert.equal(result.status,  'BORRADOR',          'status inicial debe ser BORRADOR');
    assert.equal(result.version, 1,                   'versión inicial debe ser 1');
    assert.equal(result.employeeId, EMPLOYEE_ACTIVO.id);
    assert.equal(result.templateId, 'tmpl-01');
    assert.equal(result.probationDays, 90);

    // Snapshot congelado con datos del funcionario
    assert.equal(result.snapshot?.name,     EMPLOYEE_ACTIVO.name,     'snapshot.name congelado');
    assert.equal(result.snapshot?.salary,   EMPLOYEE_ACTIVO.salary,   'snapshot.salary congelado');
    assert.equal(result.snapshot?.position?.name, EMPLOYEE_ACTIVO.position.name, 'snapshot.position.name congelado');
    assert.equal(result.snapshot?.status,   'ACTIVO',                 'snapshot.status debe ser ACTIVO al crear');

    // Texto resuelto en resultado
    assert.ok(result.resolvedBody, 'resolvedBody debe estar presente');
    assert.ok(result.resolvedBody.includes('María García López'), 'resolvedBody debe incluir nombre');
    assert.ok(result.resolvedBody.includes('Analista de Sistemas'), 'resolvedBody debe incluir cargo');
    assert.ok(result.resolvedBody.includes('8500.00'), 'resolvedBody debe incluir salario');

    // Auditoría registrada
    const audit = prisma._audits.find((a: AuditRow) => a.action === 'DRAFT_CREATED');
    assert.ok(audit, 'debe registrar auditoría DRAFT_CREATED');

    console.log('✔ PASS: Borrador creado — snapshot congelado, versión=1, status=BORRADOR, resolvedBody correcto.');
  }

  // ── PASS 2: Preview fidedigno — sustituye variables correctamente ────────────
  {
    const prisma  = makeHarness({
      initialContracts: [{
        id: 'draft-preview-01',
        templateId: 'tmpl-01',
        snapshot: EMPLOYEE_ACTIVO,
        probationDays: 60,
        status: 'BORRADOR',
      }],
    });
    const service = new ContractDraftsService(prisma);

    const preview = await service.previewDraft('draft-preview-01');

    assert.equal(preview.status, 'BORRADOR',                     'status del borrador en preview');
    assert.equal(preview.templateName, 'Contrato Estándar HU-18','nombre de plantilla en preview');
    assert.equal(preview.templateVersion, 1,                     'versión de plantilla en preview');
    assert.ok(preview.text,                                       'text no debe ser vacío');

    // Variables sustituidas correctamente
    assert.ok(preview.text.includes('María García López'), '{{nombre}} resuelto en preview');
    assert.ok(preview.text.includes('Analista de Sistemas'), '{{cargo}} resuelto en preview');
    assert.ok(preview.text.includes('8500.00'), '{{salario}} resuelto en preview');
    assert.ok(preview.text.includes('60'),      '{{periodo_prueba_dias}} resuelto en preview');
    assert.ok(!preview.text.includes('{{'),     'no deben quedar marcadores sin resolver');

    // Estado NO debe haber cambiado
    const c = prisma._contracts.find((x: ContractRow) => x.id === 'draft-preview-01');
    assert.equal(c?.status, 'BORRADOR', 'preview NO debe cambiar el estado del contrato');

    console.log('✔ PASS: Preview fidedigno — todas las variables resueltas, estado sin cambios.');
  }

  // ── PASS 3: Edición de borrador → versión incrementada ──────────────────────
  {
    const prisma  = makeHarness({
      initialContracts: [{
        id: 'draft-edit-01',
        templateId: 'tmpl-01',
        snapshot: EMPLOYEE_ACTIVO,
        probationDays: 90,
        status: 'BORRADOR',
        version: 1,
      }],
    });
    const service = new ContractDraftsService(prisma);

    const updated = await service.updateDraft(
      'draft-edit-01',
      { templateId: 'tmpl-01', probationDays: 120, version: 1, refreshSnapshot: false },
      null,   // no refresh de snapshot
      'actor-01',
      'req-002',
    );

    assert.equal(updated.version,       2,     'versión debe incrementarse a 2');
    assert.equal(updated.probationDays, 120,   'probationDays debe actualizarse a 120');
    assert.equal(updated.status,        'BORRADOR', 'status debe permanecer BORRADOR');

    // Snapshot NO cambia si refreshSnapshot = false
    assert.equal(updated.snapshot?.name, EMPLOYEE_ACTIVO.name, 'snapshot.name no debe cambiar');

    // Auditoría
    const audit = prisma._audits.find((a: AuditRow) => a.action === 'DRAFT_UPDATED');
    assert.ok(audit, 'debe registrar auditoría DRAFT_UPDATED');
    assert.equal(audit.details.newVersion, 2);

    console.log('✔ PASS: Edición de borrador — versión incrementada a 2, probationDays actualizado.');
  }

  // ── PASS 3b: Edición con refresh snapshot ───────────────────────────────────
  {
    const prisma = makeHarness({
      initialContracts: [{
        id: 'draft-edit-02',
        templateId: 'tmpl-01',
        snapshot: EMPLOYEE_ACTIVO,
        probationDays: 90,
        status: 'BORRADOR',
        version: 1,
      }],
    });
    const service = new ContractDraftsService(prisma);

    const freshSnap: EmployeeSnapshot = {
      ...EMPLOYEE_ACTIVO,
      salary:  '9200.00',
      version: 4,
      position: { id: 'pos-02', name: 'Jefe de Sistemas' },
    };

    const updated = await service.updateDraft(
      'draft-edit-02',
      { templateId: 'tmpl-01', probationDays: 90, version: 1, refreshSnapshot: true },
      freshSnap,
      'actor-01',
    );

    assert.equal(updated.version, 2, 'versión debe ser 2');
    assert.equal(updated.snapshot?.salary, '9200.00', 'snapshot.salary debe actualizarse con refresh');
    assert.equal(updated.snapshot?.position?.name, 'Jefe de Sistemas', 'snapshot.position actualizado');

    console.log('✔ PASS: Edición con refreshSnapshot=true — snapshot actualizado con nuevos datos del funcionario.');
  }

  // ── FAIL (409): Editar contrato EMITIDO ─────────────────────────────────────
  {
    const prisma = makeHarness({
      initialContracts: [{
        id: 'contract-emitido-01',
        status: 'EMITIDO',
        version: 5,
        snapshot: EMPLOYEE_ACTIVO,
      }],
    });
    const service = new ContractDraftsService(prisma);

    await assert.rejects(
      () => service.updateDraft(
        'contract-emitido-01',
        { templateId: 'tmpl-01', probationDays: 90, version: 5, refreshSnapshot: false },
        null,
        'actor-01',
      ),
      (err: any) => {
        assert.ok(err instanceof ConflictException, 'debe ser ConflictException');
        assert.equal(err.getStatus(), 409,              'HTTP status debe ser 409');
        assert.equal(err.message, DRAFT_EDIT_CONFLICT,  'mensaje correcto');
        return true;
      }
    );
    console.log('✔ PASS (409): Editar contrato EMITIDO denegado con HTTP 409 Conflict.');
  }

  // ── FAIL (409): Editar contrato ANULADO ─────────────────────────────────────
  {
    const prisma = makeHarness({
      initialContracts: [{
        id: 'contract-anulado-01',
        status: 'ANULADO',
        version: 3,
        snapshot: EMPLOYEE_ACTIVO,
      }],
    });
    const service = new ContractDraftsService(prisma);

    await assert.rejects(
      () => service.updateDraft(
        'contract-anulado-01',
        { templateId: 'tmpl-01', probationDays: 90, version: 3, refreshSnapshot: false },
        null,
        'actor-01',
      ),
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal(err.getStatus(), 409);
        return true;
      }
    );
    console.log('✔ PASS (409): Editar contrato ANULADO también denegado con HTTP 409.');
  }

  // ── FAIL (400): Funcionario no activo ───────────────────────────────────────
  {
    const prisma  = makeHarness();
    const service = new ContractDraftsService(prisma);

    await assert.rejects(
      () => service.createDraft(
        { employeeId: EMPLOYEE_BAJA.id, templateId: 'tmpl-01', probationDays: 90 },
        EMPLOYEE_BAJA,   // snapshot con status = 'BAJA'
        'actor-01',
      ),
      (err: any) => {
        assert.ok(err instanceof BadRequestException, 'debe ser BadRequestException');
        assert.equal(err.getStatus(), 400,            'HTTP status debe ser 400');
        assert.equal(err.message, EMPLOYEE_NOT_ACTIVE,'mensaje correcto');
        return true;
      }
    );
    console.log('✔ PASS (400): Funcionario dado de baja rechazado — HTTP 400 Bad Request.');
  }

  // ── FAIL (404): Borrador no encontrado en preview ───────────────────────────
  {
    const prisma  = makeHarness();  // sin contratos
    const service = new ContractDraftsService(prisma);

    await assert.rejects(
      () => service.previewDraft('id-inexistente-9999'),
      (err: any) => {
        assert.ok(err instanceof NotFoundException, 'debe ser NotFoundException');
        assert.equal(err.getStatus(), 404,          'HTTP status debe ser 404');
        return true;
      }
    );
    console.log('✔ PASS (404): Preview de borrador inexistente lanza HTTP 404.');
  }

  // ── FAIL (409): Concurrencia — versión desactualizada al editar ─────────────
  {
    const prisma = makeHarness({
      initialContracts: [{
        id: 'draft-stale-01',
        status: 'BORRADOR',
        version: 3,   // versión actual = 3
        snapshot: EMPLOYEE_ACTIVO,
      }],
    });
    const service = new ContractDraftsService(prisma);

    await assert.rejects(
      () => service.updateDraft(
        'draft-stale-01',
        { templateId: 'tmpl-01', probationDays: 90, version: 1, refreshSnapshot: false },  // version stale = 1
        null,
        'actor-01',
      ),
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal(err.getStatus(), 409);
        assert.equal(err.message, DRAFT_VERSION_STALE);
        return true;
      }
    );
    console.log('✔ PASS (409): Versión de borrador desactualizada — HTTP 409 con mensaje de concurrencia.');
  }

  // ── FAIL (409): Plantilla inactiva al crear borrador ────────────────────────
  {
    const prisma = makeHarness({
      templates: [
        {
          id: 'tmpl-archived',
          title: 'Plantilla Archivada',
          body: 'Texto {{nombre}}',
          version: 1,
          status: 'ARCHIVED',
        },
      ],
    });
    const service = new ContractDraftsService(prisma);

    await assert.rejects(
      () => service.createDraft(
        { employeeId: EMPLOYEE_ACTIVO.id, templateId: 'tmpl-archived', probationDays: 90 },
        EMPLOYEE_ACTIVO,
        'actor-01',
      ),
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal(err.getStatus(), 409);
        assert.equal(err.message, TEMPLATE_NOT_ACTIVE);
        return true;
      }
    );
    console.log('✔ PASS (409): Plantilla archivada rechazada al crear borrador.');
  }

  // ── PASS: Idempotencia con requestKey ────────────────────────────────────────
  {
    const prisma  = makeHarness();
    const service = new ContractDraftsService(prisma);
    const rk      = 'rk-00000000-0000-4000-8000-000000000001';

    const r1 = await service.createDraft(
      { employeeId: EMPLOYEE_ACTIVO.id, templateId: 'tmpl-01', probationDays: 90, requestKey: rk },
      EMPLOYEE_ACTIVO, 'actor-01'
    );
    // Segunda llamada con mismo requestKey → retorna el mismo borrador sin crear duplicado
    const r2 = await service.createDraft(
      { employeeId: EMPLOYEE_ACTIVO.id, templateId: 'tmpl-01', probationDays: 90, requestKey: rk },
      EMPLOYEE_ACTIVO, 'actor-01'
    );

    assert.equal(r1.id, r2.id, 'requestKey idempotente — mismo id devuelto');
    assert.equal(prisma._contracts.length, 1, 'no debe haber duplicado en la tabla');

    console.log('✔ PASS: requestKey idempotente — mismo borrador devuelto sin duplicar.');
  }

  console.log('\n✅ All HU-19 tests passed successfully!\n');
}

runTests().catch(error => {
  console.error('\n❌ Test execution failed:', error.message ?? error);
  process.exit(1);
});
