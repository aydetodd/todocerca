## Cambios QaRd — Fase 1.1

### 1. Renombrar "Boletos QR" → "QaRd saldo digital"
Solo en menú/navbar (barra de navegación, dashboard, hub). No toco textos internos de la página `/qard` ni mensajes del sistema todavía.

Archivos afectados (búsqueda `rg "Boletos QR"` limitada a navegación):
- `src/components/GlobalHeader.tsx`
- `src/components/NavigationBar.tsx`
- `src/pages/DashboardMain.tsx` / `Dashboard.tsx`
- `src/pages/Home.tsx` / `MainHome.tsx`
- Cualquier tile/atajo que diga "Boletos QR".

### 2. Cargar catálogo INEGI México (real)

Nueva tabla `mx_inegi_municipios`:
- `cve_estado` (2 dígitos, ej. `26` Sonora)
- `nombre_estado`
- `cve_municipio` (3 dígitos, ej. `030` Hermosillo)
- `nombre_municipio`
- 2,475 filas fuente: INEGI Marco Geoestadístico 2020.

Nueva tabla `mx_ladas`:
- `lada` (3 dígitos, ej. `662`)
- `cve_estado`, `cve_municipio`
- Ejemplos: `662→26/030 (Hermosillo)`, `644→26/018 (Cajeme)`, `55→09/…`, etc.
- Fuente: catálogo público IFT (~400 ladas).

Cargo ambas por CSV (`code--exec` + `psql COPY`). Los datos son públicos y libres.

### 3. Recalcular `qard_number` de todos los usuarios

Nueva función `public.qard_bucket_from_phone(telefono text)`:
1. Normaliza (quita `+52` y no-dígitos).
2. Extrae lada (3 dígitos por defecto, 2 para CDMX/Mty/Guad).
3. Busca en `mx_ladas` → devuelve `(cve_estado, cve_municipio)`.
4. Si no encuentra → `(00, 000)`.

Reemplazar `qard_ensure_number` para que:
- Use la nueva función en lugar de `qard_nivel2_id`.
- Consecutivo `UUUUUUU` = **secuencia por municipio** (usa `qard_secuencia_municipio` con clave `PP-EE-MMM`), resetea a 1 en cada municipio.
- Sub `SS` = `00` (titular).

Backfill:
```sql
-- Ordenar por consecutive_number para respetar orden histórico
UPDATE profiles SET qard_number = NULL;  -- limpia
-- Loop ordenado que asigne secuencial por bucket
```
Tu caso: `6624124381` → lada `662` → Sonora `26` / Hermosillo `030` → como eres el primero de Hermosillo → `5226 0300 0000 0100` ✓

### 4. Sincronización con `profiles.consecutive_number`

No lo toco. Sigue siendo el ID global histórico (para admin=1). El "ID Usuario" que se muestra en Mi Perfil ahora será el `qard_number` formateado; el sufijo c/p desaparece.

### 5. Cuando el usuario cambia su ubicación
Trigger `on profiles.qard_nivel2_id change` (o cambio de teléfono): recalcula `qard_number` usando la nueva lada/municipio y consume nuevo consecutivo del bucket destino. El anterior queda "hueco" (sin recuperar) — es lo estándar en bancarias.

### Fuera de este cambio (no toco)
- Página `/qard`, edge functions de cobro/recarga (siguen leyendo `qard_number` como texto).
- Nada de Stripe, sub-QR, movimientos.

### Riesgos
- Si un teléfono tiene lada rara/extranjera → cae a `00/000`. Se puede corregir manualmente después.
- Backfill borra qard_numbers actuales (todos son de prueba, sin saldo real → seguro).

¿Le doy adelante?
