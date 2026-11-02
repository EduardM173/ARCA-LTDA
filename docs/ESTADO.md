# ARCA RH · evidencia al cierre técnico del 02/11/2026

Actualización de alcance del 02/11/2026: se registró en `docs/POLITICA_DEMOSTRACION.md` la propuesta de ensayo recibida. La inspección focalizada de `apps/vacation-service/src/main.ts` y `apps/personnel-service/src/main.ts` confirmó dos brechas: el cómputo hábil usa lunes a viernes fijos, sin horario configurable, y la vigencia salarial retroactiva no exige motivo individual; el cambio retroactivo de área/cargo se rechaza. No se activó ninguna política como aprobada. La medición previa a trabajo pesado indicó 26,80/29,14 GB de memoria comprometida (92,3 %); se posponen builds y pruebas pesadas según `AGENTS.md`, sin detener aplicaciones ajenas ni cambiar paginación de Windows.

Sistema integrado ejecutándose en http://localhost:5173 mediante Docker Compose. Los ocho servicios están saludables. Este registro distingue implementación/pruebas técnicas de aprobación institucional y revisión humana.

## Comprobado sobre las imágenes actuales

- Build serial real: `docker compose build identity-service web` completado; backend compartido para cinco dominios y Gateway, frontend React servido por Nginx no root.
- Migraciones propias de cinco bases aplicadas. Campos requestId de Identidad, Personal y Vacaciones sincronizados; clientes generados y typechecks aprobados.
- `API_BASE=http://localhost:3000/api/v1/ DOCKER_FIXTURE_DOCUMENTS=true node --env-file=.env tests/integration.mjs`: **11 grupos PASS**. Se añadieron comprobaciones de requestId: Gateway genera su UUID, ignora el aportado externamente y el mismo ID queda persistido en auditorías de login, alta de Personal, solicitud de vacaciones, contrato y boleta.
- Integración anterior y actual comprueban autenticación, duplicados, versiones, campos/permisos, saldo concurrente, generación y autorización PDF, Decimal, pago separado de emisión, snapshots, baja con conservación histórica, revocación y CSRF. Limpieza exacta de datos y PDFs de fixtures.
- `node --env-file=.env tests/vacations-ui.mjs`: **PASS** sobre la nueva web en Docker. Política registrada desde UI, dos solicitudes, otro aprobador revisa saldo/política, aprobación/rechazo e historial; PostgreSQL confirma débito2 y auditoría. Dos primeros intentos detectaron problemas del harness Selenium (referencia obsoleta tras refresh e import faltante), corregidos antes de aprobar. No hubo cambios de negocio para hacer pasar la prueba.
- E2E Personal: alta/asignación/salario/ratificación/baja, política explícita de reingreso y HR sin salarios; viewports reales CDP1280/768/375. E2E Contratos: plantilla→borrador editado→vista previa→emisión→PDF. E2E Pagos: catálogo→dos partidas→PDF→SIMULADO→trazabilidad. Evidencia en los documentos de cada dominio.
- Identidad aislada:7grupos PASS, incluyendo firmas Ed25519, grants/scopes, concurrencia de contraseña/último administrador, caducidad/reuso de recuperación, revocación, leases y pérdida de ámbito del destinatario SMTP.
- SMTP real: TLS/autenticación, verificación de email y recuperación por endpoints; solicitudes y decisiones de vacaciones producen notificaciones reales. Usuario confirmó recepción del conjunto en eduardoapaza406@gmail.com. No se modificó su contraseña operativa durante esas pruebas.
- Reinicio completo y verificación posterior: empleado, vacaciones, contratoPDF, boletaPDF y pagoSIMULADO con paidBy persistieron con hashes iguales. El fixture integrado fue verificado otra vez después del último build y eliminado por IDs.
- Restore aislado real: cinco bases con conteos iguales y dos volúmenes con hashes PDF idénticos. Evidencia `.runtime/backups/integrated-2026-11-02/restore-evidence.json`. Ningún volumen operativo se reemplazó.
- HTTPS local probado: login en navegador y cookie Secure/HttpOnly/SameSiteStrict; no-store. Certificado de prueba exclusivamente local, sin alterar el almacén de confianza Windows.
- `node scripts/check-infra.mjs`: PASS final en modo canónico. Ocho healthy, no-root, dominios privados, secretos restringidos, cinco conexiones propias y veinte accesos cruzados SQL denegados. PostgreSQL no publica puerto en Windows.

## Implementación consolidada

Sesiones revocables y firmas asimétricas internas; permisos explícitos por acción y ámbitos organizacionales/áreas; administración por UI; protección del último administrador y de autoasignación. Personal conserva eventos, vigencias y periodos laborales. Vacaciones mantiene derechos por gestión y periodo laboral, consumos/reversos, reserva configurable, solapamientos, cancelaciones bajo política y outbox. Contratos y Pagos permiten borradores versionados, auditoría, emisión recuperable, documentos privados/snapshots y rectificaciones/anulación solo por política aprobada. Pagos admite varias partidas y distingue pago manual/simulado de transferencia bancaria.

## Pendientes humanos/externos, sin suplantarlos

1. Aprobar las políticas institucionales operativas en la UI (cómputo/arrastre/reserva/aniversario especial/cancelaciones, reingreso/retroactividad, criterio de compensación y rectificación documental). Los permisos de personas reales requieren concesiones autorizadas. Los fixtures no constituyen aprobación institucional y se eliminaron.
2. Revisión de usabilidad por una persona ajena al desarrollo. Selenium y capturas no acreditan ese criterio humano.
3. El workflow GitHub Actions está configurado y sus pasos equivalentes se comprobaron localmente. No se afirma ejecución remota en GitHub ni publicación: no se realizó push.

No se atribuye certificación legal, producción segura, integración Core ni transferencia bancaria. La única simulación externa autorizada es el movimiento del dinero; los registros internos y documentos son reales.

## Recursos y limpieza

Se respetó ejecución serial. La presión de memoria llegó a93%; se detuvieron solo aplicaciones ARCA, sin cambiar paging ni cerrar apps del usuario. Al reanudar bajó a83%; build serial y pruebas focalizadas se completaron, vigilando recursos. Pagefile creció entre jornadas; no se atribuye toda la variación de C: al proyecto.

Fixture `.runtime/infra-deployment-fixture.json` y sus registros/PDF fueron eliminados tras verificar persistencia. Se retiraron13 registros privados de caché nuevos identificados por diferencia de IDs; se preservaron33 IDs del inventario previo y las imágenes/volúmenes activos. Queda evidencia pequeña, backups sintéticos, certificado local y acceso inicial en `.runtime`, ignorado por Git. Mediciones finales en `docs/ALMACENAMIENTO.md`.

Git: revisión de secretos aprobada. Se recuperó la identidad ya usada en algorithm: EduardM173 <eduardo.apaza@ucb.edu.bo>, configurándola solo en ARCA. No se modificó la identidad global ni se realizó push.
