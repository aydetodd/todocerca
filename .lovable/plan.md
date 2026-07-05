
## Qué se construye

Cuando un concesionario quiera modificar una ruta foránea maestra (nombre, trazado a mano, geocercas A/B, precio, o cualquier otro ajuste), abrirá una **solicitud** que:

1. Se guarda como evidencia con sus datos (nombre, QaRd, teléfono, ruta afectada) auto-adjuntos.
2. Le llega al admin por **bandeja interna** de la app y por **correo electrónico**.
3. Marca la ruta como "con cambio pendiente" pero **la ruta sigue operando** normal.
4. El admin la **aprueba o rechaza**. Al aprobar, los cambios se aplican a la ruta maestra y se propagan a todas las rutas de concesionarios vinculadas. Al rechazar, se conserva la evidencia con el motivo.

Los archivos KML/KMZ/GPX **no se piden** — el trazado propuesto se dibuja a mano en el mapa (mismo componente que ya usan hoy para trazar) y se guarda como GeoJSON en la solicitud.

## Flujo del concesionario

En "Catálogo Maestro" de rutas foráneas, cada ruta aprobada tendrá botón **"Solicitar cambio"**. Abre un diálogo:

- Tipo de cambio: Renombrar / Trazado / Geocercas A-B / Precio / Otro.
- Campos que aparecen según el tipo:
  - Renombrar → nuevo nombre.
  - Trazado → mini-mapa para dibujar a mano el nuevo recorrido.
  - Geocercas → picker para mover A/B y radio.
  - Precio → nuevo importe.
  - Otro → texto libre.
- **Motivo** (obligatorio): "por qué".
- Se muestra en pantalla lo que se va a enviar como evidencia (su nombre, QaRd, teléfono, ruta) para que sepa que queda registrado.

Al enviar, la ruta muestra un badge amarillo "Cambio pendiente" hasta que el admin resuelva.

## Flujo del admin

Nueva tarjeta en el panel de admin: **"Solicitudes de cambio a rutas maestras"** con filtros Pendientes / Aprobadas / Rechazadas. Cada solicitud muestra:

- Concesionario (nombre + QaRd + teléfono).
- Ruta afectada + tipo de cambio.
- Valor actual vs propuesto (side by side).
- Motivo del concesionario.
- Botones **Aprobar** / **Rechazar** (rechazar pide motivo visible para el concesionario).

Al aprobar: los cambios se escriben en `rutas_foraneas_maestras` y se propagan (trigger existente) a los `productos` vinculados. Se limpia el badge de "pendiente".

## Notificaciones

- **Bandeja interna**: se inserta un mensaje del canal oficial del sistema (ID `0...1`) al inbox del admin (usuario con `consecutive_number = 1`). Confirmación al concesionario cuando se aprueba/rechaza.
- **Correo**: edge function `notify-ruta-solicitud` envía email al admin con los datos de la solicitud y un link al panel. Requiere que el dominio de correo de Lovable Cloud esté configurado; si no lo está, la solicitud igual se crea y la bandeja interna funciona — solo se omite el correo.

## Detalles técnicos

### Migración

Tabla `ruta_maestra_solicitudes`:
- `ruta_maestra_id` → FK a `rutas_foraneas_maestras`
- `solicitante_user_id`, `solicitante_nombre`, `solicitante_qard`, `solicitante_telefono` (snapshot inmutable — evidencia)
- `tipo_cambio` enum: `renombrar | trazado | geocercas | precio | otro`
- `propuesta` jsonb (contiene nuevo nombre, nuevo geojson, nuevo lat/lng/radio, nuevo precio, según tipo)
- `motivo` text (obligatorio)
- `estado` enum: `pending | approved | rejected` (default pending)
- `admin_user_id`, `admin_resuelto_at`, `admin_motivo_rechazo`

Columna nueva en `rutas_foraneas_maestras`: `tiene_cambio_pendiente boolean default false`.

RLS:
- Concesionario: `INSERT` con `auth.uid() = solicitante_user_id`; `SELECT` solo de las suyas.
- Admin (`has_role(auth.uid(), 'admin')` o `consecutive_number = 1`): `SELECT/UPDATE` de todas.

Triggers:
- `AFTER INSERT`: marca la ruta como pendiente, inserta mensaje al inbox del admin, invoca (best-effort) la edge function de email.
- RPCs `admin_approve_solicitud_cambio(_id)` y `admin_reject_solicitud_cambio(_id, _motivo)` — aplican los cambios y avisan al concesionario por bandeja interna.

Realtime habilitado en la tabla para que el badge "pendiente" y la bandeja del admin actualicen sin recargar.

### Edge function

`supabase/functions/notify-ruta-solicitud/index.ts` — enviada por el trigger DB vía `pg_net` (o llamada desde el cliente tras crear la solicitud, más simple y sin dependencias nuevas). Usa la infra de correo de Lovable Cloud.

### Frontend

Nuevos componentes:
- `src/components/SolicitarCambioRutaDialog.tsx` (concesionario)
- `src/components/AdminSolicitudesCambioRutas.tsx` (admin)

Modificados:
- `src/components/RutasMaestrasManager.tsx` → botón "Solicitar cambio" + badge "Cambio pendiente".
- Panel de admin donde vive `AdminRutasMaestras` → agrega la nueva tarjeta.

Sin tocar lógica de negocio existente ni tipos de rutas. Sin credenciales nuevas. Sin librerías nuevas.

## Fuera de alcance (para no gastar de más)

- Subida de foto/PDF como evidencia (descartado por ti — solo datos auto-adjuntos).
- Aprobación parcial (todo o nada por solicitud).
- Historial visual de versiones anteriores del trazado (queda en la tabla `propuesta` como jsonb, pero sin UI de diff visual).
