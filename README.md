# ARCA RH

Sistema local integrado para el kata de gestión humana de ARCA LTDA. React + TypeScript, Gateway y cinco procesos NestJS con ExpressAdapter, Prisma y cinco bases PostgreSQL con usuarios independientes.

El estado verificado y las limitaciones están en [docs/ESTADO.md](docs/ESTADO.md). El documento de requisitos en `docs/ARCA_RH_v7_1_SMTP_Actualizado.md` es una especificación, no evidencia de capacidades terminadas.

## Arranque local

Requisitos: Node.js 24, pnpm 11.25 y Docker Desktop con motor Linux activo. La instalación usa un único almacén de paquetes y enlaces duros cuando el sistema lo permite. Los clientes Prisma siguen siendo propios de cada servicio.

```powershell
pnpm install --frozen-lockfile
# Crear .env a partir de .env.example SOLO en una instalación nueva.
# Configurar contraseñas independientes, URLs y claves de servicio aleatorias.
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres
pnpm generate
pnpm migrate
pnpm dev
```

En este equipo las dependencias ya están instaladas y `.env` ya existe. El pnpm disponible está en `C:\Users\lalol\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd`. No es necesario instalar otro gestor.

Abrir http://localhost:5173. El frontend consume `/api/v1` por un proxy del mismo origen. Gateway: 3000; Identidad: 3001; Personal: 3002; Vacaciones: 3003; Contratos: 3004; Pagos: 3005. Los procesos locales escuchan solo en loopback. OpenAPI por proceso: `/openapi`.

`compose.dev.yaml` publica PostgreSQL exclusivamente en `127.0.0.1:55432` para desarrollo desde Windows. La configuración principal no publica la base ni los cinco servicios. No modifica la instalación PostgreSQL del host.

## Primer acceso

Ya se creó la cuenta administradora solicitada. Sus datos están únicamente en `.runtime/initial-access.txt`. Cambiar la contraseña en **Mi cuenta** y eliminar después ese archivo local. ADMIN y HR no conceden automáticamente acceso a Finanzas ni aprobación de vacaciones; esos roles se asignan desde Administración.

En una instalación nueva, definir `BOOTSTRAP_EMAIL` en `.env` y ejecutar `pnpm bootstrap`. El comando se rechaza si ya existe una cuenta y genera una contraseña aleatoria. No hay contraseña universal en el código ni datos operativos de ejemplo.

## Gmail

Completar localmente `SMTP_USER`, `SMTP_FROM` y `SMTP_PASSWORD` con una contraseña de aplicación del proveedor. Transporte: `smtp.gmail.com:587`, STARTTLS obligatorio. Reiniciar Identidad. Administración permite verificar conexión y autenticación; esa comprobación no demuestra recepción en un buzón. La contraseña PostgreSQL es independiente de la contraseña SMTP.

La recuperación devuelve una respuesta neutra y utiliza tokens aleatorios de un uso, almacenados como hash y con 15 minutos de vigencia. Los fallos de correo quedan auditados. Los avisos de vacaciones utilizan una outbox con intentos limitados. Los destinatarios se verifican mediante enlaces de un uso y se revalidan activo/rol/ámbito antes del envío. Se comprobó SMTP real y recepción humana; consultar ESTADO para la evidencia.

## Comprobaciones

```powershell
pnpm check
pnpm build
# Requiere los procesos locales y PostgreSQL en ejecución:
pnpm test
```

La integración crea datos etiquetados como sintéticos y elimina exclusivamente los IDs que creó. Guarda dos PDFs de evidencia en `.runtime/test-evidence`. La prueba UI usa el entorno Selenium compartido; `scripts/check-ui.py` requiere las credenciales temporales y la ruta del ChromeDriver instalado. No instala Selenium dentro del proyecto.

## Despliegue Compose

```powershell
docker compose up --build
```

Hay Dockerfiles y configuración para todos los procesos, volúmenes privados de documentos y migración al arrancar cada servicio. La construcción y ejecución completas se verificaron con ocho servicios saludables, pruebas HTTP, navegador, persistencia tras reinicios y restauración aislada de cinco bases y documentos. El modo canónico no publica PostgreSQL en Windows. Mantener un respaldo antes de cambios de esquema. Nunca ejecutar `down -v` sobre datos que se quieran conservar.

## Seguridad y almacenamiento

`.env`, `.env.*`, `.runtime`, PDFs, dependencias y clientes generados están excluidos de Git e imágenes. `.env.example` no contiene secretos. El Gateway verifica sesión en Identidad antes de cada petición privada, y emite una aserción interna firmada, corta y limitada por audiencia. Los servicios comprueban esa identidad y sus roles. No almacenar tokens en localStorage.

No se ha publicado ni subido este código a GitHub. Revisar ESTADO y las decisiones institucionales pendientes antes de cargar datos personales reales. No se atribuye conformidad legal, integración bancaria ni integración con Core.

## Acceso a usuarios de demostración

Las credenciales del entorno local de prueba se encuentran en [README_DEMO_LOCAL.md](README_DEMO_LOCAL.md), generado al cargar los datos. Este archivo está excluido de Git y solo existe en el equipo donde se preparó la demostración.
