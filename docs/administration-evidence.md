# Administración y cuenta · evidencia 01/11/2026

Componentes React integrables `Administration.tsx` y `Account.tsx`, con CSS local `Management.css`. Utilizan APIs reales, diálogos nativos accesibles y no utilizan alert/prompt. El catálogo de permisos proviene de Identidad. Las concesiones propias no se editan; los ámbitos vacíos conservan denegación por defecto y el acceso organizacional exige una elección explícita y confirmación de autorización.

E2E ejecutado con Chrome/Selenium del entorno compartido contra http://localhost:5173 y PostgreSQL real:

- Creación de usuario desde UI; roles, permiso adicional y ámbito por área concedidos explícitamente.
- Bloqueo y habilitación del usuario desde UI, revocación informada y protección visual de concesiones propias.
- Alta de área, edición del nombre y desactivación desde UI.
- Consulta de auditoría administrativa.
- Estado de correo pendiente mostrado sin fingir verificación.
- Contraseñas nuevas distintas rechazadas en el formulario; cambio correcto, salida de sesión y nuevo inicio con la nueva contraseña.
- Comprobación directa posterior en Identidad/Personal de roles, permisos, departamento asignado, estado activo, catálogo inactivo y hash de nueva contraseña.
- Comprobación focalizada adicional de viewport **real** 375/768 con CDP y `innerWidth == ancho esperado`; sin desbordamiento horizontal en Administración/Cuenta/diálogo. No se infirió el ancho desde `set_window_size` (Chrome headless impone un mínimo de ventana que puede ser mayor).

Comandos: `node --env-file=.env tests/contracts-admin-ui-fixture.mjs`, Python del entorno Selenium compartido ejecutando `tests/contracts-admin-ui.py`, subcomandos `verify` y `cleanup` del fixture. El primer intento se detuvo al buscar un input antes de terminar la carga de catálogos; el script se corrigió con espera explícita y el recorrido completo pasó. Las pruebas responsive exactas se ejecutaron separadamente después del CSS local; la misma comprobación CDP queda incluida en el script reutilizable.

Los usuarios sintéticos tienen correos `.invalid`; **no** se solicitó verificación ni envío de correo a esas direcciones. Credenciales aleatorias se guardaron únicamente en un JSON privado bajo `.runtime`, eliminado al limpiar. Se eliminaron usuarios, sesiones, tokens, eventos de auditoría y áreas exclusivamente de esos fixtures. No se alteró la cuenta real ni políticas institucionales. Las capturas `administration-ui-*.png` se revisaron mediante view_image y permanecen como evidencia local ignorada por Git.
