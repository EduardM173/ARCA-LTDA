# ADR 001: arquitectura operativa del kata

Estado: implementación técnica existente; las políticas institucionales siguen requiriendo aprobación explícita.

Se conservan cinco dominios desplegables, un Gateway, una aplicación React y una instancia PostgreSQL con cinco bases y usuarios independientes. REST síncrono y transacciones locales cubren las lecturas entre dominios sin introducir broker, saga ni infraestructura adicional. Las escrituras pertenecen al servicio dueño de cada base; no se promete atomicidad distribuida entre la consulta de Personal y la emisión de un documento.

El navegador usa sesiones revocables. Las identidades internas del Gateway se firman con Ed25519 para que los verificadores no puedan suplantar al emisor. Las llamadas entre dominios se restringen por emisor, audiencia y responsabilidad del endpoint. Los permisos sensibles y ámbitos se conceden desde administración; no se deduce una política institucional de departamentos.

Los documentos emitidos conservan snapshot y hash en una base del dominio y archivo privado en volumen persistente. La recuperación debe comprobar consistencia del archivo y el registro, sin sobrescribir documentos históricos. La emisión de boleta y el registro de pago son operaciones distintas; el modo simulado queda explícito y trazable.

La outbox SMTP vive en Identidad y almacena cifrado el contenido temporal que requiere recuperar enlaces de un uso. Las notificaciones de Vacaciones se transfieren a esa capacidad restringida, sin crear otro microservicio. La aceptación SMTP no acredita recepción del buzón y un reintento tras caída de conexión puede producir entrega repetida; se conserva id de mensaje estable y estado de aceptación.

Compose sirve para una demostración reproducible y verificable, no acredita alta disponibilidad ni autorización productiva. El respaldo detiene temporalmente escritores y captura las cinco bases y los dos volúmenes PDF; el ensayo restaura exclusivamente en recursos nuevos y compara conteos y hashes. No modifica PostgreSQL del host ni elimina volúmenes operativos.

Las ampliaciones institucionales —retroactividad, reingreso, calendarios, rectificaciones y cancelaciones— se implementan como opciones limitadas y aprobables. Las variantes no aprobadas deben bloquear la operación afectada con un motivo legible; no justifican detener funcionalidades independientes.
