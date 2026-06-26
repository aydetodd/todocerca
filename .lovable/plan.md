
## Lo que vamos a construir

### 1) Arreglar el mapa del diálogo de geocercas de cobro
Hoy se abre el diálogo pero el mapa no aparece. Es un bug de Leaflet: el contenedor se monta antes de tener tamaño, así que el mapa se renderiza en 0×0. Arreglo: forzar `invalidateSize()` al abrir el diálogo y dar altura fija al contenedor (`h-[60vh]`).

### 2) Tarifas por tramo (matriz origen→destino)

En vez de "una geocerca = un precio", cada ruta tiene **paradas ordenadas** (A, A1, A2, A3, A4, A5, B) y una **matriz de precios** entre cualquier par de paradas, separada por sentido (ida / vuelta).

Ejemplo de lo que tú escribiste:

```text
IDA:
  A  → B  = $100
  A1 → B  = $90
  A2 → B  = $80
  A1 → A2 = $15
  A4 → A5 = $18
  A4 → B  = $20
  ...
```

El concesionario lo edita en una **tabla tipo Excel** dentro de la app: filas = parada de subida, columnas = parada de bajada. Solo llena el triángulo que aplica al sentido (ida llena hacia adelante, vuelta hacia atrás).

### 3) Cobro automático con QR (sin que el chofer toque nada)

Flujo del pasajero:

1. **Sube al camión** y escanea el QR del lector (Raspberry Pi o teléfono del chofer).
   - El sistema detecta en qué parada (geocerca) está el camión en ese momento → esa es su **parada de subida**.
   - Se "aparta" en stand-by el precio máximo posible desde esa parada hasta el final de la ruta (peor caso, para asegurar saldo).
2. **Baja del camión** y escanea el MISMO QR otra vez.
   - El sistema detecta la parada actual → esa es su **parada de bajada**.
   - Calcula el precio real `tarifa[subida][bajada]` según sentido del viaje.
   - **Devuelve la diferencia** entre lo apartado y lo real, y cobra solo lo que recorrió.
3. Si el pasajero nunca baja (se le olvida re-escanear) antes de fin de viaje, se cobra el tramo completo hasta el final.

### 4) Qué guardamos por cada cobro

Por cada pasajero y por cada viaje:
- QR / pasajero id
- Parada de subida + coordenadas + timestamp
- Parada de bajada + coordenadas + timestamp
- Sentido (ida/vuelta)
- Precio apartado, precio real, diferencia devuelta
- Unidad, chofer, viaje, ruta
- Origen del scan: `raspberry_pi` o `telefono_chofer`

Esto alimenta los reportes, conteo, mapa de calor y analíticas.

### 5) Raspberry Pi y teléfono usan el MISMO endpoint

Una sola Edge Function `cobro-qr-tramo` que recibe:
```json
{ "unidad_id", "qr_token", "lat", "lng", "fuente": "raspberry"|"telefono" }
```
- Si es el 1er scan del pasajero en este viaje → registra subida + aparta saldo.
- Si es el 2do scan → registra bajada + ajusta cobro.

Así la Pi y el celular del chofer son intercambiables (alineado con el sistema dual que ya armamos).

---

## Cambios técnicos (resumen para no técnicos: dónde queda cada cosa)

**Base de datos** (1 migración):
- `route_paradas` — paradas ordenadas por ruta (orden, nombre, lat, lng, radio_m).
- `route_tarifas` — matriz de precios `producto_id × sentido × parada_subida_id × parada_bajada_id → precio_mxn`.
- `cobros_qr_tramo` — registro de cada subida/bajada por pasajero.
- RPCs: `rpc_route_set_paradas`, `rpc_route_set_tarifas`, `rpc_cobro_qr_scan` (resuelve subida/bajada y calcula).
- GRANTs + RLS para concesionario dueño.

**Edge Function**:
- `cobro-qr-tramo` (Pi + teléfono).

**UI concesionario** (todo dentro del módulo de rutas, no hay icono nuevo):
- Pestaña **"Paradas y tarifas"** en cada ruta privada/foránea, con:
  - Editor de paradas sobre el mapa del trazado azul.
  - Tabla editable de la matriz ida / vuelta.
- Fix del mapa en `UnidadGeocercasCobroDialog`.

**UI chofer / scanner**:
- Scanner existente llama al nuevo RPC; muestra "Subió en A2 — apartado $80" o "Bajó en A4 — cobrado $36, devuelto $44".

---

## Lo que NO incluye este plan (lo hablamos aparte si quieres)
- Tarjeta/saldo del pasajero (hoy asumimos que el QR ya tiene crédito como en el sistema `qr_tickets` actual).
- Firmware de la Raspberry Pi (solo dejamos listo el endpoint que va a consumir).
- Pantalla pública de "cuánto pagué" para el pasajero (se puede agregar después).

¿Apruebo y empiezo? Si quieres ajustar el orden (por ejemplo arreglar primero solo el mapa y dejar la matriz de tarifas para el siguiente turno) dímelo.
