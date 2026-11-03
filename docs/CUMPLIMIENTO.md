# Matriz de cumplimiento · 02/11/2026

Fuentes: MASTER7.0 preservado en raíz, ampliación7.1 SMTP y solicitudes expresas del usuario. «Verificado» se refiere a pruebas técnicas observadas, no a certificación legal ni aprobación institucional.

| Requisito | Implementación | Evidencia / estado |
|---|---|---|
| Stack y cinco dominios | React/TS, NestJSExpressAdapter, Prisma propio por servicio, PostgreSQL | Build real backend/web;8servicioshealthy Compose |
| Bases privadas y mínimos privilegios |5BD/usuarios, sinFKcruzadas, puertos internos |5conexiones propias +20accesoscruzadosdenegados; check-infraPASS |
| Login/sesiones/contraseña | Cookieopaca, revocación, authVersion/CAS, Argon2id | Identidad7grupos, navegador y regresión11gruposPASS |
| Identidad interna y CSRF | GatewayEd25519, audiencia/emisor, origen validado | Encabezado/firmafalsa y origensitioexterno denegados |
| Permisos por acción/recurso/campo | Grants explícitos y scopes organizacional/áreas | NegativosAPI, rolesUI, HRsin salarios, fixtures scoped |
| Último administrador | Lock transaccional y concesión users.manage | Carrera de desactivaciones enBDaisladaPASS |
| SMTP/propiedad correo | TLS, verificaciónlink, outboxcifrada/leases/reintentos | Gmailaceptó y usuario confirmórecepción de flujos reales |
| Recuperación | Hash de token/unuso/caducidad, sesionesrevocadas | SMTP+consumoAPI, expiry/reuso/concurrenciaPASS |
| Personal | Altas, catálogos, cambios/versiones, periodos/historial, ratificación/baja | DB/HTTP y E2E PersonalPASS |
| Reingreso/retroactividad | Reingreso con expediente y periodo nuevo bajo política; salario retroactivo exige motivo individual y política aprobada | E2E reingreso con política sintética PASS. Integración HTTP/BD verificó rechazo sin motivo, aceptación con motivo y política sintética, evento histórico y snapshot contractual inmutable. Asignación retroactiva de área/cargo aún se rechaza, a la espera de reglas de vigencia documental. |
| Vacaciones |15días/gestión, ratificación, ledgerportenencia, saldo/reservas, solapamientos | Concurrencia, aprobación/rechazo, UIhistorial/débito2PASS |
| Políticas variables | Calendario o horario semanal configurable con feriados, arrastre, reserva, aniversario 29/02 y cancelación | Migración de días laborables aplicada; prueba de cómputo focalizada PASS. El horario concreto, arrastre y aniversario requieren decisión académica; no se inventa normativa oficial. |
| Avisos vacaciones | Pendientealaprobador, decisionesalcreador; revalidación permisos |4envíosSMTP reales + recepciónconfirmada, flujonegocioAPIreal |
| Contratos | Plantillas versionadas, borradores editables, revisión del texto antes de emitir, snapshot y PDF privado | Pruebas API/fallos filesystem/reintentos; recorrido documental en navegador y descarga PDF PASS |
| Emisiones interrumpidas | Lock/transacción, reconciliaciónEMITIENDO, hash y estados coherentes | Casosfocalizados Contratos/PagosPASS; no falso EMITIDO |
| T14: Personal no disponible | Emisión nueva de Contratos y Pagos revalida Personal; PDF histórico usa documento almacenado | Personal detenido realmente: ambos servicios devolvieron 503 para borrador nuevo, conservaron BORRADOR y sirvieron PDF histórico; Contratos 11 grupos e integración 13 grupos PASS |
| Pagos y conceptos | Catálogo, multipartidas, Decimal, boletas, MANUAL/SIMULADO/paidBy; preparación bloqueada si faltan conceptos o personal | API/E2E con dos partidas, pago SIMULADO, PDF, persistencia y estados vacíos en navegador PASS |
| Rectificación/anulación | Versiones vinculadas, original conservado, política explícita | PruebasfocalizadasPASS; aprobaciónoperativa a cargoresponsable |
| IndicadoresDirectorio | Agregados por dominio/estado y boletas del mes de negocio de La Paz, sin salarios individuales; hora de consulta por tarjeta | Summary API/Board negativos; Selenium verificó periodo actual, hora de consulta y «No disponible» sin cero ni hora anterior durante caída real de Pagos, seguido de recuperación |
| Auditoría | Actor/acción/recurso/instante y requestId propagado, consulta paginada por dominio según ámbito; filtro de cualquier ID de actor | Regresión verificó UUID Gateway en cinco dominios; lectura API y selección/filtro en navegador para Identidad, Personal, Vacaciones, Contratos y Finanzas según rol PASS |
| UX y accesibilidad técnica | Formularios/API, labels/teclado, diálogos, errores, contextoempleado | E2E módulos y contexto3módulos; viewportCDPreal1280/768/375 |
| Persistencia/backup/restore | Volúmenesprivados,5dumps+PDF y restoreaislado | Reiniciohashesigual; restore5BDconteos+2volúmenesSHAiguales |
| HTTPS/despliegue | Composecanónico y overlayTLSlocal | CookieSecure/HttpOnly/Strict +no-store observado;8healthyfinal |
| CI y reproducibilidad | Lockfile, scriptsbootstrap/migración/health/recovery, workflowGitHub | Pasosequivalenteslocales comprobados; ejecuciónremotaGitHub noafirmada |
| Usabilidad por tercero | Recorridos disponibles | PENDIENTEpersona ajenaaldesarrollo; no sustituible porSelenium |
| Aprobación institucional | UI permite registrar decisiones y concesiones | PENDIENTE equipo académico/dueño de negocio. La propuesta del 02/11/2026 está documentada en POLITICA_DEMOSTRACION.md, sin activar políticas ni concesiones. |

Comandos/evidencia detallados en ESTADO y documentos de cada dominio. Sinpush; autor local recuperado de la configuración existente de algorithm (EduardM173); configuración global preservada.
