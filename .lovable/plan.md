# Validación de INE con confirmación del usuario

Hoy, cuando alguien sube las fotos de su INE, el sistema lee la credencial y **sube solo el nivel automáticamente**: la persona nunca ve qué se leyó. El cambio parte el proceso en dos: primero se muestra lo leído, y el nivel sube **solo** cuando la persona confirma.

## Qué ya existe (no se duplica)

- Lectura de INE con Verificamex (frente y reverso), guardado de fotos en almacén privado, límite de 3 intentos y comparación con la CURP validada en RENAPO.
- Registro de intentos en la bitácora `verificamex_logs`.
- Datos de identidad y nivel en `qard_identidad`.

Se reutiliza todo eso. No se crean tablas `users`, `transactions`, `user_verifications` ni `verification_logs` nuevas.

## Nuevo flujo

```text
1. Sube fotos (frente y reverso)
2. Pantalla "Validando tu INE..." con indicador de carga
3. Se leen los datos y se guardan como PENDIENTE (el nivel NO sube)
4. Se compara la CURP leída con la CURP ya validada
   4a. Coinciden  -> tarjeta con Nombre, CURP, Clave de elector y Fecha de nacimiento
                     [Confirmar que son correctos]  [Reportar error]
                     Confirmar -> nivel 2 y límite 3,000 UDIS
   4b. No coinciden -> se muestran las dos CURP lado a lado, no sube de nivel,
                       puede reintentar o pedir ayuda
```

## Base de datos

Nueva tabla `ine_validaciones` (una fila por intento leído):

- `user_id`, `ine_nombre_extraido`, `ine_curp_extraido`, `ine_numero_credencial`, `ine_fecha_nacimiento`, `ine_fecha_extraccion`
- `curp_renapo` (la que ya estaba validada), `coincidencia` (sí/no)
- `ine_confirmed` (falso por defecto), `estado`: `pendiente` | `confirmado` | `rechazado` | `no_coincide`
- `raw_response_enc`: respuesta completa de Verificamex cifrada, para depuración
- fotos: `ine_front_image_url`, `ine_back_image_url`
- Permisos: cada persona ve solo sus filas; el administrador ve todas. Escritura únicamente desde el servidor.

La bitácora `verificamex_logs` gana tres columnas: `datos_extraidos` (JSON), `coincidencia` (sí/no) y `accion_tomada` (`nivel_2_activado` / `validacion_rechazada` / `pendiente_confirmacion`). Así la auditoría pedida vive en la bitácora que ya existe.

## Servidor

Se ajusta la función `verificamex-ine` con dos acciones, sin duplicar la lógica de lectura:

- **leer** (comportamiento actual al subir fotos): extrae Nombre, CURP, Clave de elector y Fecha de nacimiento, guarda la fila en `ine_validaciones` como pendiente, registra la bitácora y **devuelve los datos sin subir el nivel**. Si la CURP no coincide, se marca `no_coincide`, se devuelven ambas CURP y nunca sube de nivel.
- **confirmar**: recibe el identificador de esa validación, verifica que sea del usuario, esté pendiente y con coincidencia; entonces marca `ine_confirmed`, sube a nivel 2 con 3,000 UDIS y deja la bitácora en `nivel_2_activado`.
- **reportar**: marca la fila como `rechazado` para que el administrador la revise; el nivel se queda igual.

Se mantiene el tope de 3 intentos, el cobro único de activación de $20 (subir a nivel 2 sigue sin costo extra) y el guardado de fotos.

## Pantallas

- `VerificarIdentidadDialog`: después de enviar las fotos aparece el paso "Validación de INE en proceso" con indicador de carga; al terminar muestra los datos leídos en tarjetas claras con los botones **Confirmar datos** y **Corregir**. El mensaje de éxito de nivel 2 solo aparece tras confirmar. Si la CURP no coincide, se muestran las dos CURP y las opciones de reintentar o pedir ayuda.
- Administración (`/panel-admin`, tarjeta nueva "Validaciones de INE"): lista de todas las validaciones con nombre y CURP leídos frente a los de RENAPO, si coincidieron y el estado (Pendiente de confirmación, Confirmado, Rechazado), con filtro por estado.

## Detalles técnicos

- Migración: `CREATE TABLE public.ine_validaciones` con GRANT a `authenticated`/`service_role`, RLS (dueño y admin por `has_role`/consecutivo 1) y trigger de `updated_at`; `ALTER TABLE public.verificamex_logs ADD COLUMN datos_extraidos jsonb, coincidencia boolean, accion_tomada text`.
- `raw_response_enc` usa `qard_enc`, igual que `verificamex_data_enc`.
- La clave de elector y la fecha de nacimiento se extraen con los buscadores ya presentes (`buscarPorTipo` / `buscar`) añadiendo las llaves `clave de elector`, `voterkey`, `cic`, `ocr`, `fechanacimiento`, `birthdate`.
- Nuevo componente `src/components/qard/AdminValidacionesIne.tsx`, montado en `AdminQuickAccess`.
