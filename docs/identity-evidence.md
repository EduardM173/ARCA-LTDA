# Identidad y SMTP · evidencia observada 02/11/2026

Comandos ejecutados:

- `node --env-file=.env tests/identity-isolated.mjs --smtp`: **7 grupos aprobados**. El primer intento detectó un defecto del harness (top-level await con salida CJS); se envolvió en una función asíncrona y el segundo intento pasó. La base aislada se creó, migró y eliminó mediante nombre UUID exacto. Ningún usuario operativo ni contraseña de la cuenta administradora se modificó.
- `node --env-file=.env --import tsx tests/vacation-mail-workflow.ts`: **aprobado**. Dos actores sintéticos con alias del buzón Gmail autorizado verificaron su correo consumiendo los enlaces reales por API. Después se ejecutaron alta/ratificación, política sintética, dos solicitudes y las decisiones de aprobación/rechazo en PostgreSQL real. Cuatro notificaciones correspondientes fueron aceptadas por SMTP: dos pendientes al aprobador y dos decisiones al creador. El saldo consumido fue de dos días. Se eliminaron exclusivamente los IDs de los fixtures, políticas, movimientos, colas y cuentas de esa prueba.

Cobertura de los siete grupos de Identidad:

1. Aserciones Ed25519 aceptadas; firma Gateway HS256 falsificada rechazada; permisos explícitos y prohibición de autoasignar concesiones.
2. Dos cambios concurrentes con la contraseña anterior producen un solo éxito; se revocan sesiones e invalidan enlaces de recuperación anteriores.
3. Recuperación caducada rechazada, enlace válido consumido una vez, reuso rechazado y sesión previa revocada.
4. Bloqueo de una cuenta invalida su sesión.
5. Entrega con lease vencido en el quinto intento pasa a ERROR; ámbito revocado impide envío SMTP.
6. Dos desactivaciones concurrentes no eliminan el último administrador activo en la base aislada.
7. Verificación de email y recuperación generadas por los endpoints, almacenadas cifradas en la outbox y aceptadas por SMTP real. Los tokens solo se descifraron en memoria del harness; no se imprimieron.

Defectos corregidos y comprobados: invalidación de tokens pendientes al cambiar/restablecer contraseña; compare-and-swap `authVersion` al restablecer; recuperación de lease final de la outbox. El worker también revalida rol, permiso y ámbito del destinatario inmediatamente antes de enviar avisos de vacaciones.

La aceptación por SMTP de estos mensajes no equivale a recepción confirmada. La recepción de la prueba inicial del transporte ya fue confirmada por el usuario; el usuario confirmó explícitamente el 02/11/2026 la recepción del conjunto de mensajes de verificación, recuperación y vacaciones. SMTP no ofrece garantía de entrega exactamente una vez ante una caída después de aceptar el mensaje y antes de persistir la aceptación; se conservan IDs de mensaje estables y se impiden duplicados de negocio.
