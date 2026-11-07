/**
 * HU-21 — Registrar borrador de pago con múltiples partidas y cálculo decimal del neto
 *
 * Casos de Aceptación (Kata Módulo 4: 100%, Plan HU-13 / T11, ARCA RH v7.1 §2.5):
 *  1. PASS  — Creación de borrador con cálculo decimal exacto de múltiples partidas.
 *  2. PASS  — Precisión Decimal: sumas y restas monetarias sin artefactos de coma flotante.
 *  3. PASS  — Edición de borrador: actualización de partidas, recálculo de neto e incremento de versión.
 *  4. FAIL  (400) — Deducciones superan los haberes produciendo líquido pagable neto negativo (net < 0).
 *  5. FAIL  (409) — Intento de crear dos boletas para el mismo funcionario y periodo (duplicado).
 *  6. FAIL  (409) — Intento de editar boleta en estado EMITIDO o PAGADO denegado.
 *  7. FAIL  (409) — Concurrencia optimista: versión desactualizada rechaza la edición con 409.
 *  8. FAIL  (400) — Concepto inexistente o inactivo en las partidas lanza 400 Bad Request.
 *  9. FAIL  (400) — Tipo de partida (ABONO/DESCUENTO) discordante con el catálogo lanza 400.
 * 10. FAIL  (400) — Funcionario en estado BAJA no puede recibir boletas de pago.
 * 11. FAIL  (404) — Edición de boleta inexistente lanza HTTP 404 Not Found.
 * 12. PASS  — Validación estricta de formato de periodo AAAA-MM.
 */
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentsService,
  periodSchema,
  DUPLICATE_PAYMENT_PERIOD,
  NEGATIVE_NET_CONFLICT,
  INACTIVE_CONCEPT_ERROR,
  CONCEPT_TYPE_MISMATCH,
  PAYMENT_NOT_EDITABLE,
  EMPLOYEE_BAJA_PAYMENT,
} from '../apps/payment-service/src/payments.service';

// ─── Test Fixtures ────────────────────────────────────────────────────────────
const EMPLOYEE_ACTIVO = {
  id:           '00000000-0000-4000-8000-000000000001',
  code:         'ARCA-001',
  name:         'Lucía Ramos',
  status:       'ACTIVO',
  currency:     'BOB',
  salary:       '7000.00',
  departmentId: 'dept-01',
  version:      1,
};

const EMPLOYEE_BAJA = {
  ...EMPLOYEE_ACTIVO,
  id:     '00000000-0000-4000-8000-000000000002',
  status: 'BAJA',
  name:   'Ex Funcionario Baja',
};

const CONCEPTS = [
  { id: 'c-bono',  name: 'Bono de Antigüedad', type: 'ABONO',     active: true },
  { id: 'c-prod',  name: 'Bono Producción',    type: 'ABONO',     active: true },
  { id: 'c-afp',   name: 'Aporte Laboral AFP', type: 'DESCUENTO', active: true },
  { id: 'c-rciva', name: 'RC-IVA',             type: 'DESCUENTO', active: true },
  { id: 'c-inact', name: 'Concepto Obsoleto',  type: 'ABONO',     active: false },
];

type PaymentRow = {
  id:         string;
  employeeId: string;
  period:     string;
  currency:   string;
  base:       any;
  earnings:   any;
  deductions: any;
  net:        any;
  lines:      any[];
  snapshot:   any;
  status:     string;
  version:    number;
  createdBy:  string;
  createdAt:  Date;
  updatedAt:  Date;
};

type AuditRow = {
  id:        string;
  actor:     string;
  action:    string;
  paymentId: string;
  data:      any;
  requestId?:string;
};

function makeHarness(opts: { initialPayments?: Partial<PaymentRow>[] } = {}) {
  const payments: PaymentRow[] = (opts.initialPayments || []).map(p => ({
    id:         p.id ?? `pay-${Math.random().toString(36).slice(2)}`,
    employeeId: p.employeeId ?? EMPLOYEE_ACTIVO.id,
    period:     p.period ?? '2026-11',
    currency:   p.currency ?? 'BOB',
    base:       p.base ?? '7000.00',
    earnings:   p.earnings ?? '0.00',
    deductions: p.deductions ?? '0.00',
    net:        p.net ?? '7000.00',
    lines:      p.lines ?? [],
    snapshot:   p.snapshot ?? { ...EMPLOYEE_ACTIVO },
    status:     p.status ?? 'BORRADOR',
    version:    p.version ?? 1,
    createdBy:  p.createdBy ?? 'finance-01',
    createdAt:  new Date(),
    updatedAt:  new Date(),
  }));

  const audits: AuditRow[] = [];
  let seq = 0;
  const nextId = () => `id-${++seq}`;

  const paymentTable = {
    count: async (query: any): Promise<number> => {
      const { employeeId, period } = query.where || {};
      return payments.filter(p =>
        (!employeeId || p.employeeId === employeeId) &&
        (!period     || p.period === period)
      ).length;
    },
    findUnique: async (opts: any): Promise<PaymentRow | null> => {
      return payments.find(p => p.id === opts.where.id) ?? null;
    },
    create: async (opts: any): Promise<PaymentRow> => {
      const row: PaymentRow = {
        id:         nextId(),
        employeeId: opts.data.employeeId,
        period:     opts.data.period,
        currency:   opts.data.currency,
        base:       opts.data.base,
        earnings:   opts.data.earnings,
        deductions: opts.data.deductions,
        net:        opts.data.net,
        lines:      opts.data.lines,
        snapshot:   opts.data.snapshot,
        status:     opts.data.status ?? 'BORRADOR',
        version:    opts.data.version ?? 1,
        createdBy:  opts.data.createdBy,
        createdAt:  new Date(),
        updatedAt:  new Date(),
      };
      payments.push(row);
      return row;
    },
    update: async (opts: any): Promise<PaymentRow> => {
      const idx = payments.findIndex(p => p.id === opts.where.id);
      if (idx < 0) throw new NotFoundException('Boleta no encontrada');
      const p = payments[idx];
      const { version: vUp, ...rest } = opts.data;
      Object.assign(p, rest);
      if (vUp?.increment) {
        p.version = p.version + vUp.increment;
      } else if (vUp !== undefined) {
        p.version = vUp;
      }
      p.updatedAt = new Date();
      return payments[idx];
    },
  };

  const conceptTable = {
    findMany: async (opts: any) => {
      if (opts?.where?.active) {
        return CONCEPTS.filter(c => c.active);
      }
      return CONCEPTS;
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
    payment:      paymentTable,
    concept:      conceptTable,
    paymentAudit: auditTable,
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(prisma),
  };

  return { prisma, payments, audits };
}

// ─── Test Suite Execution ─────────────────────────────────────────────────────
async function run() {
  console.log('🔵 HU-21 — Registrar borrador de pago con múltiples partidas y cálculo decimal\n');

  // 1. PASS: Creación exitosa de borrador con cálculo decimal exacto
  {
    const { prisma, payments, audits } = makeHarness();
    const service = new PaymentsService(prisma);

    const draft = await service.createDraft(
      {
        employeeId: EMPLOYEE_ACTIVO.id,
        period:     '2026-11',
        lines: [
          { concept: 'Bono de Antigüedad', type: 'ABONO',     amount: '500.25' },
          { concept: 'Bono Producción',    type: 'ABONO',     amount: '300.00' },
          { concept: 'Aporte Laboral AFP', type: 'DESCUENTO', amount: '890.50' },
        ],
      },
      EMPLOYEE_ACTIVO,
      'finance-01',
      'req-pay-01',
    );

    assert.equal(draft.status, 'BORRADOR');
    assert.equal(draft.period, '2026-11');
    assert.equal(draft.version, 1);
    // 7000.00 base + 800.25 abonos - 890.50 descuentos = 6909.75 neto
    assert.equal(Number(draft.earnings).toFixed(2), '800.25');
    assert.equal(Number(draft.deductions).toFixed(2), '890.50');
    assert.equal(Number(draft.net).toFixed(2), '6909.75');

    const audit = audits.find(a => a.paymentId === draft.id && a.action === 'BORRADOR_CREADO');
    assert.ok(audit, 'Debe registrar auditoría BORRADOR_CREADO');
    console.log('✔ PASS: Creación exitosa — base 7000 + 800.25 abonos - 890.50 descuentos = 6909.75 neto exacto.');
  }

  // 2. PASS: Precisión decimal estricta (sin errores binarios 0.1 + 0.2 = 0.30000000000000004)
  {
    const { prisma } = makeHarness();
    const service = new PaymentsService(prisma);

    const totals = service.calculateTotals('1000.10', [
      { type: 'ABONO',     amount: '200.20' },
      { type: 'DESCUENTO', amount: '50.05' },
    ]);

    assert.equal(totals.earnings, '200.20');
    assert.equal(totals.deductions, '50.05');
    assert.equal(totals.net, '1150.25');
    console.log('✔ PASS: Precisión Decimal estricta — redondeo exacto de importes monetarios a dos decimales.');
  }

  // 3. PASS: Edición de borrador con actualización de partidas e incremento de versión
  {
    const { prisma, payments, audits } = makeHarness({
      initialPayments: [{
        id:         'pay-edit',
        employeeId: EMPLOYEE_ACTIVO.id,
        period:     '2026-11',
        status:     'BORRADOR',
        version:    1,
      }],
    });
    const service = new PaymentsService(prisma);

    const updated = await service.editDraft(
      'pay-edit',
      {
        version: 1,
        lines: [
          { concept: 'Bono Producción', amount: '450.00', type: 'ABONO' },
        ],
      },
      EMPLOYEE_ACTIVO,
      'finance-01',
    );

    assert.equal(updated.version, 2);
    assert.equal(Number(updated.earnings).toFixed(2), '450.00');
    assert.equal(Number(updated.net).toFixed(2), '7450.00');

    const audit = audits.find(a => a.paymentId === 'pay-edit' && a.action === 'BORRADOR_ACTUALIZADO');
    assert.ok(audit, 'Debe registrar auditoría BORRADOR_ACTUALIZADO');
    console.log('✔ PASS: Edición de borrador — versión incrementada a 2 y neto recalculado.');
  }

  // 4. FAIL (400): Deducciones superan los haberes produciendo neto negativo
  {
    const { prisma } = makeHarness();
    const service = new PaymentsService(prisma);

    assert.throws(
      () => service.calculateTotals('3000.00', [
        { type: 'DESCUENTO', amount: '3500.00' },
      ]),
      (err: any) => err instanceof BadRequestException && err.message === NEGATIVE_NET_CONFLICT,
    );
    console.log('✔ PASS (400): Rechazo de neto negativo — deducciones mayores a haberes lanzan 400 Bad Request.');
  }

  // 5. FAIL (409): Intento de crear dos boletas en el mismo periodo para el mismo empleado
  {
    const { prisma } = makeHarness({
      initialPayments: [{
        employeeId: EMPLOYEE_ACTIVO.id,
        period:     '2026-11',
        status:     'BORRADOR',
      }],
    });
    const service = new PaymentsService(prisma);

    await assert.rejects(
      async () => service.createDraft(
        {
          employeeId: EMPLOYEE_ACTIVO.id,
          period:     '2026-11',
          lines:      [],
        },
        EMPLOYEE_ACTIVO,
        'finance-01',
      ),
      (err: any) => err instanceof ConflictException && err.message === DUPLICATE_PAYMENT_PERIOD,
    );
    console.log('✔ PASS (409): Unicidad por periodo — rechazo de boleta duplicada para el mismo funcionario y mes.');
  }

  // 6. FAIL (409): Intento de editar boleta en estado EMITIDO
  {
    const { prisma } = makeHarness({
      initialPayments: [{
        id:      'pay-emitted',
        status:  'EMITIDO',
        version: 1,
      }],
    });
    const service = new PaymentsService(prisma);

    await assert.rejects(
      async () => service.editDraft('pay-emitted', { version: 1, lines: [] }, EMPLOYEE_ACTIVO, 'finance-01'),
      (err: any) => err instanceof ConflictException && err.message === PAYMENT_NOT_EDITABLE,
    );
    console.log('✔ PASS (409): Inmutabilidad — intento de editar boleta ya EMITIDA lanza HTTP 409 Conflict.');
  }

  // 7. FAIL (409): Concurrencia optimista — versión desactualizada
  {
    const { prisma } = makeHarness({
      initialPayments: [{
        id:      'pay-concurrente',
        status:  'BORRADOR',
        version: 2,
      }],
    });
    const service = new PaymentsService(prisma);

    await assert.rejects(
      async () => service.editDraft('pay-concurrente', { version: 1, lines: [] }, EMPLOYEE_ACTIVO, 'finance-01'),
      (err: any) => err instanceof ConflictException && err.message === PAYMENT_NOT_EDITABLE,
    );
    console.log('✔ PASS (409): Concurrencia optimista — versión desactualizada rechazada con HTTP 409 Conflict.');
  }

  // 8. FAIL (400): Concepto inexistente o inactivo
  {
    const { prisma } = makeHarness();
    const service = new PaymentsService(prisma);

    await assert.rejects(
      async () => service.normalizeLines([{ concept: 'Concepto Fantasma', amount: '100.00' }]),
      (err: any) => err instanceof BadRequestException && err.message === INACTIVE_CONCEPT_ERROR,
    );

    // Concepto inactivo en catálogo
    await assert.rejects(
      async () => service.normalizeLines([{ concept: 'Concepto Obsoleto', amount: '100.00' }]),
      (err: any) => err instanceof BadRequestException && err.message === INACTIVE_CONCEPT_ERROR,
    );
    console.log('✔ PASS (400): Catálogo de conceptos — rechazo de conceptos inexistentes o inactivos.');
  }

  // 9. FAIL (400): Tipo inconsistente con el concepto
  {
    const { prisma } = makeHarness();
    const service = new PaymentsService(prisma);

    await assert.rejects(
      async () => service.normalizeLines([{ concept: 'Bono de Antigüedad', type: 'DESCUENTO', amount: '100.00' }]),
      (err: any) => err instanceof BadRequestException && err.message === CONCEPT_TYPE_MISMATCH,
    );
    console.log('✔ PASS (400): Consistencia de tipo — asignar DESCUENTO a un concepto de ABONO lanza 400 Bad Request.');
  }

  // 10. FAIL (400): Funcionario en estado BAJA
  {
    const { prisma } = makeHarness();
    const service = new PaymentsService(prisma);

    await assert.rejects(
      async () => service.createDraft(
        { employeeId: EMPLOYEE_BAJA.id, period: '2026-11', lines: [] },
        EMPLOYEE_BAJA,
        'finance-01',
      ),
      (err: any) => err instanceof BadRequestException && err.message === EMPLOYEE_BAJA_PAYMENT,
    );
    console.log('✔ PASS (400): Estado laboral — funcionario en BAJA no puede recibir boletas de pago.');
  }

  // 11. FAIL (404): Edición con ID inexistente
  {
    const { prisma } = makeHarness();
    const service = new PaymentsService(prisma);

    await assert.rejects(
      async () => service.editDraft('pay-404-nonexistent', { version: 1, lines: [] }, EMPLOYEE_ACTIVO, 'finance-01'),
      (err: any) => err instanceof NotFoundException,
    );
    console.log('✔ PASS (404): ID inexistente al editar lanza HTTP 404 Not Found.');
  }

  // 12. PASS: Validación de formato del periodo AAAA-MM
  {
    assert.ok(periodSchema.safeParse('2026-11').success);
    assert.ok(periodSchema.safeParse('2024-02').success);
    assert.equal(periodSchema.safeParse('2026-13').success, false, 'Mes 13 debe ser inválido');
    assert.equal(periodSchema.safeParse('2026-00').success, false, 'Mes 00 debe ser inválido');
    assert.equal(periodSchema.safeParse('nov-2026').success, false, 'Texto debe ser inválido');
    console.log('✔ PASS: Validación de formato periodo AAAA-MM estricta.');
  }

  console.log('\n✅ All HU-21 tests passed successfully!');
}

run().catch(err => {
  console.error('\n❌ HU-21 test failure:', err);
  process.exit(1);
});
