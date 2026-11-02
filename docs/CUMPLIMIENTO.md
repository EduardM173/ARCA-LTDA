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
| Reingreso/retroactividad | Reingreso con expediente y periodo nuevo bajo política; salario retroactivo permitido bajo política | E2E reingreso con política sintética PASS. Propuesta de ensayo pendiente; salario retroactivo aún no exige motivo individual y asignación retroactiva se rechaza. |
| Vacaciones |15días/gestión, ratificación, ledgerportenencia, saldo/reservas, solapamientos | Concurrencia, aprobación/rechazo, UIhistorial/débito2PASS |
| Políticas variables | Calendario o lunes a viernes con feriados, arrastre, reserva, aniversario 29/02 y cancelación | La propuesta solicita horario laborable configurable: pendiente de implementación. Arrastre y aniversario requieren decisión académica; no se inventa normativa oficial. |
| Avisos vacaciones | Pendientealaprobador, decisionesalcreador; revalidación permisos |4envíosSMTP reales + recepciónconfirmada, flujonegocioAPIreal |
| Contratos | Plantillasversionadas, borradoreseditables, preview, snapshot, PDF privado | PruebasAPI/fallosfilesystem/reintentos y E2E navegadorPASS |
| Emisiones interrumpidas | Lock/transacción, reconciliaciónEMITIENDO, hash y estados coherentes | Casosfocalizados Contratos/PagosPASS; no falso EMITIDO |
| Pagos y conceptos | Catálogo, multipartidas, Decimal, boletas, MANUAL/SIMULADO/paidBy | API/E2E con2partidas, pagoSIMULADO y persistenciaPASS |
| Rectificación/anulación | Versiones vinculadas, original conservado, política explícita | PruebasfocalizadasPASS; aprobaciónoperativa a cargoresponsable |
| IndicadoresDirectorio | Agregados completos por dominio/estado/periodo, sin salarios individuales | SummaryAPI/Boardnegativos y navegación porrol |
| Auditoría | Actor/acción/recurso/instante y requestId propagado | Regresiónactual verificóUUIDGateway en5dominios; logging seguro |
| UX y accesibilidad técnica | Formularios/API, labels/teclado, diálogos, errores, contextoempleado | E2E módulos y contexto3módulos; viewportCDPreal1280/768/375 |
| Persistencia/backup/restore | Volúmenesprivados,5dumps+PDF y restoreaislado | Reiniciohashesigual; restore5BDconteos+2volúmenesSHAiguales |
| HTTPS/despliegue | Composecanónico y overlayTLSlocal | CookieSecure/HttpOnly/Strict +no-store observado;8healthyfinal |
| CI y reproducibilidad | Lockfile, scriptsbootstrap/migración/health/recovery, workflowGitHub | Pasosequivalenteslocales comprobados; ejecuciónremotaGitHub noafirmada |
| Usabilidad por tercero | Recorridos disponibles | PENDIENTEpersona ajenaaldesarrollo; no sustituible porSelenium |
| Aprobación institucional | UI permite registrar decisiones y concesiones | PENDIENTE equipo académico/dueño de negocio. La propuesta del 02/11/2026 está documentada en POLITICA_DEMOSTRACION.md, sin activar políticas ni concesiones. |

Comandos/evidencia detallados en ESTADO y documentos de cada dominio. Sinpush; autor local recuperado de la configuración existente de algorithm (EduardM173); configuración global preservada.
