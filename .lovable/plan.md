
# Rutas Foráneas Maestras (catálogo compartido)

## Idea en simple
Hoy cada concesionario foráneo dibuja su propia ruta. Vamos a crear un **catálogo único** de rutas foráneas (ej: "Cajeme – Bácum") con su trazado y sus geocercas A/B. Cuando un concesionario quiera operar una ruta foránea, **la elige de una lista**; si no existe, la **propone** y queda pendiente hasta que tú la apruebes. Así todos usan el mismo nombre, el mismo trazo y las mismas geocercas.

## Reglas que aplicamos (según lo que decidiste)
- **Edición del trazado/geocercas:** solo el **administrador (consecutive_number = 1)**. Excepción: el concesionario que la **creó originalmente** la puede editar **solo mientras esté en estado `pending`** (para corregir errores). Una vez aprobada, queda bloqueada salvo para el admin.
- **Nomenclatura:** lista cerrada. El concesionario propone nombre + trazado; el admin la revisa, puede **renombrar** ("Cajeme" → "Cajeme (Cd. Obregón)"), aprobar o rechazar. Mientras está `pending` no aparece en el desplegable de otros concesionarios.
- **Geocercas A y B:** se comparten con el trazado. Mismo origen/destino para todos los que operan esa ruta maestra. Esto da conteo de viajes consistente.

---

## Cambios técnicos

### 1. Base de datos

Nueva tabla `rutas_foraneas_maestras`:
- `id`, `nombre` (único, normalizado), `nombre_normalizado` (lowercase sin acentos, índice único)
- `route_geojson` (jsonb)
- `route_origin_lat/lng`, `route_destination_lat/lng`, `route_geofence_radius_m`
- `estado`: `pending` | `approved` | `rejected`
- `created_by_proveedor_id`, `created_by_user_id`, `approved_by`, `approved_at`, `rechazo_motivo`
- `created_at`, `updated_at`

GRANTs:
- `anon` y `authenticated`: `SELECT` solo donde `estado = 'approved'` (vía policy).
- `authenticated`: `INSERT` (queda forzado a `pending`) y `UPDATE` solo si es el creador y sigue `pending`.
- `service_role`: ALL.

RLS:
- SELECT approved → todos autenticados.
- SELECT propias pending/rejected → solo el creador y el admin.
- INSERT → cualquier proveedor concesionario foráneo autenticado; trigger fuerza `estado = 'pending'` y `created_by_*`.
- UPDATE → admin siempre; creador solo si `estado = 'pending'`.
- DELETE → solo admin.

En `productos` añadimos:
- `ruta_maestra_id uuid` (FK opcional a `rutas_foraneas_maestras`).
- Cuando se llena, el trazado y geocercas del producto **se ignoran en la UI** y se leen siempre de la maestra (fuente única de verdad).

Funciones SECURITY DEFINER:
- `list_rutas_foraneas_maestras_approved()` → devuelve lista para el desplegable.
- `propose_ruta_foranea_maestra(nombre, geojson, origen, destino, radio)` → inserta `pending`.
- `link_producto_to_maestra(producto_id, maestra_id)` → valida ownership y enlaza.
- `admin_approve_ruta_maestra(id, nombre_final?)` / `admin_reject_ruta_maestra(id, motivo)` → solo admin.

### 2. UI Concesionario Foráneo (`PrivateRouteManagement` en modo foraneo)

Al crear/editar una ruta foránea:
1. **Desplegable** con las rutas maestras **aprobadas** (buscable por nombre).
2. Botón **"Proponer ruta nueva"** → abre flujo de subir KML/GPX + marcar A y B → queda `pending`, le avisamos al admin por mensaje interno.
3. Si la ruta del producto está enlazada a una maestra `approved`: el editor de trazado y geocercas queda **bloqueado** con leyenda "Definido por administrador".
4. Si está enlazada a una maestra `pending` creada por él mismo: puede seguir editando hasta que se apruebe.
5. Indicador visual del estado: ✅ Aprobada / ⏳ Pendiente / ❌ Rechazada (con motivo).

### 3. Panel Admin (nueva sección dentro de admin existente)

"Rutas Foráneas Maestras":
- Lista con filtros por estado (pending / approved / rejected).
- Mapa preview del trazado + geocercas A/B.
- Acciones: **Aprobar** (con opción de renombrar antes), **Rechazar** (con motivo), **Editar** trazado/geocercas/nombre en cualquier momento.
- Al renombrar/editar una maestra ya aprobada, todos los productos enlazados ven el cambio automáticamente (porque leen de la maestra).

### 4. Mapa público y conteo de viajes

- `useRouteOverlay` y `ReporteViajes` foráneo leen `route_geojson` y geocercas desde la maestra cuando `producto.ruta_maestra_id` existe; si no, caen al campo del producto (compatibilidad hacia atrás).
- El conteo automático por geocercas (memoria `viajes-automaticos-geocercas`) sigue igual, solo que las coordenadas vienen de la maestra.

### 5. Realtime

Suscripción a `rutas_foraneas_maestras` para que cuando el admin apruebe o edite, los concesionarios y choferes vean el cambio sin refrescar (sigue regla `sincronizacion-global-tiempo-real`).

---

## Migración de datos existentes
Las rutas foráneas actuales (`route_type = 'foranea'` con trazado propio) **no se tocan**. Quedan funcionando con su trazado individual hasta que su concesionario decida enlazarlas a una maestra desde un botón "Vincular a ruta maestra existente".

## Lo que NO cambia
- Rutas urbanas (públicas) — siguen igual.
- Rutas privadas — siguen siendo individuales por concesionario.
- Taxis — siguen ocultos (Protocolo 2).

---

¿Avanzo con esta implementación o quieres ajustar algo antes?
