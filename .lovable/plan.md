## Qué vamos a hacer

Hoy las rutas **privadas** (maquiladoras) ya tienen detección por geocercas A/B, pero cada viaje exige que el chofer presione "Confirmar llegada". Para **rutas foráneas** queremos que sea casi sin tocar la pantalla:

1. El chofer presiona **una sola vez** "Iniciar jornada":
   - Si está dentro de A → cuenta el viaje hacia B.
   - Si está dentro de B → cuenta el viaje hacia A.
   - Si está a la mitad del camino → graba sus coordenadas como inicio y el próximo punto al que llegue (A o B) será el fin de ese viaje.
2. A partir de ahí, **automático**:
   - Al **entrar** a la geocerca opuesta → cierra el viaje activo (fin GPS).
   - Al **salir** de esa misma geocerca → arranca el siguiente viaje (inverso).
   - Así todo el día (A↔B↔A…) sin tocar nada.
3. El último viaje queda **en curso** hasta que el chofer presione **"Finalizar jornada"**.
4. Si se olvida, un proceso a **las 00:00 (Hermosillo)** cierra automáticamente cualquier viaje en curso sin contarlo como nuevo (estado `cerrado_medianoche`).

Las rutas **privadas no cambian** (siguen con confirmación manual viaje por viaje, como hoy).

---

## Detalle técnico

### Backend (migración)

- En `viajes_realizados`: ya existen `inicio_manual`/`fin_manual`/`direccion`. Agregar valor permitido `cerrado_medianoche` para `estado` (es un check virtual, no constraint duro).
- Edge Function nueva **`close-overnight-trips`**:
  - Lista todos los `viajes_realizados` con `estado='en_curso'` cuyo `fecha < hoy_hermosillo`.
  - Los cierra con `fin_at = '23:59' del día de inicio`, `fin_manual = true`, `estado = 'cerrado_medianoche'`.
- `pg_cron` cada día a las **07:05 UTC** (= 00:05 Hermosillo) invoca esa función.

### Frontend

- **`DriverTripPanel`** acepta nuevo prop `autoMode?: boolean`.
  - `false` (default, privadas) → comportamiento actual.
  - `true` (foráneas):
    - Botón único grande: **"Iniciar jornada"** / **"Finalizar jornada"**.
    - Lógica `useEffect` que escucha cambios de `currentPos`:
      - Si **hay viaje activo** y entra a la geocerca destino → llama `confirmarFinGPS()` automáticamente (con cooldown anti-rebote de 60 s).
      - Si **acaba de cerrar** un viaje (registro de `lastClosedAt`) y **sale** de la geocerca → llama `insertViaje(opuesto, GPS)` automáticamente.
    - "Iniciar jornada" detecta dentro de A/B/medio y resuelve dirección con coordenadas reales.

- **`ValidarQr`**: además de privadas, si la asignación es a una ruta `foranea` con `route_origin_*` y `route_destination_*` configurados, mostrar `DriverTripPanel` en modo `autoMode`.

- **`ReporteViajes`** acepta prop `routeFilterType: 'privada' | 'foranea'` (default privada) → cambia el filtro de `productos` y mantiene aislamiento estricto entre tipos.

- **`PanelConcesionarioForaneo`** pasa `routeFilterType='foranea'` a `ReporteViajes`.

### Memoria a guardar
Actualizar `mem://transporte/viajes-automaticos-geocercas` con la regla: foránea = auto; privada = manual; cierre a medianoche por cron.

---

## Notas operativas para ti

- **Créditos**: la detección corre en el celular del chófer (no consume servidor extra). Solo cron de medianoche (~1 lectura/día). Sin gasto adicional notable.
- **Sin "cuatrapeos"**: usamos Realtime de Supabase para que el reporte del concesionario se actualice en vivo cada vez que el chofer entra/sale de geocerca.
- **Requisito**: el concesionario debe haber marcado A y B en la pestaña "Unidades / Choferes / Rutas" del panel foráneo (botón "Geocercas A/B" en la ruta). Si no, el panel del chofer le pide hacerlo antes.

¿Lo construyo así?
