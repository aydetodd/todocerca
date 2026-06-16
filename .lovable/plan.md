# Vinculación ESP32 desde concesionario + viajes automáticos A↔B

## Lo que cambia para el usuario

**Concesionario (panel de unidades):**
- En cada tarjeta de unidad agrega dos botones nuevos:
  - **"Vincular ESP32"** (ya existe el diálogo Bluetooth, solo se mueve aquí — antes lo hacía el chofer).
  - **"Definir puntos A y B"** — mini-mapa donde toca dos puntos y elige el radio (50–500 m). Se guardan en la unidad.

**Chofer:**
- Se elimina el botón/sección de "Vincular contador" en su panel. El chofer solo prende el carro y maneja.
- Al cruzar el círculo del **punto A** o del **punto B** el sistema:
  1. Cierra el viaje en curso (snapshot de pasajeros del ESP32 + reinicia el contador a 0).
  2. Abre automáticamente el siguiente viaje (alternando A→B, B→A, A→B…).
- Si el chofer arranca lejos de A y B, el primer viaje se abre al cruzar la primera geocerca y se cierra en la otra.

## Ejemplo numérico
Unidad con punto A (terminal Norte) y punto B (terminal Sur), radio 150 m.
- 7:00 chofer arranca en A → entra al radio de A → abre **viaje 1 (A→B)**, contador ESP32 = 0.
- 7:45 entra al radio de B → cierra viaje 1 con `pasajeros_subidos = 28`, reset ESP32. Abre **viaje 2 (B→A)**.
- 8:30 entra al radio de A → cierra viaje 2 con 31 pasajeros. Abre viaje 3.
- Al final del día: 10 viajes, cada uno con su número de pasajeros.

## Cambios técnicos

### Base de datos (1 migración)
- `unidades_empresa`: agregar columnas
  - `punto_a_lat`, `punto_a_lng` (numeric)
  - `punto_b_lat`, `punto_b_lng` (numeric)
  - `geofence_radius_m` (integer, default 150)
- `viajes_realizados`: agregar
  - `origen` text ('A' | 'B') — desde dónde salió
  - `destino` text ('A' | 'B')
- RPC `rpc_unidad_set_puntos_ab(unidad_id, a_lat, a_lng, b_lat, b_lng, radio)` con check de `is_proveedor_owner`.

### Edge function nueva: `trip-geofence-tick`
Se llama desde el cliente del chofer cada 15 s con `{lat, lng, unidad_id}`. Lógica:
1. Lee `punto_a/b` + radio de la unidad.
2. Calcula Haversine a A y a B.
3. Si entra a A o B y hay viaje abierto cuyo `destino` coincide → cierra viaje (snapshot de pasajeros desde `conteo_pasajeros_eventos` con `viaje_id` actual, reset lógico) y abre el siguiente alternando.
4. Si no hay viaje abierto y entra a una geocerca → abre viaje cuyo `origen` = ese punto, `destino` = el otro.
5. Idempotente (evita doble cierre si el GPS rebota dentro del radio).

### Hook nuevo: `useAutoTripGeofence(unidadId)`
- Reemplaza/complementa la lógica manual existente (`viajes-automaticos-geocercas` memoria).
- Solo activo cuando el chofer está en turno con unidad asignada.
- Llama al edge function con la posición ya capturada por `useProviderLocationTracking` (sin GPS extra).

### UI concesionario
- `src/pages/PanelConcesionario.tsx` (pestaña Unidades): en cada tarjeta agregar:
  - Botón **"📡 Vincular ESP32"** → abre `Esp32LinkDialog` (mover el dialog actual aquí).
  - Botón **"📍 Puntos A y B"** → nuevo componente `UnidadPuntosABDialog` con Leaflet + 2 markers arrastrables + slider de radio.

### UI chofer (limpiar)
- `src/components/DriverProfilePanel.tsx`: quitar la sección "Contador de pasajeros / Vincular ESP32".
- `src/components/Esp32LinkDialog.tsx`: se mantiene el componente, solo cambia desde dónde se invoca.

### Snapshot de pasajeros
- Al cerrar un viaje, contar `conteo_pasajeros_eventos` con `viaje_id` del viaje recién cerrado, evento `'subida'` → guardar en `viajes_realizados.pasajeros_subidos`.
- El ESP32 ya graba con `unidad_id` y `esp32_mac`; en `esp32-conteo-pasajeros` agregar `viaje_id` = viaje abierto actual de esa unidad (lookup rápido).

## Lo que NO cambia
- Suscripción ESP32 ($500/año) sigue igual.
- Provisioning WiFi del ESP32 (`Esp32WifiProvisioner`) sigue siendo del concesionario (ya lo era).
- Reportes y dashboard del concesionario leen `viajes_realizados` igual, solo que ahora vienen llenos automáticos.

¿Apruebas para implementar?
