# Geocercas de tarifa por sentido (ida / vuelta)

## Qué se logra (en simple)

Hoy el concesionario solo marca **A** y **B** (geocercas de cierre/apertura de viaje, con un solo radio). 

Ahora además podrá pintar sobre el trazado **geocercas de cobro** (zonas tarifarias) **independientes**, con su propio tamaño cada una, y **separadas por sentido**:

- **Sentido IDA (A → B):** sus propias geocercas y precios.
- **Sentido VUELTA (B → A):** otras geocercas distintas con sus precios.

Cuando el camión va en sentido A→B el sistema solo respeta las geocercas de IDA; cuando regresa B→A respeta las de VUELTA. Así una misma calle puede cobrar diferente según el sentido.

## Ejemplo numérico

Ruta Obregón → Cócorit, A = Terminal Obregón, B = Plaza Cócorit.

**IDA (A→B):**
- Zona 1 "Centro Obregón" radio 300 m → $15
- Zona 2 "Esperanza" radio 250 m → $25
- Zona 3 "Cócorit" radio 400 m → $35

**VUELTA (B→A):**
- Zona 1 "Salida Cócorit" radio 350 m → $35 (centro distinto, está 200 m al sur)
- Zona 2 "Esperanza retorno" radio 250 m → $25 (parada de regreso queda en otra esquina)
- Zona 3 "Llegada Obregón" radio 300 m → $15

A las 10:00 el camión sale de A → el sistema sabe que va en sentido IDA → solo evalúa las 3 geocercas verdes. A las 11:30 cruza B y arranca el viaje de vuelta → ahora solo evalúa las 3 geocercas naranjas.

## Lo que cambia para el concesionario (UI)

En el editor de trazado de la unidad/ruta, debajo del mapa de "Puntos A y B" aparece una nueva sección **"Geocercas de cobro por sentido"** con:

- **Pestañas:** `🟢 IDA (A→B)` | `🟠 VUELTA (B→A)`
- Botón **"+ Agregar zona"**: toca el mapa y cae un marcador con su círculo.
- Cada zona tiene tarjeta con: nombre, radio (slider 50–800 m), precio MXN, botón eliminar.
- El círculo se puede **arrastrar** para reposicionar.
- Los círculos de IDA salen verdes, los de VUELTA naranjas, los de A/B se mantienen como ya están (azul/morado). Todo se ve sobre el mismo trazado azul de la ruta.
- Botón **"Guardar geocercas"** al fondo.

Mismo diálogo, una pestaña arriba: **[Puntos A/B] [Geocercas de cobro]** para no abrumar.

## Lo que cambia para el chofer

Nada visible. El chofer sigue sin tocar nada. El backend ya sabe qué sentido lleva el viaje abierto (origen/destino A o B) y solo evalúa las geocercas de ese sentido.

## Cambios técnicos

### Base de datos (1 migración)

Nueva tabla `unidad_geocercas_cobro`:
- `unidad_id` (fk a unidades_empresa)
- `sentido` text CHECK in ('ida','vuelta')
- `orden` int (para ordenar por secuencia del recorrido)
- `nombre` text
- `lat`, `lng` numeric
- `radio_m` int (50–800)
- `precio_mxn` numeric
- `created_at`, `updated_at`

GRANTs para `authenticated` y `service_role`. RLS: solo el dueño de la unidad (vía `is_proveedor_owner`) puede leer/escribir; service_role full.

RPC `rpc_unidad_set_geocercas_cobro(_unidad_id, _sentido, _zonas jsonb)` que reemplaza todas las zonas de ese sentido en una sola transacción.

### Edge function `trip-geofence-tick` (extender)

Cuando hay viaje abierto, además del check de cerrar al cruzar A/B:
1. Lee `unidad_geocercas_cobro` del sentido del viaje (`origen → destino` → si origen='A' es ida, si origen='B' es vuelta).
2. Para cada zona calcula Haversine; si la posición entró por primera vez en esa zona durante este viaje, registra un evento de cobro (`viajes_realizados.tarifas_aplicadas` jsonb append, o tabla aparte si conviene).
3. Idempotente: no duplica si el GPS rebota dentro del mismo círculo del mismo viaje.

### Frontend

- `src/components/UnidadGeocercasCobroDialog.tsx` (nuevo): mapa + pestañas ida/vuelta + lista editable de zonas.
- `src/components/UnidadPuntosABDialog.tsx`: agregar pestaña arriba con tabs `Puntos A/B` y `Geocercas de cobro` (o botón aparte en la tarjeta de la unidad). Se mantiene 100% compatible con lo existente.
- `src/pages/PanelConcesionario.tsx`: nuevo botón **"💲 Geocercas de cobro"** en la tarjeta de unidad, junto a "Puntos A/B".

## Lo que NO cambia

- Puntos A y B y su radio único siguen funcionando igual (cierre/apertura de viajes).
- Trazado de la ruta (`route_geojson`) no se toca.
- Chofer no ve nada nuevo.
- Conteo de pasajeros del ESP32 sigue igual.

¿Apruebas para implementar?
