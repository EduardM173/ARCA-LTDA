# Política operativa de demostración — propuesta para el equipo académico

**Estado:** propuesta de ensayo recibida el 02/11/2026. No es aprobación institucional, certificación laboral ni autorización para activar las políticas que la aplicación registra como aprobadas. Ninguna concesión a personas reales se deduce de este documento.

| Tema | Propuesta recibida | Estado verificable en ARCA RH |
|---|---|---|
| Derecho vacacional | Modo KATA: 15 días por gestión completada y funcionario ratificado | Implementado; el libro separa periodos laborales. |
| Calendario | Días laborables del horario configurado y feriados registrados | Implementado técnicamente: la política versionada admite días semanales seleccionados y feriados por fecha; las versiones anteriores conservan lunes a viernes. Aún no se ha aprobado un horario académico concreto. |
| Solicitud | Reservar saldo pendiente y descontar al aprobar | Implementado con `reservePending=true` en una política aprobada; las pruebas verificaron reserva, consumo y concurrencia. |
| Aprobación | Persona aprobadora distinta de la creadora | Implementado en el servicio, con permiso `vacations.approve` y ámbito de área. |
| Cancelación | Reverso y autorización para solicitudes aprobadas | Implementado para solicitudes que no han comenzado, con motivo, permiso y `cancelApproved=true` en la política de origen; registra movimientos de reverso. La propuesta no determina si se admitirían cancelaciones después del inicio. |
| Retroactividad | Excepcional, con motivo, autorización e historial | La vigencia salarial pasada exige política aprobada, permiso y motivo individual auditado. La ruta positiva no se ha ensayado con una política aprobada. Los cambios retroactivos de área/cargo siguen rechazados; la propuesta no fija cómo afectarían vigencias documentales. |
| Reingreso | Mismo expediente, periodo laboral nuevo | Implementado bajo política aprobada, con motivo, nuevo periodo y reinicio de antigüedad; conserva los periodos anteriores. |
| Rectificación | Documento nuevo vinculado; original inmutable | Implementado para contratos y boletas emitidas, sujeto a sus respectivas políticas aprobadas. |
| Pagos | Registro manual o simulado; sin transferencia bancaria | Implementado; estado, fecha, referencia, evidencia y actor persisten. `SIMULADO` se identifica como tal. |
| Permisos | Cinco perfiles, privilegio mínimo y ámbitos autorizados | Cinco perfiles implementados; cada cuenta requiere concesiones explícitas y ámbitos. La asignación concreta a personas requiere autorización. |

## Decisiones necesarias antes de activar la propuesta

- Definir el horario semanal concreto y registrar los feriados aplicables. Hasta aprobar una nueva versión, no se activa un horario académico supuesto; las versiones anteriores usan lunes a viernes.
- Elegir arrastre de gestiones: acumulación sin caducidad o solo última gestión. El texto recibido no lo define.
- Elegir la fecha de aniversario del 29 de febrero en años no bisiestos (`FEB28` o `MAR1`), o conservar el bloqueo `PENDING`.
- Definir si se permite cancelar una solicitud pendiente y qué ocurre con una aprobada una vez iniciado el descanso; hoy solo se revierte una aprobada antes de empezar.
- Definir el criterio de remuneración para un mes con varias vigencias (`START`, `END` o bloqueo `SINGLE`). La propuesta de retroactividad no fija ese cálculo.
- Designar a quien aprueba cada política y cada concesión de permisos. El acto de registro en la UI guarda identidad y fecha; este documento no sustituye ese acto.

Hasta entonces, las operaciones condicionadas deben permanecer bloqueadas por las políticas vigentes de cada servicio. Las políticas sintéticas empleadas en pruebas fueron eliminadas y no constituyen aprobación académica.
