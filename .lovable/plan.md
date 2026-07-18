## Objetivo

Sustituir el modelo actual de **solo A y B** por una **secuencia ordenada e ilimitada de puntos** (A, B, C, D, E…), cada uno con su propio radio. El viaje se cierra al tocar el **último** punto de la secuencia y se abre el siguiente ciclo empezando de nuevo en A.

Aplica primero a **rutas foráneas** (donde ya existe el trazado manual). Cuando quede sólido, se replica a urbanas.

---

## 1. Base de datos

**Nueva tabla `unidad_viaje_waypoints`** (secuencia por unidad):
- `unidad_id` (FK a `unidades_empresa`)
- `orden` (1 = A, 2 = B, 3 = C, …)
- `label` (texto libre: "Patio", "Maquila", "Regreso")
- `lat`, `lng`
- `radio_m` (radio propio de ese punto)
- Único: `(unidad_id, orden)`

**Alter `unidades_empresa`:**
- Nueva columna `viaje_tipo` ENUM('sencillo','redondo') default 'sencillo'.
- Se **conservan** `punto_a_lat/lng`, `punto_b_lat/lng`, `geofence_radius_m` para no romper nada existente; una migración de datos los copia como waypoints orden 1 y 2 automáticamente. Después el sistema lee de la nueva tabla.

**Alter `viajes_realizados`:**
- Nueva columna `waypoint_orden_actual` (int) — indica cuál punto está esperando cruzar el chofer (2 = va rumbo a B, 3 = va rumbo a C, etc.).
- Los campos `origen`/`destino` se mantienen para retro-compatibilidad pero se llenan con el label del waypoint correspondiente.

RLS: mismas reglas que `unidades_empresa` (dueño concesionario + choferes asignados leen; solo dueño escribe).

---

## 2. Edge Function `trip-geofence-tick`

Reescribir la lógica de "insideA / insideB" para trabajar con la secuencia:

1. Cargar los waypoints ordenados de la unidad.
2. Si NO hay viaje abierto:
   - Si el chofer está dentro del **waypoint 1 (A)**, abrir viaje con `waypoint_orden_actual = 2`.
3. Si HAY viaje abierto:
   - Calcular distancia al waypoint `waypoint_orden_actual`.
   - Si entró en su radio:
     - Si es el **último** de la secuencia → cerrar viaje (completado) y abrir el siguiente ciclo con `waypoint_orden_actual = 2`.
     - Si NO es el último → solo avanzar `waypoint_orden_actual += 1` (no cierra viaje todavía, es una parada intermedia).

Con esto:
- **Sencillo (2 puntos):** A → B cierra. Idéntico al comportamiento actual.
- **Redondo clásico (3 puntos):** A → B (parada intermedia) → C cierra.
- **Redondo multi-parada (N puntos):** cierra hasta el último.

---

## 3. UI Concesionario

Reemplazar `ContractGeofencePicker` (que solo permite origen/destino) por **`WaypointsPicker`**:

- Lista ordenada de puntos con drag-to-reorder.
- Botón **"+ Agregar punto"** (sin tope).
- Por cada punto: label, coordenadas (tap en mapa o "usar mi ubicación") y **input de radio propio**.
- Mapa muestra los puntos numerados 1, 2, 3… con círculos de sus radios respectivos y una línea punteada uniéndolos en orden.
- Botón "Eliminar punto" en cada fila (mínimo 2 puntos).
- Selector arriba: **Sencillo (A→B)** / **Redondo (A→B→…→último)**.

Se integra en el diálogo de puntos A/B de unidades y en el flujo de contratos foráneos.

---

## 4. UI Chofer (`DriverTripPanel`)

En el panel del viaje mostrar:
- "Vas rumbo a: **C – Maquila**" (usando `waypoint_orden_actual` + label).
- Progreso: `2 / 4 puntos` para que sepa cuántas paradas faltan para cerrar.
- El resto (mapa, lector QR, conteo) queda igual.

---

## 5. Migración de datos existentes

Al aplicar la migración:
- Para cada `unidades_empresa` con `punto_a_lat` y `punto_b_lat` NO nulos: insertar 2 filas en `unidad_viaje_waypoints` (orden 1 = A con radio actual, orden 2 = B con mismo radio) y marcar `viaje_tipo = 'sencillo'`.
- Viajes abiertos existentes: setear `waypoint_orden_actual` según su `destino` actual (destino B → 2, destino A → 1 del ciclo siguiente, etc.).

Nada existente deja de funcionar; solo gana la capacidad de agregar C, D, E…

---

## 6. Alcance de este cambio

- ✅ Backend: nueva tabla + edge function actualizada + migración de datos.
- ✅ UI concesionario: nuevo editor de waypoints (foráneas primero).
- ✅ UI chofer: indicador de "próximo punto".
- ❌ Urbanas: NO se toca en este cambio. Se replica cuando el flujo esté probado en foráneas.
- ❌ Cobro por tramo (`unidad_geocercas_cobro`, sub-QR): NO se toca; sigue con su lógica independiente.

---

## Notas técnicas

- El label es libre para que el concesionario pueda llamar a los puntos como quiera ("Patio", "Fábrica", "Regreso patio"), y la UI del chofer los muestra tal cual.
- El radio se define en metros por punto con default 150 m.
- `useAutoTripGeofence` no cambia — sigue mandando ubicación cada 15 s; toda la lógica nueva vive en `trip-geofence-tick`.
