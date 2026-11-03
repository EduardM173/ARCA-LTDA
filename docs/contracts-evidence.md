# Contratos · evidencia de implementación

01/11/2026. Migración aplicada: `20261101010000_contract_lifecycle`; cliente Prisma propio generado. Sin nuevas dependencias.

Comandos observados: `node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema apps/contract-service/prisma/schema.prisma`, `generate` para el mismo esquema, `node --env-file=.env tests/contracts.mjs`. Diez grupos de comprobaciones focalizadas aprobados contra PostgreSQL real y procesos HTTP propios (3102/3104/3105); los procesos y fixtures se eliminan al finalizar.

Comprobado: plantillas versionadas y activación auditada; edición de borradores con versión; idempotencia al reutilizar requestKey; permisos de emisión y ámbito por snapshot; revalidación y actualización explícita desde Personal; recuperación de EMITIENDO legado; doble emisión serializada; PDF y snapshot inmutables; error real de filesystem sin falso EMITIDO y reintento; política explícita de anulación/rectificación; original conservado; filtros/paginación; indicadores agregados sin documentos individuales; archivo histórico corrupto falla con 503 sin regenerar ni modificar el documento emitido.

03/11/2026: `node --env-file=.env tests/contracts.mjs` pasó 11 grupos, incluido Personal detenido antes de emitir un borrador: HTTP 503, estado `BORRADOR` intacto y PDF histórico descargable. La primera ejecución pasó las aserciones pero el harness terminó con código 13 al esperar por segunda vez un proceso ya cerrado; se corrigió la espera, se limpió el fixture identificado y la ejecución completa pasó con código 0. El overlay SQL de pruebas se retiró.

La generación de PDF y la confirmación de metadatos se ejecutan bajo un bloqueo PostgreSQL por contrato. Si el proceso cae, la transacción revierte y el bloqueo se libera. El siguiente intento puede regenerar el archivo no confirmado bajo el mismo ID. Los contratos EMITIDO nunca se sobrescriben. La recuperación se ejecuta al reintentar desde la UI/API; una emisión histórica sin archivo íntegro requiere restauración de respaldo autorizada.

React: `apps/web/src/Contracts.tsx` ofrece búsqueda/selector de personal, filtros/página de contratos, edición del borrador, vista previa en diálogo nativo accesible, historial, confirmación de emisión/recuperación, plantillas activables versionadas y aprobación institucional de políticas. No utiliza alert/prompt. TypeScript de backend y web pasó tras escribir el componente; el E2E integrado final corresponde a la integración principal.

Anulación/rectificación quedan bloqueadas hasta registrar una aprobación real en la interfaz. Las políticas creadas durante la prueba están identificadas como sintéticas y se eliminan; no constituyen aprobación institucional. La prueba inyecta un estado EMITIENDO legado y un archivo corrupto como entradas de fallo; los PDFs válidos son generados por el servicio real.

## Navegador integrado · 02/11/2026

`node --env-file=.env tests/documents-ui.mjs` pasó el recorrido React de nueva plantilla, borrador, edición a 60 días, previsualización, emisión y descarga autenticada del PDF (200 y firma %PDF-). La BD confirmó exactamente un contrato EMITIDO del fixture. Captura revisada `.runtime/documents-ui-contract.png`.

Este recorrido encontró un defecto real: el formulario de edición montaba su select antes de recibir las plantillas, perdía la selección precargada y required impedía guardar. `Contracts.tsx` ahora espera a las plantillas y muestra el estado de carga antes de montar el formulario. Se repitió el recorrido completo tras corregirlo y pasó. Los demás fallos intermedios fueron sincronización de Selenium con catálogos/listados asincrónicos; el harness ahora espera opciones/botones y reconsulta elementos reemplazados.

## Contexto de funcionario · 02/11/2026

Se corrigieron selectores de Contratos/Pagos/Vacaciones para consultar por ID al funcionario contextual cuando no aparece en la página o búsqueda actual. La opción seleccionada se precarga desde la API respetando ámbito; la búsqueda no borra el contexto ni reemplaza la selección. `node --env-file=.env tests/context-ui.mjs` pasó un recorrido Chrome que conserva ID y nombre en los tres módulos después de aplicar una búsqueda sin coincidencias (total=0 comprobado por API). Captura revisada en `.runtime/context-ui-selected.png`. TypeScript web pasó antes de esta prueba focal. No se repitieron las suites UI ya aprobadas.
