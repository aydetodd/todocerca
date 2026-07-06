
# Cobro QR foráneo — modelo standby (sube-baja)

## Idea en simple

El concesionario dibuja **una o varias geocercas de cobro** sobre su ruta:

- Ruta con tarifa única (ej. $9): **1 sola geocerca** que cubre todo el trayecto.
- Ruta con tarifas por tramo (ej. Obregón → Bácum con paradas intermedias): **varias geocercas** con precio entre cada par.

Cuando el pasajero **sube** y escanea su QR:
1. El sistema apunta el QR + la geocerca donde subió + hora + viaje activo.
2. El saldo del pasajero **queda en standby** (no se cobra todavía).
3. En el escáner del chofer aparece **"Sube: Juan · $? pendiente"** y suma +1 en "Suben / A bordo".

Cuando el pasajero **baja** y vuelve a escanear el mismo QR:
1. El sistema busca su "viaje abierto" en standby.
2. Calcula el precio según la geocerca de subida ↔ geocerca de bajada.
3. **Cobra ese monto** al saldo QaRd del pasajero.
4. En el escáner aparece **"Baja: Juan · $12"** y suma +1 en "Bajan / A bordo −1".

Si el pasajero baja en la última geocerca del recorrido sin re-escanear, al cerrarse el viaje se cobra automáticamente la tarifa **máxima** de esa subida.

## Qué cambia en la app

### 1. Pantalla del chofer (foráneas) — mantener info + agregar escáner

En `DriverTripPanel` (Viajes con confirmación) se agrega **un botón grande "Cobrar QR"** justo debajo del mapa. Al tocarlo abre el escáner en pantalla completa:

- Cámara continua + input manual.
- Cada scan llama al edge function nuevo `cobro-qr-foraneo`.
- Muestra toast/chime distinto para **subida** ("+1 Juan · standby") vs **bajada** ("−1 Juan · $12 cobrados").
- Botón "Cerrar" regresa a la pantalla del viaje sin perder #viaje ni conteo.

El resto de la pantalla queda igual (#viaje, Suben/Bajan/A bordo, geocercas A/B, historial).

### 2. Configuración de geocercas de cobro (concesionario)

Ya existe la pantalla **"Geocercas de cobro (ida/vuelta)"** de la ruta. La extendemos para:

- Permitir **N geocercas** ordenadas a lo largo de la ruta (no solo A/B).
- Cada geocerca: nombre corto (ej. "Providencia"), centro (lat/lng), radio.
- Una **tabla de tarifas** entre pares de geocercas: `desde_geocerca → hasta_geocerca = $precio`.
- Caso simple (tarifa única): 1 sola geocerca y `precio_default` de la ruta.

### 3. Modelo de datos

Tablas nuevas:

- `ruta_geocercas_cobro`
  - `id`, `producto_id`, `nombre`, `lat`, `lng`, `radio_m`, `orden`
- `ruta_tarifas_tramo`
  - `id`, `producto_id`, `desde_geocerca_id`, `hasta_geocerca_id`, `precio_mxn`
- `qard_viajes_pasajero` (el "standby")
  - `id`, `qard_number` / `wallet_id`, `viaje_id`, `producto_id`, `subida_geocerca_id`, `subida_at`, `bajada_geocerca_id` (null hasta que baja), `bajada_at`, `monto_cobrado_mxn` (null hasta que baja), `estado` ('abierto' | 'cerrado' | 'auto_cerrado')

Cada tabla lleva sus `GRANT` y RLS estándar (solo el concesionario dueño puede editar sus geocercas/tarifas; el chofer puede leerlas de sus contratos; los `qard_viajes_pasajero` los inserta/actualiza la edge function con `service_role`).

### 4. Edge function `cobro-qr-foraneo`

Entrada: `{ unidad_id, viaje_id, qard_token, lat, lng }`.

Lógica:
1. Identifica al pasajero por `qard_token` y valida saldo mínimo.
2. Detecta en qué **geocerca de cobro** cae `lat/lng` (la más cercana dentro del radio).
3. Busca fila abierta en `qard_viajes_pasajero` para ese pasajero + `viaje_id`:
   - **Si no existe → SUBIDA**: inserta `{subida_geocerca_id, subida_at, estado='abierto'}`, incrementa `pasajeros_subidos` y `pasajeros_a_bordo` en `viajes_realizados`. Devuelve `{tipo:'sube', pasajero, standby:true}`.
   - **Si existe → BAJADA**: busca precio en `ruta_tarifas_tramo(subida, bajada)`; cobra del wallet QaRd; marca `estado='cerrado'`, `monto_cobrado_mxn`; incrementa `pasajeros_bajados`, decrementa `pasajeros_a_bordo`. Devuelve `{tipo:'baja', pasajero, monto}`.
4. Si el mismo QR escanea en la **misma geocerca** dentro de 60 s → ignora (anti-doble-tap).

### 5. Cierre automático al terminar viaje

Cuando `DriverTripPanel` cierra un viaje (llega a la geocerca destino), un trigger o el propio update de `viajes_realizados` a `completado` dispara:

- Para cada `qard_viajes_pasajero` con `estado='abierto'` de ese viaje:
  - Cobra la **tarifa máxima** desde su `subida_geocerca_id` hasta la última geocerca de la ruta.
  - Marca `estado='auto_cerrado'`.

Así ningún pasajero se queda "gratis" por olvidar escanear al bajar.

## Detalles técnicos

- Anti-cruce ruta pública vs privada respetado (memoria `qr-scope-publico-vs-privado`): `qard_viajes_pasajero.producto_id` debe coincidir con el `producto_id` del viaje.
- Realtime: agregar `qard_viajes_pasajero` a `supabase_realtime` para que el escáner y la lista "A bordo" se sincronicen entre dispositivos.
- Precisión GPS: si el punto cae fuera de todas las geocercas de cobro por <30 m, se snapea a la más cercana.
- Hermosillo (UTC-7) para `subida_at` / `bajada_at` en reportes.
- Reporte diario del concesionario: se agrega columna "$ cobrado por tramo" agrupado por viaje.

## Fases sugeridas

1. **Fase A (esta iteración)**: botón "Cobrar QR" en `DriverTripPanel` + pantalla escáner que llama al edge function. Tablas + edge function `cobro-qr-foraneo` con lógica sube/baja. Cierre automático al completar viaje.
2. **Fase B**: UI del concesionario para dibujar N geocercas y capturar la tabla de tarifas entre pares.
3. **Fase C**: reporte diario con desglose $ cobrado por tramo por viaje.

¿Arranco por la Fase A?
