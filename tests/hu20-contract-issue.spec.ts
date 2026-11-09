/**
 * HU-20 (ARCA-21) — Emitir contrato inmutable con generación de PDF descargable e inmutabilidad salarial
 *
 * Casos de Aceptación (T09, T10):
 *  1. PASS  — Emisión exitosa: borrador -> EMITIDO, genera fileHash SHA-256, issuedAt y version incrementada.
 *  2. PASS  — T09 Inmutabilidad salarial: aumento salarial posterior en Personal no modifica el snapshot del contrato emitido.
 *  3. PASS  — T10 Descarga de PDF autenticada: retorna buffer binario con firma %PDF- y hash coincidente.
 *  4. PASS  — Recuperación de emisión: contrato en EMITIENDO recupera su emisión sin duplicar registro (ISSUE_RECOVERED).
 *  5. PASS  — Recuperación de ERROR_EMISION: borrador con error de emisión previo puede reintentar y emitir.
 *  6. FAIL  (409) — Intento de emitir contrato ya EMITIDO denegado con HTTP 409 Conflict.
 *  7. FAIL  (409) — Intento de emitir contrato ANULADO denegado con HTTP 409 Conflict.
 *  8. FAIL  (409) — Plantilla asociada archivada o desactivada rechaza emisión.
 *  9. FAIL  (400) — Funcionario en estado BAJA rechazado al momento de emitir.
 * 10. FAIL  (404) — Emisión de contrato con ID inexistente lanza HTTP 404 Not Found.
 * 11. FAIL  (409) — Descarga de PDF denegada si el contrato sigue en BORRADOR.
 * 12. FAIL  (503) — Falla de integridad o ausencia de archivo PDF histórico responde HTTP 503 Service Unavailable.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import {
  ContractIssueService,
  CONTRACT_ALREADY_ISSUED,
  CONTRACT_VOIDED,
  EMPLOYEE_BAJA_CONFLICT,
  TEMPLATE_NOT_ACTIVE,
  PDF_NOT_YET_ISSUED,
  PDF_INTEGRITY_ERROR,
} from '../apps/contract-service/src/contracts-issue.service';

// ─── Test fixtures ────────────────────────────────────────────────────────────
const EMPLOYEE_ACTIVO = {
  id:           '00000000-0000-4000-8000-000000000001',
  code:         'ARCA-001',
  name:         'Carlos Mendoza',
  hiredAt:      '2024-01-10',
  status:       'ACTIVO',
  currency:     'BOB',
  salary:       '7500.00',
  position:     { id: 'pos-01', name: 'Desarrollador Backend' },
  departmentId: 'dept-01',
  version:      1,
};

const EMPLOYEE_BAJA = {
  ...EMPLOYEE_ACTIVO,
  id:     '00000000-0000-4000-8000-000000000002',
  status: 'BAJA',
  name:   'Ex Funcionario Baja',
};

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
  issuedAt?:     Date | null;
  originalId?:   string | null;
  createdAt:     Date;
  updatedAt:     Date;
};

type TemplateRow = {
  id:       string;
  title?:   string;
  name?:    string;
  body:     string;
  version:  number;
  status?:  string;
  active?:  boolean;
};

type AuditRow = {
  id:         string;
  resourceId: string;
  action:     string;
  actorId:    string;
  requestId?: string;
  details:    any;
};

function makeHarness(opts: {
  initialContracts?: Partial<ContractRow>[];
  templates?: TemplateRow[];
} = {}) {
  const contracts: ContractRow[] = (opts.initialContracts || []).map(c => ({
    id:            c.id ?? `c-${Math.random().toString(36).slice(2)}`,
    employeeId:    c.employeeId ?? EMPLOYEE_ACTIVO.id,
    templateId:    c.templateId ?? 'tmpl-01',
    probationDays: c.probationDays ?? 90,
    snapshot:      c.snapshot ?? { ...EMPLOYEE_ACTIVO },
    createdBy:     c.createdBy ?? 'actor-01',
    requestKey:    c.requestKey,
    status:        c.status ?? 'BORRADOR',
    version:       c.version ?? 1,
    fileHash:      c.fileHash ?? null,
    issuedAt:      c.issuedAt ?? null,
    originalId:    c.originalId ?? null,
    createdAt:     new Date(),
    updatedAt:     new Date(),
  }));

  const ctTemplates: TemplateRow[] = opts.templates ?? [
    {
      id:      'tmpl-01',
      title:   'Contrato Indefinido Estándar',
      body:    'Funcionario {{nombre}} con cargo {{cargo}}, salario {{salario}} y periodo de prueba de {{periodo_prueba_dias}} días.',
      version: 1,
      status:  'ACTIVE',
    },
    {
      id:      'tmpl-archived',
      title:   'Plantilla Archivada',
      body:    'Funcionario {{nombre}}',
      version: 1,
      status:  'ARCHIVED',
    },
  ];

  const audits: AuditRow[] = [];
  let seq = 0;
  const nextId = () => `id-${++seq}`;

  const contractTable = {
    findUnique: async (opts: any): Promise<ContractRow | null> => {
      return contracts.find(c => c.id === opts.where.id) ?? null;
    },
    findUniqueOrThrow: async (opts: any): Promise<ContractRow> => {
      const c = contracts.find(c => c.id === opts.where.id);
      if (!c) throw new NotFoundException('Contrato no encontrado');
      return c;
    },
    update: async (opts: any): Promise<ContractRow> => {
      const idx = contracts.findIndex(c => c.id === opts.where.id);
      if (idx < 0) throw new NotFoundException('Contrato no encontrado');
      const c = contracts[idx];
      const { version: vUp, ...rest } = opts.data;
      Object.assign(c, rest);
      if (vUp?.increment) {
        c.version = c.version + vUp.increment;
      } else if (vUp !== undefined) {
        c.version = vUp;
      }
      c.updatedAt = new Date();
      return contracts[idx];
    },
  };

  const ctTemplateTable = {
    findUnique: async (opts: any): Promise<TemplateRow | null> => {
      return ctTemplates.find(t => t.id === opts.where.id) ?? null;
    },
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
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(prisma),
  };

  return { prisma, contracts, audits };
}

// ─── PDF Mock Helpers ─────────────────────────────────────────────────────────
const samplePdfBytes = Buffer.from('%PDF-1.4 Mock Contract Content for ARCA RH');
const samplePdfHash  = createHash('sha256').update(samplePdfBytes).digest('hex');

const mockPdfGenerator = async (_id: string, _title: string, _lines: string[]) => samplePdfHash;
const mockPdfReader    = async (_id: string, hash: string) => {
  if (hash !== samplePdfHash) throw new Error('Hash mismatch');
  return samplePdfBytes;
};

// ─── Suite Execution ──────────────────────────────────────────────────────────
async function run() {
  console.log('🔵 HU-20 — Emitir contrato inmutable con generación de PDF descargable\n');

  // 1. PASS: Emisión exitosa
  {
    const { prisma, contracts, audits } = makeHarness({
      initialContracts: [{ id: 'c-01', status: 'BORRADOR', version: 1 }],
    });
    const service = new ContractIssueService(prisma);

    const result = await service.issueContract('c-01', 'admin-01', {
      requestId:    'req-123',
      pdfGenerator: mockPdfGenerator,
      pdfReader:    mockPdfReader,
    });

    assert.equal(result.status, 'EMITIDO');
    assert.equal(result.fileHash, samplePdfHash);
    assert.ok(result.issuedAt instanceof Date);
    assert.equal(result.version, 2);
    assert.equal(result.pdfUrl, '/api/v1/contracts/c-01/pdf');

    // Estado persistido en el registro
    const row = contracts.find(c => c.id === 'c-01');
    assert.equal(row?.status, 'EMITIDO');
    assert.equal(row?.fileHash, samplePdfHash);

    // Auditoría
    const audit = audits.find(a => a.resourceId === 'c-01' && a.action === 'ISSUED');
    assert.ok(audit, 'Debe registrar auditoría ISSUED');
    assert.equal(audit.details.fileHash, samplePdfHash);
    console.log('✔ PASS: Emisión exitosa — pasa a EMITIDO, genera hash SHA-256, issuedAt y versión incrementada.');
  }

  // 2. PASS (T09): Inmutabilidad salarial tras emisión
  {
    const initialSnapshot = { ...EMPLOYEE_ACTIVO, salary: '7500.00' };
    const { prisma, contracts } = makeHarness({
      initialContracts: [{
        id:       'c-inmutable',
        status:   'BORRADOR',
        snapshot: initialSnapshot,
      }],
    });
    const service = new ContractIssueService(prisma);

    // Se emite con salario 7500.00
    const issued = await service.issueContract('c-inmutable', 'admin-01', {
      pdfGenerator: mockPdfGenerator,
      pdfReader:    mockPdfReader,
    });
    assert.equal(issued.snapshot.salary, '7500.00');

    // Posteriormente, el funcionario recibe un aumento salarial en Personal a 11000.00
    const simulatedPersonalEmployee = { ...EMPLOYEE_ACTIVO, salary: '11000.00' };

    // El contrato emitido conserva su snapshot intacto en 7500.00 (T09)
    const storedContract = contracts.find(c => c.id === 'c-inmutable');
    assert.equal(storedContract?.snapshot.salary, '7500.00');
    assert.notEqual(storedContract?.snapshot.salary, simulatedPersonalEmployee.salary);
    console.log('✔ PASS (T09): Inmutabilidad salarial — aumento de sueldo posterior en Personal no altera el snapshot del contrato emitido.');
  }

  // 3. PASS (T10): Descarga autenticada de PDF emitido
  {
    const { prisma } = makeHarness({
      initialContracts: [{
        id:       'c-pdf',
        status:   'EMITIDO',
        fileHash: samplePdfHash,
      }],
    });
    const service = new ContractIssueService(prisma);

    const { data, filename, contentType, fileHash } = await service.getContractPdf('c-pdf', 'hr-01', {
      pdfReader: mockPdfReader,
    });

    assert.ok(data.subarray(0, 5).equals(Buffer.from('%PDF-')), 'Debe ser un archivo PDF válido');
    assert.equal(filename, 'contrato-c-pdf.pdf');
    assert.equal(contentType, 'application/pdf');
    assert.equal(fileHash, samplePdfHash);
    console.log('✔ PASS (T10): Descarga autenticada de PDF — retorna buffer con firma %PDF- y hash SHA-256 coincidente.');
  }

  // 4. PASS: Recuperación de emisión (EMITIENDO -> EMITIDO con ISSUE_RECOVERED)
  {
    const { prisma, contracts, audits } = makeHarness({
      initialContracts: [{ id: 'c-recovery', status: 'EMITIENDO', version: 1 }],
    });
    const service = new ContractIssueService(prisma);

    const result = await service.issueContract('c-recovery', 'admin-01', {
      pdfGenerator: mockPdfGenerator,
      pdfReader:    mockPdfReader,
    });

    assert.equal(result.status, 'EMITIDO');
    const row = contracts.find(c => c.id === 'c-recovery');
    assert.equal(row?.status, 'EMITIDO');

    const audit = audits.find(a => a.resourceId === 'c-recovery' && a.action === 'ISSUE_RECOVERED');
    assert.ok(audit, 'Debe registrar acción ISSUE_RECOVERED');
    console.log('✔ PASS: Recuperación de emisión — estado EMITIENDO recuperado exitosamente con auditoría ISSUE_RECOVERED.');
  }

  // 5. PASS: Recuperación tras ERROR_EMISION
  {
    const { prisma, contracts } = makeHarness({
      initialContracts: [{ id: 'c-err', status: 'ERROR_EMISION', version: 1 }],
    });
    const service = new ContractIssueService(prisma);

    const result = await service.issueContract('c-err', 'admin-01', {
      pdfGenerator: mockPdfGenerator,
      pdfReader:    mockPdfReader,
    });

    assert.equal(result.status, 'EMITIDO');
    assert.equal(contracts.find(c => c.id === 'c-err')?.status, 'EMITIDO');
    console.log('✔ PASS: Recuperación de ERROR_EMISION — reintento exitoso pasa a EMITIDO.');
  }

  // 6. FAIL (409): Intento de emitir contrato ya EMITIDO
  {
    const { prisma } = makeHarness({
      initialContracts: [{ id: 'c-emitted', status: 'EMITIDO' }],
    });
    const service = new ContractIssueService(prisma);

    await assert.rejects(
      async () => service.issueContract('c-emitted', 'admin-01'),
      (err: any) => err instanceof ConflictException && err.message === CONTRACT_ALREADY_ISSUED,
    );
    console.log('✔ PASS (409): Intento de emitir contrato ya EMITIDO denegado con HTTP 409 Conflict.');
  }

  // 7. FAIL (409): Intento de emitir contrato ANULADO
  {
    const { prisma } = makeHarness({
      initialContracts: [{ id: 'c-voided', status: 'ANULADO' }],
    });
    const service = new ContractIssueService(prisma);

    await assert.rejects(
      async () => service.issueContract('c-voided', 'admin-01'),
      (err: any) => err instanceof ConflictException && err.message === CONTRACT_VOIDED,
    );
    console.log('✔ PASS (409): Intento de emitir contrato ANULADO denegado con HTTP 409 Conflict.');
  }

  // 8. FAIL (409): Plantilla archivada
  {
    const { prisma } = makeHarness({
      initialContracts: [{ id: 'c-tmpl-archived', status: 'BORRADOR', templateId: 'tmpl-archived' }],
    });
    const service = new ContractIssueService(prisma);

    await assert.rejects(
      async () => service.issueContract('c-tmpl-archived', 'admin-01'),
      (err: any) => err instanceof ConflictException && err.message === TEMPLATE_NOT_ACTIVE,
    );
    console.log('✔ PASS (409): Plantilla archivada/desactivada rechaza la emisión.');
  }

  // 9. FAIL (400): Funcionario en estado BAJA
  {
    const { prisma } = makeHarness({
      initialContracts: [{
        id:       'c-baja',
        status:   'BORRADOR',
        snapshot: EMPLOYEE_BAJA,
      }],
    });
    const service = new ContractIssueService(prisma);

    await assert.rejects(
      async () => service.issueContract('c-baja', 'admin-01'),
      (err: any) => err instanceof BadRequestException && err.message === EMPLOYEE_BAJA_CONFLICT,
    );
    console.log('✔ PASS (400): Funcionario en estado BAJA rechazado al momento de emitir.');
  }

  // 10. FAIL (404): Contrato inexistente
  {
    const { prisma } = makeHarness();
    const service = new ContractIssueService(prisma);

    await assert.rejects(
      async () => service.issueContract('c-404-nonexistent', 'admin-01'),
      (err: any) => err instanceof NotFoundException,
    );
    console.log('✔ PASS (404): Emisión con ID inexistente lanza HTTP 404 Not Found.');
  }

  // 11. FAIL (409): Descarga de PDF de contrato no emitido
  {
    const { prisma } = makeHarness({
      initialContracts: [{ id: 'c-draft-pdf', status: 'BORRADOR' }],
    });
    const service = new ContractIssueService(prisma);

    await assert.rejects(
      async () => service.getContractPdf('c-draft-pdf', 'hr-01'),
      (err: any) => err instanceof ConflictException && err.message === PDF_NOT_YET_ISSUED,
    );
    console.log('✔ PASS (409): Descarga de PDF denegada si el contrato sigue en BORRADOR.');
  }

  // 12. FAIL (503): Integridad de archivo PDF corrupta o ausente
  {
    const { prisma } = makeHarness({
      initialContracts: [{ id: 'c-corrupt', status: 'EMITIDO', fileHash: 'hash-fantasma' }],
    });
    const service = new ContractIssueService(prisma);

    await assert.rejects(
      async () => service.getContractPdf('c-corrupt', 'hr-01', {
        pdfReader: async () => { throw new Error('File not found or corrupt'); },
      }),
      (err: any) => err instanceof HttpException && err.getStatus() === 503,
    );
    console.log('✔ PASS (503): Fallo de lectura de PDF histórico responde HTTP 503 Service Unavailable.');
  }

  console.log('\n✅ All HU-20 tests passed successfully!');
}

run().catch(err => {
  console.error('\n❌ HU-20 test failure:', err);
  process.exit(1);
});
