# Medición de almacenamiento · 01/11/2026

| Concepto | Antes | Después |
|---|---:|---:|
| Espacio libre C: | 395.654.025.216 bytes | 392.241.164.288 bytes |
| Proyecto, tamaño lógico | 1.068.428 bytes | 576.784.716 bytes |
| node_modules, incluido en proyecto | 0 | 449.917.496 bytes |
| Pagefile asignado | 10.200.547.328 bytes | 10.200.547.328 bytes |
| Caché pip | 7.677.326 bytes | 7.677.326 bytes |

La variación observada de espacio libre es de -3.412.860.928 bytes. No equivale al tamaño del código. El tamaño lógico puede contar archivos enlazados más de una vez, por lo que no deben sumarse sin más las carpetas que usan hardlinks o junctions.

- Almacén pnpm disponible después: 1.779.761.882 bytes lógicos, 96.825 archivos. No se midió su tamaño antes; no se atribuye todo ese almacén a esta tarea ni se elimina contenido preexistente.
- Docker: imagen PostgreSQL 433,4 MB, volumen activo 122,6 MB; cero caché de build. VHDX de datos 2.160.066.560 bytes y VHDX del motor 134.217.728 bytes. Se inició el motor que estaba detenido; no se midió inicialmente el tamaño de esos discos virtuales.
- Clientes Prisma locales propios: 125.020.128 bytes. Se eliminaron 87.780.680 bytes de motores Linux locales redundantes; Docker generará su cliente nativo.
- La asignación del pagefile no aumentó. Compromiso final: 19.311.009.792 / 26.981.081.088 bytes (~72%). No se modificaron ajustes de memoria, hibernación ni restauración.

La suma exacta de toda la variación de C: no se puede reconciliar sin una línea base previa de pnpm/Docker y otros procesos de Windows. Se conserva esa limitación de medición, sin asignar diferencias no medidas al proyecto.

Archivos locales conservados en `.runtime`: credenciales iniciales (el usuario debe borrarlas después de cambiar la contraseña), capturas UI, dos PDFs sintéticos de evidencia y auditoría de dependencias. Son pequeños, están excluidos de Git e imágenes y no hay temporales de instalación pendientes de limpieza. Los fixtures de prueba y sus PDFs operativos se eliminaron por ID; las copias de evidencia se conservan intencionalmente. El volumen PostgreSQL y los paquetes instalados son recursos persistentes para ejecutar y desarrollar el proyecto.

Auditoría pequeña del medidor: `C:\Users\lalol\.codex\storage-audits\ARCA-LTDA.jsonl`.


## Cierre del lote final · 02/11/2026

- Antes de reconstruir: libres379.025.850.368bytes; proyecto601.168.138bytes.
- Después de build, pruebas y limpieza: libres379.288.842.240bytes; proyecto601.316.974bytes (~601,3MB lógicos), de los cuales449.917.496bytes son node_modules. Diferencia libre observada:+262.991.872bytes; no atribuir cada variación de Windows exclusivamente al proyecto.
- Docker al cierre:3imágenes activas1,405GB;3volúmenes activos123,5MB; caché2,081GB. Se seleccionaron13registros privados nuevos por diferencia deIDs respecto al inventario previo, preservando33IDs preexistentes. No hubo pruneglobal, eliminación de imágenes activas ni de volúmenesoperativos. Cachéprevia preservada por atribución incierta/reutilización.
- Pagefile asignado12.360.613.888bytes, sin modificación manual. Aumentó desde10.200.547.328 durante las jornadas; esto explica parte de la caída acumulada de espacio, sin afirmar que toda se deba al proyecto. Compromiso final25.441.730.560/29.141.868.544bytes (~87,3%). No se cierran aplicaciones del usuario.
- Fixtureintegrado .runtime/infra-deployment-fixture.json eliminado con sus datos/PDF exactos. Quedan intencionalmente los backups sintéticos de evidencia, capturas/logs pequeños, certificadoTLSlocal y archivo privado de acceso inicial; todos ignorados porGit. No hay instalación temporal de dependencias ni BDdepruebaaislada pendiente de limpieza conocida.
