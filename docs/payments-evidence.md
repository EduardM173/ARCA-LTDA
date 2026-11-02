# Pagos: evidencia de implementación · 01/11/2026

Migración aditiva `20261101141000_payment_workflows` aplicada con Prisma migrate deploy sobre `arca_payment`. Cliente Prisma regenerado. No se borró la base ni datos operativos.

Implementación:

- Catálogo persistente de conceptos ABONO/DESCUENTO, activación/desactivación, snapshot del nombre y tipo de concepto en cada partida; no se alteran documentos históricos al desactivar conceptos.
- Borradores editables con versión y reconsulta a Personal por periodo. El backend calcula importes Decimal y rechaza neto negativo, conceptos inactivos, cambios concurrentes y edición de emitidos.
- Filtros PostgreSQL por funcionario, periodo y estado, paginación de 25; compatibilidad de listado sin `page` con consumidores anteriores. Resumen agregado para Finanzas/Directorio sin salarios, snapshots ni identificadores individuales.
- Emisión bajo bloqueo transaccional PostgreSQL durante la generación y comprobación del PDF. Una caída revierte el estado SQL; un estado EMITIENDO heredado permite recuperación mediante la misma acción. Archivo sin metadata confirmada nunca constituye una emisión efectiva. Un fallo real de escritura deja ERROR_EMISION reintentable; emisión repetida verifica el mismo hash.
- Registro MANUAL/SIMULADO con fecha, evidencia, referencia, responsable y evento auditable. SIMULADO se etiqueta expresamente como ausencia de transferencia bancaria confirmada. Un reintento con datos diferentes se rechaza.
- Anulación documental y nueva revisión requieren política aprobada desde UI. Originales conservan PDF y snapshot. No se permite anular ni rectificar pagos ya registrados: su reverso financiero continúa bloqueado sin política específica.
- Permisos explícitos `payments.issue` y `payments.record`, rol FINANCE y ámbito por departamento verificado en backend. Listas se filtran en PostgreSQL por el snapshot autorizado; un histórico sin ámbito solo es accesible mediante concesión global explícita.
- Componente React `Payments` incluye selector de funcionario, filtros, editor de varias partidas, revisión de importes, conceptos, política, trazabilidad, descarga y diálogos nativos accesibles, sin alert/prompt.

Comandos y resultados:

```text
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema apps/payment-service/prisma/schema.prisma
  Migración aplicada correctamente.
node --env-file=.env node_modules/prisma/build/index.js generate --schema apps/payment-service/prisma/schema.prisma
  Cliente 6.19.3 generado correctamente.
node --env-file=.env --import tsx tests/payments-workflow.ts
  8 grupos de pruebas HTTP reales superados (PostgreSQL y PDF reales).
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit
  Sin errores al completar este módulo.
```

Las pruebas usan tokens internos firmados con las claves locales y fixtures etiquetados como sintéticos. Eliminan solo los IDs de personas/conceptos/documentos/políticas/auditoría que crean. La avería de PDF se provoca creando un directorio en la ruta de archivo sintética, se comprueba ERROR_EMISION y se retira para verificar recuperación; no se sustituyen APIs ni almacenamiento con mocks.

Pendientes externos de este módulo: ratificar políticas financieras mediante el dueño de negocio; se construyó el mecanismo pero no se aprobaron reglas de producción. La revisión de Persona de la UX y los recorridos con el frontend integrado corresponden a la validación de sistema, no se declaran realizados por estas pruebas de servicio.

## Navegador integrado · 02/11/2026

`node --env-file=.env tests/documents-ui.mjs` terminó con tres comprobaciones PASS. Desde React se creó un concepto ABONO, se guardaron dos partidas decimales (0,20 + 0,10), se emitió la boleta PDF, se descargó por sesión autenticada y se registró SIMULADO con referencia/evidencia. La BD confirmó PAGADO, paymentMode=SIMULADO y neto=5000,40. Se abrió la trazabilidad. Captura revisada en `.runtime/documents-ui-payment.png`. Fixtures y PDF operativos sintéticos se eliminaron por sus IDs; copia visual conservada.

`node --env-file=.env tests/personnel-ui.mjs` pasó tres grupos de navegador: alta/asignación/salario/ratificación/baja, aprobación de política sintética y reingreso con nuevo periodo, y operador sin campos salariales. Los viewports se fijaron mediante CDP y se comprobó innerWidth exacto 1280/768/375; screenshot móvil revisado en `.runtime/personnel-ui-hr-mobile.png`. La política sintética se eliminó por actor; no aprueba reglas institucionales de producción.

La revisión visual del recorrido también detectó que el editor seguía visible después de emitir/pagar aunque el backend ya impedía modificar el documento. Se cierra ahora el editor después de esas transiciones; la corrección no altera importes ni estados de servidor. El typecheck web posterior no informó errores en Pagos, pero detectó incompatibilidades de tipos en main.tsx tras tipar api.ts; la validación global debe cerrarse al integrar esa corrección.
