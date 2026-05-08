## Reportes Ciudadanos en el mapa

Nueva pestaña **"Reportes ciudadanos"** donde cualquier usuario autenticado coloca un pin sobre incidentes urbanos, y el admin (consecutive_number = 1) marca tramos de calles cerradas con líneas rojas.

### Funcionalidad para usuarios

- Botón flotante **"Reportar"** en el mapa de la ciudad.
- 6 categorías con icono y color propio:
  1. 🕳️ Bache
  2. 💧 Fuga de agua potable
  3. 🚽 Fuga de drenaje
  4. 💡 Alumbrado público
  5. 🗑️ Basura / escombro
  6. 🚦 Semáforo dañado
- Al tocar "Reportar": el mapa muestra una mira central, el usuario fija la ubicación, elige categoría y opcionalmente escribe una nota corta (máx. 200 caracteres).
- El pin se guarda con: fecha de reporte y los **últimos 4 dígitos del teléfono** del reportante (visibles públicamente como `••••1234`). El user_id queda guardado pero **nunca se expone**.
- Tap en un pin: muestra categoría, fecha, dígitos, nota, y dos botones:
  - **"Sigue ahí"** (+1 confirmación)
  - **"Ya se resolvió"** (+1 voto de resolución)
- Cuando "ya se resolvió" alcanza **3 votos**, el pin se oculta automáticamente.
- Un usuario solo puede votar una vez por reporte.

### Funcionalidad para administrador (consecutive_number = 1)

- Modo **"Tramo cerrado"**: toca varios puntos en el mapa para trazar una polilínea libre, ingresa nombre/motivo y fecha estimada de reapertura.
- Los tramos se dibujan en **rojo grueso** sobre el mapa para todos los usuarios.
- Admin puede:
  - Editar/eliminar cualquier reporte ciudadano o tramo.
  - Marcar manualmente reportes como resueltos.
  - Ver lista con filtros por categoría/fecha.

### Visibilidad

- Pines y tramos visibles para todos los usuarios autenticados.
- Reportante anónimo (solo últimos 4 dígitos del teléfono).
- Admin ve todo + datos de moderación.

---

### Detalles técnicos

**Tablas nuevas (Supabase)**

- `citizen_reports`
  - `category` (enum: bache, fuga_agua, fuga_drenaje, alumbrado, basura, semaforo)
  - `lat`, `lng`, `note`, `phone_last4`, `user_id`, `status` (active/resolved/hidden)
  - `confirm_count`, `resolve_count`
- `citizen_report_votes` — `report_id`, `user_id`, `vote_type` (confirm/resolve), unique(report_id, user_id)
- `road_closures` — `name`, `reason`, `polyline` (jsonb array de [lat,lng]), `reopen_estimated_at`, `created_by`, `is_active`

**Vista pública** `citizen_reports_public` con `security_invoker=on` que excluye `user_id` (solo expone `phone_last4`). RLS en la tabla base con `USING (false)` para SELECT directo, garantizando privacidad del teléfono completo y user_id.

**RLS**
- `citizen_reports`: INSERT autenticados (user_id = auth.uid()); UPDATE/DELETE solo `is_admin()` o autor; SELECT denegado (vía vista).
- `citizen_report_votes`: INSERT autenticado, único por usuario.
- `road_closures`: SELECT autenticados; INSERT/UPDATE/DELETE solo `is_admin()`.

**Trigger**: al insertar voto `resolve`, incrementar contador y si llega a 3 → `status = 'hidden'`.

**Frontend**
- Nueva ruta `/reportes-ciudadanos` enlazada desde el mapa principal y el navbar.
- Componente `CitizenReportsLayer` que se monta en `RealtimeMap` para pintar pines (por categoría) y polilíneas rojas.
- Componente `ReportPinModal` (categoría + nota + confirmar ubicación con mira central, similar a `RouteEndpointsPicker`).
- Componente `AdminRoadClosureEditor` con modo polilínea libre (clicks consecutivos, doble-click para cerrar).
- Realtime: suscripción a ambas tablas para sync en vivo.

**Privacidad**: `phone_last4` se calcula en el cliente al insertar (`telefono.slice(-4)`) y se valida server-side por trigger antes del INSERT.

### Fuera de alcance (versión 1)

- Fotos adjuntas al reporte (se puede agregar después con bucket `citizen-reports`).
- Notificaciones push a vecinos cercanos.
- Dashboard de estadísticas para admin (gráficas, exportación CSV).
- Integración con dependencias municipales.

¿Lo apruebo y comenzamos?