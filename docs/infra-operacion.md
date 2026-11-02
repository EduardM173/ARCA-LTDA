# Infraestructura y recuperación

La configuración Compose conserva ocho procesos: PostgreSQL, cinco dominios, Gateway y una web React. Los seis procesos NestJS usan una imagen compartida para evitar instalaciones duplicadas; `SERVICE` selecciona el proceso. Cada dominio ejecuta únicamente sus migraciones al arrancar.

## Operación

```powershell
$env:COMPOSE_PARALLEL_LIMIT='1'
docker compose config --quiet
docker compose build identity-service web
docker compose up -d --no-build --wait --wait-timeout 180
node scripts/check-infra.mjs
```

En el navegador: `http://localhost:5173`. No ejecutar simultáneamente `pnpm dev` en los mismos puertos. `WEB_HOST_PORT` y `GATEWAY_HOST_PORT` permiten usar puertos alternativos; `APP_PUBLIC_URL` debe coincidir con el origen elegido para las comprobaciones CSRF. PostgreSQL solo se publica al agregar explícitamente `compose.dev.yaml`; la configuración canónica no lo publica.

Los cinco dominios no publican puertos. Las aplicaciones se ejecutan como `node`/`nginx`, sin privilegios y con raíz de archivos de solo lectura; `/tmp` es efímero. Contratos y Pagos escriben exclusivamente en sus volúmenes documentales. Las variables SMTP y la clave de cifrado del correo se suministran únicamente a Identidad. Gateway recibe la clave privada Ed25519; los servicios reciben su clave pública.

La inicialización PostgreSQL comprueba la existencia de roles/bases y conserva los existentes. Los usuarios de servicio carecen de SUPERUSER, CREATEDB y CREATEROLE, y no pueden conectar con bases de otros dominios. El rol administrativo se reserva para inicialización y respaldo.

## Respaldo coherente

```powershell
node scripts/backup.mjs
```

Se genera un directorio nuevo en `.runtime/backups`. La herramienta detiene temporalmente los cinco escritores, captura las cinco bases en formato custom y los dos volúmenes documentales, calcula hashes y conteos y vuelve a iniciar los procesos que estaban activos. No sobrescribe carpetas de respaldos anteriores. En Windows restringe la ACL de la carpeta al usuario actual y SYSTEM. No publicar, adjuntar ni subir estos archivos: pueden contener datos privados.

El respaldo guarda datos, no contraseñas de roles SQL. Las credenciales de servicio se recuperan desde la configuración local autorizada al restaurar. Mantener también una copia protegida independiente de las claves de cifrado que permita recuperar una outbox cifrada; no incluirlas en el repositorio ni en el manifiesto de respaldo.

## Ensayo de restauración sin tocar los originales

```powershell
node --env-file=.env scripts/restore-check.mjs .runtime/backups/DIRECTORIO_DEL_SNAPSHOT
```

La herramienta comprueba los hashes, crea un contenedor y volúmenes nuevos con sufijo aleatorio y sin red, restaura las cinco bases y los PDFs y compara conteos de tablas y archivos. Produce `restore-evidence.json` si pasa. Al terminar elimina exclusivamente esos recursos temporales identificados por su nombre generado. No elimina ni sobrescribe los volúmenes operativos. Una restauración operativa debe efectuarse en una instancia nueva, verificarse antes de cambiar conexiones y conservar la instancia anterior hasta aprobación del responsable.

## CI

`.github/workflows/ci.yml` crea secretos efímeros, instala con lockfile, comprueba tipos, construye imágenes, arranca Compose y ejecuta integración y restauración. `scripts/create-ci-env.mjs` usa creación exclusiva y rechaza sobrescribir un `.env` existente. No contiene credenciales SMTP reales. La entrega SMTP externa se comprueba por separado en el entorno autorizado. Un workflow escrito no constituye evidencia de ejecución en GitHub; el repositorio debe publicarlo y GitHub Actions debe ejecutar el commit.

## Evidencia observada inicial de esta continuación

- `docker compose config --quiet`: correcto.
- `docker compose build identity-service web`: ambas imágenes se construyeron realmente.
- Inspección de imágenes: usuario `node` y usuario `nginx`.
- Comprobación de imagen backend: no incluye `.env`, `.git` ni acceso inicial local; el cliente Prisma se resuelve desde la salida compilada.
- Inicialización idempotente ejecutada sobre la instancia existente sin borrar datos.
- Conexión real `arca_identity` a `arca_personnel`: denegada por privilegio CONNECT.

La ejecución integrada, persistencia y restauración se registrarán después de ejecutarlas; los comandos anteriores no bastan por sí solos para afirmar esos resultados.

## Ensayo independiente de recuperación observado

`node --env-file=.env scripts/test-recovery.mjs` pasó sobre PostgreSQL real aislado: cinco bases con filas sintéticas y dos volúmenes con un PDF verdadero. La restauración conservó los conteos y los hashes SHA-256 de todos los documentos. Se verificó también el hash de cada archivo de respaldo antes de restaurar. Evidencia local: `.runtime/backups/arca-rh-recovery-fixture-c57ba269c0/restore-evidence.json`.

Se eliminaron únicamente los contenedores y volúmenes nuevos del ensayo y las fuentes duplicadas de los PDFs. `docker volume ls` confirmó que el volumen operativo original permaneció. La copia pequeña que contiene el manifiesto y los respaldos sintéticos se conserva como evidencia. Este ensayo prueba las herramientas de recuperación; la comprobación adicional del sistema integrado se ejecutará al cerrar el hito.

## HTTPS local sin modificar la confianza del equipo

```powershell
& 'C:\Users\lalol\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/create-local-tls.py
docker compose -f compose.yaml -f compose.tls.yaml up -d --no-build --wait
& 'C:\Users\lalol\.codex\tools\selenium-env\Scripts\python.exe' scripts/check-https.py
# Volver a la configuración HTTP local después del ensayo:
docker compose up -d --no-build --wait
```

El certificado autofirmado dura siete días y permanece en `.runtime/tls`, fuera de Git y de las imágenes. No se instala en ningún almacén de confianza Windows. El navegador del ensayo acepta ese certificado únicamente durante la prueba; no se atribuye confianza pública al certificado. El overlay fija temporalmente el origen de la aplicación a `https://localhost:5181` y debe revertirse para recuperar el origen HTTP canónico.

Nginx usa un formato de acceso que registra método, ruta sin argumentos, estado y requestId. No registra query strings ni Referer, evitando copiar tokens de recuperación/verificación a los logs. Las respuestas web se sirven con `Cache-Control: no-store`.


## Evidencia integrada del 02/11/2026

Build backend/web real aprobado. Ocho servicios healthy, integración11grupos sobre imágenes actuales y requestId persistido; reinicio completo conservó estados/hashes. Restauración del conjunto integrado verificó5BD y2volúmenes con igualdad de conteos/hashes. HTTPS login/cookiesegura aprobado. Se volvió al modo canónico sin puertoSQLhost y check-infra aprobó20denegaciones SQL cruzadas, puertos privados y no-root. Fixture integrado eliminado por sus IDs después de verificarlo nuevamente. GitHub Actions no se ejecutó remotamente: no hubo push.
