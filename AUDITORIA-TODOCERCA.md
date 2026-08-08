# Auditoría técnica TodoCerca.mx

_Generado: 2026-08-08. Fuente: código del repositorio, esquema Supabase (`kijwxiumskwztbjahuhv`), cron jobs y secretos configurados. Honesto y sin adornos: lo que no existe, se marca como **NO EXISTE**._

---

## 1. Inventario de módulos

| Módulo | Estado | Rutas / código |
|---|---|---|
| Transporte (urbano, foráneo, privado, personal-maquiladora) | **Producción** | `/mapa`, `/mis-rutas`, `/panel-concesionario/*`, `/flota-monitoreo`, `/panel-maquiladora` |
| QaRd (billetera + tarjeta 16 dígitos + sub-QR) | **Producción (pagos reales vía Stripe)** | `/qard`, `/qard/cobrar`, `/qard/servicios` |
| Boletos QR (sistema anterior, $9) | **Legacy / reemplazado** por QaRd; tablas vaciadas | `/wallet/qr-boletos*` |
| Geolocalización y geocercas | **Producción** | `unidad_geocercas_cobro`, `ruta_geocercas_cobro`, `gps_geofences` |
| Conteo de pasajeros (ESP32) | **Testing** (hardware piloto) | `esp32-conteo-pasajeros`, `conteo_pasajeros_eventos` |
| Rastreo GPS (Flespi/IMEI) | **Producción** | `/tracking-gps`, `/gps-reports`, `flespi-webhook` |
| Reportes y analytics | **Producción** | `ReporteViajes.tsx`, `ConcesionarioReportes.tsx`, `user-registry-report` |
| Mensajería interna + WhatsApp | **Producción** | `/mensajes`, `send-whatsapp-*`, `send-internal-bulk` |
| Marketplace / productos / pedidos | **Producción pero oculto** (Protocolo 1: foco movilidad) | `/search`, `/mis-productos`, `/gestion-pedidos` |
| Taxi | **Oculto** (Protocolo 2), código vivo | `TaxiLiveMap`, `taxi_requests` |
| Domótica, Reportes ciudadanos, TodoCerca TV, Votaciones, SOS, Donar/Extraviados | **Ocultos en UI**, código y tablas activos | `/domotica`, `/reportes-ciudadanos`, `/tv`, `/votaciones`, `/sos/:token` |

### Funcionalidades planeadas y **NO implementadas**
- **STP / CLABE virtual real**: no hay integración con STP. Los retiros SPEI y OXXO en `qard-retirar` son **simulados** (registran movimiento, no mueven dinero real). El pay-out real solo existe vía **Stripe Connect** para concesionarios.
- **Fintoc**: documentado como plan, **no integrado**.
- **Dispersión corporativa empresa→empleados con saldo QaRd**: **NO EXISTE**. Lo que hay es contratos de transporte de personal con cobro por persona (`contratos_transporte`), no dispersión de saldo.
- **KYC/PLD, validación CURP/RFC**: **NO EXISTE** validación automatizada. `rfc` es campo libre en `empresas_transporte`.
- Talones PDF fase 2, control parental por comercio (fase 3), liquidación diaria QaRd a CLABE del comercio: pendientes.

---

## 2. Arquitectura de transporte

### 2.1 Rutas
- **`productos`** es la tabla de rutas (una ruta = un producto del proveedor/concesionario):
  `route_type` (`urbana|foranea|privada|taxi`), `is_private`, `route_geojson` (jsonb con el trazado), `route_trace_filename`, `route_origin_lat/lng`, `route_destination_lat/lng`, `route_geofence_radius_m`, `route_group`, `ruta_maestra_id`, `invite_token`, `precio`.
- **`rutas_foraneas_maestras`**: catálogo compartido aprobado por admin; se propaga a `productos` vinculados (`link_producto_to_ruta_maestra`, `tg_propagate_maestra_to_productos`).
- **`route_paradas`** (paradas ordenadas) y **`route_tarifas`** / **`ruta_tarifas_tramo`** (tarifa por tramo entre paradas).
- **`unidad_viaje_waypoints`**: puntos A→B→C ordenados por unidad para viajes multi-tramo.
- **`rutas_catalogo`**: catálogo local para elegir ruta al registrarse.
- **Mapa**: **Leaflet + react-leaflet** (no Google Maps, no Mapbox). Búsqueda de direcciones con **Nominatim (OSM)**; ruteo por calles con **OSRM** público. Import de trazados KML/KMZ/GPX/GeoJSON con `@tmcw/togeojson` + `jszip` (`src/lib/routeTraceParser.ts`).

### 2.2 Concesionarios y unidades
- **`proveedores`**: el concesionario (ligado a `profiles.id`), con suscripción.
- **`unidades_empresa`** (35 columnas): placas, número económico, tipo, capacidad, ruta asignada, chofer activo, estado de suscripción ($400 MXN/unidad).
- **`choferes_empresa`**: chofer con `invite_token`, `telefono`, `transport_type`; se invita por WhatsApp o inbox interno.
- **`asignaciones_chofer`**: `producto_id + chofer_id + unidad_id + fecha` → **una asignación por chofer por día** (política estricta).
- **`contratos_transporte`** + **`empresas_transporte`** + **`empleados_empresa`**: transporte de personal (maquiladora/shelter), con `turnos` jsonb y `modelo_cobro`.
- Validación documental de concesionarios: existe (`verificaciones_concesionario`, `documentos_concesionario`, `audit_log_verificacion`) pero **retirada del flujo activo**; solo aplicaría a taxis (ocultos).

### 2.3 Geocercas
- **`unidad_geocercas_cobro`** y **`ruta_geocercas_cobro`**: centro lat/lng + radio en metros + precio del tramo.
- **`gps_geofences`** / `gps_tracker_geofences`: geocercas de rastreo con alertas (`gps_alerts`).
- Cálculo: **Haversine en SQL/JS**, no PostGIS en producción (el `database-schema.sql` con PostGIS es legado, no refleja la BD actual).
- Disparo: al escanear un QR (`rpc_qard_scan_foraneo`, `rpc_cobro_qr_scan`) y por tick periódico `trip-geofence-tick` (viajes automáticos entrada/salida origen-destino).

### 2.4 Conteo de pasajeros
- Dos fuentes: **escaneo QR** (cada abordaje/descenso queda en `cobros_qr_tramo` y `qard_viajes_pasajero`) y **sensor ESP32** de puertas (`conteo_pasajeros_eventos`: `evento` subida/bajada, `puerta`, `esp32_mac`, lat/lng) con `conteo_pasajeros_alertas`.
- **Capacidad**: `unidades_empresa` tiene capacidad, pero **no hay bloqueo por exceso**; solo alertas/heatmap.
- Ocupación en tiempo real: sí, vía Supabase Realtime (badge de pasajeros a bordo en el perfil del chofer y en `ReporteViajes`).

### 2.5 Tarjeta QaRd
- Número de **16 dígitos**: `PP EE MMM UUUUUUU SS` (país por lada, estado/municipio alfabético, consecutivo por municipio, sufijo sub-QR). Guardado en `profiles.qard_number`; generado por trigger `trg_qard_on_profile_insert` + `qard_ensure_number`.
- **QR estático** (el número sirve impreso y en pantalla) + **CVV de 3 dígitos estático** para compras y **CVV de 4 dígitos dinámico** que **rota tras cada transferencia entrante** (`qard_sub_qr_rotar_cvv`).
- El QR **no lleva encriptación**: contiene el número QaRd. La seguridad la da el CVV dinámico + validación de saldo/límites en servidor.
- Tarjeta física: **sí**, impresión PDF 4 por hoja (`src/lib/qardPrint.ts`), frente idéntico a la app y reverso con QR invertido para doblar. Vigencia fija 12/99.

---

## 3. Esquema de base de datos (tablas críticas)

> 108 tablas en `public`. Aquí las críticas; el resto está listado en el inventario del proyecto.

```
TABLE: profiles
- id uuid (PK) · user_id uuid (FK auth.users) · consecutive_number int (admin maestro = 1)
- nombre, apodo, telefono/phone, email, recovery_email, codigo_postal/postal_code
- role user_role · user_type user_type · provider_type provider_type · estado user_status
- verified, phone_verified, phone_verification_code/expires_at, verification_code
- contact_token uuid, route_name, tarifa_km
- active_route_producto_id, active_chofer_id, active_unidad_id, active_transport_type
- qard_number text, qard_nivel2_id uuid (FK subdivisiones_nivel2)
RELATIONS: has_one qard_wallets, has_many qard_sub_qr, has_many user_roles, has_one proveedores

TABLE: user_roles          -- roles SEPARADOS (anti escalada de privilegios)
- id uuid (PK) · user_id uuid (FK) · role app_role(admin|moderator|user) · created_at
  Se consulta con SECURITY DEFINER public.has_role(_user_id, _role)

TABLE: qard_wallets
- id uuid (PK) · user_id uuid (FK) · saldo_mxn numeric CHECK (>= -50)
- created_at, updated_at
RELATIONS: has_many qard_sub_qr, has_many qard_movimientos

TABLE: qard_sub_qr
- id (PK) · wallet_id (FK) · titular_user_id · sub_index (00 titular, 01-99 familiares)
- alias, estado, saldo_mxn, limite_por_transaccion, horario_inicio, horario_fin
- cvv (3 dígitos estático), cvv4 (dinámico, rota), qard_number

TABLE: qard_movimientos
- id (PK) · wallet_id (FK) · titular_user_id · sub_qr_id (FK)
- tipo (recarga|cobro_comercio|transferencia|retiro|pago_servicio|devolucion|ajuste)
- monto_mxn, saldo_despues, comercio_user_id, comision_mxn, neto_comercio_mxn
- referencia, metadata jsonb, created_at

TABLE: qard_viajes_pasajero   -- abordajes pagados con QaRd
- viaje_id, unidad_id, producto_id, pasajero_user_id (anónimo: número secuencial)
- subida_lat/lng/at, bajada_lat/lng/at, precio, estado (standby|cobrado)
- retirado_at, retiro_referencia   -- retiro granular fila por fila

TABLE: cobros_qr_tramo
- viaje_id, unidad_id, producto_id, qr_token, pasajero_user_id, sentido
- parada_subida_id, parada_bajada_id, subida_*, bajada_*
- precio_apartado, precio_real, devuelto, estado, fuente, retirado_at, retiro_referencia

TABLE: productos              -- ruta de transporte
(ver §2.1 para campos)
RELATIONS: belongs_to proveedores, belongs_to rutas_foraneas_maestras, has_many route_paradas,
           has_many asignaciones_chofer, has_many unidad_geocercas_cobro

TABLE: unidades_empresa (35 col) · choferes_empresa · asignaciones_chofer   (ver §2.2)
TABLE: unidad_geocercas_cobro · ruta_geocercas_cobro · unidad_viaje_waypoints  (ver §2.3)
TABLE: viajes_realizados (33 col) — viaje cerrado con totales, pasajeros, importes
TABLE: conteo_pasajeros_eventos / _alertas — sensor ESP32
TABLE: empresas_transporte · empleados_empresa · contratos_transporte · validaciones_transporte_personal
TABLE: cuentas_conectadas (Stripe Connect: stripe_account_id, estado_stripe, info_bancaria/CLABE,
       pagos_habilitados, transferencias_habilitadas, frecuencia_liquidacion)
TABLE: liquidaciones_diarias (fecha, total_boletos, valor_facial, comision_todocerca,
       fee_stripe_connect, neto, stripe_transfer_id, estado, desglose normal/estudiante/3ra edad)
TABLE: subscriptions · audit_log_verificacion · intentos_fraude · logs_validacion_qr
TABLE: active_sessions · trusted_devices · device_verification_codes · phone_verification_codes
```

**Índices y RLS**: todas las tablas tienen RLS activo (1–8 políticas cada una) y `GRANT` explícito. La recursión de RLS se evita con funciones `SECURITY DEFINER` (`has_role`, `is_admin`, `is_proveedor_owner`, `is_chofer_empresa_owner`, `is_parte_contrato`, `is_tracking_group_member`, etc.).

---

## 4. Protocolos ocultos y lógica de negocio

### 4.1 Comisiones y topes (valores reales en código)
| Regla | Valor | Dónde |
|---|---|---|
| Comisión cobro en comercio | **6%** (94% al comercio) | `qard-cobrar-comercio/index.ts:12` |
| Saldo mínimo permitido (sobregiro) | **−$50 MXN** (CHECK en BD) | `qard_wallets_saldo_mxn_check` |
| Recarga mínima | **$200 MXN** | `qard-recargar/index.ts:11` |
| Transferencias P2P entre QaRd | **0% (gratis)** | `qard_transfer_p2p` |
| Retiro concesionario: QaRd 0%, OXXO 0%, **SPEI 3%** | `COMISION_POR_METODO` | `retirar-viajes-concesionario:14` |
| Liquidación boletos: fee Stripe **3.6% + $3** prorrateado + fee plataforma | | `process-daily-settlements:12` |
| Suscripción por unidad | **$400 MXN** | `create-checkout` |
| Límite por transacción de sub-QR | configurable (`limite_por_transaccion`) | validado en servidor |
| Horario de uso de sub-QR | `horario_inicio/fin` | validado en servidor |

### 4.2 Cron jobs (pg_cron, activos)
| Job | Horario (UTC) | Acción |
|---|---|---|
| `close-overnight-trips-daily` | `5 7 * * *` | cierra viajes que quedaron abiertos |
| `expire-transferred-tickets` | `0 * * * *` | revierte transferencias de boleto no aceptadas (24 h) |
| `process-daily-settlements` | `0 6 * * *` | liquida a concesionarios vía Stripe Connect |
| `qard-purge-movimientos` | `15 9 * * *` | borra movimientos QaRd de más de 2 meses |

Además: limpieza de códigos expirados (`cleanup_expired_verification_codes`, `cleanup_expired_device_codes`, `cleanup_expired_recovery_codes`) y `tg_auto_cerrar_standbys` (cierra abordajes en standby).

**Zona horaria**: todo proceso diario usa **Hermosillo UTC-7** (`getHermosilloToday`), no `Date` nativo.

### 4.3 Webhooks
- **Entrantes**: `stripe-webhook-tickets` (`checkout.session.completed` → acredita recarga QaRd / boletos), `stripe-webhook-connect` (`account.updated` → estado de onboarding y CLABE), `flespi-webhook` (posiciones GPS por IMEI), `esp32-conteo-pasajeros` (sensor de puertas).
- Verificación de firma con `constructEventAsync` (obligatorio en Deno) y secretos `STRIPE_WEBHOOK_SECRET_TICKETS` / `STRIPE_WEBHOOK_SECRET_CONNECT`.
- **Salientes**: WhatsApp Cloud API (plantillas UTILITY) y SMS Twilio.

### 4.4 Seguridad
- **Sesión única por usuario**: `active_sessions` + `SingleSessionGate` — la cuenta solo abre en un dispositivo a la vez.
- **Verificación de dispositivo**: SMS al teléfono del perfil para autorizar móviles/tablets nuevos (`trusted_devices`, `device_verification_codes`, huella en `src/lib/deviceFingerprint.ts`). Escritorio exento.
- **CVV dinámico de 4 dígitos** validado en servidor y rotado tras cada transferencia; CVV de 3 dígitos para cobro en comercio validado contra BD (no se acepta otro).
- **Antifraude**: `intentos_fraude` (27 columnas, con color de severidad), `logs_validacion_qr`, cooldown de 3 min para QR duplicado, alertas solo con chime.
- **JWT**: Supabase Auth; varias edge functions con `verify_jwt = false` (webhooks e invitaciones públicas) — el resto valida el bearer manualmente.
- **Rate limiting**: **NO EXISTE** rate limiting propio; solo el de la plataforma Supabase. Riesgo conocido.
- **Encriptación en reposo de campos sensibles**: **NO EXISTE** más allá del cifrado nativo de Postgres/Supabase. Los CVV están en claro en la BD.

### 4.5 Secretos configurados
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_TICKETS`, `STRIPE_WEBHOOK_SECRET_CONNECT`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `FLESPI_TOKEN`, `LOVABLE_API_KEY`, `SUPABASE_*`. Públicas en código: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

### 4.6 Manejo de errores
- Fallos de pago: Stripe reintenta el webhook; los movimientos se registran solo tras confirmación.
- Transacciones críticas (cobro, transferencia, pago de servicio) están en **RPC SQL atómicas** (`qard_transfer_p2p`, `qard_pagar_servicio` con idempotencia, `rpc_qard_scan_foraneo`), con rollback natural de Postgres.
- `qard_revertir_pago_servicio` para devoluciones.
- Cargas de dashboard con `Promise.allSettled` + refs in-flight para evitar carreras.

---

## 5. Flujos de usuario (tal como están implementados)

### A. Registro y activación
1. `/auth` → teléfono con **`<PhoneInput>`** (bandera + prefijo, obligatorio), contraseña, nombre, país/estado/municipio (`GeographySelector`).
2. Supabase Auth crea el usuario → trigger `handle_new_user` crea `public.profiles` (y lo recrea si falta).
3. `trg_qard_on_profile_insert` → `qard_ensure_number` asigna el **QaRd de 16 dígitos**; `qard_ensure_wallet` crea la billetera (saldo 0) y el sub-QR **00** con sus CVV.
4. `send-verification-sms` / `verify-phone-code` (Twilio) marcan `phone_verified`.
5. `send_system_welcome_message` manda el mensaje de bienvenida al inbox interno.
6. Dispositivos móviles nuevos pasan por `DeviceVerificationGate` (SMS) y `SingleSessionGate`.
**Tablas tocadas**: `auth.users`, `profiles`, `qard_wallets`, `qard_sub_qr`, `qard_secuencia_municipio`, `phone_verification_codes`, `messages`.

### B. Recarga (pay-in)
1. `/qard` → botón Recargar → monto ≥ $200.
2. `qard-recargar` crea **Stripe Checkout** (MXN, sin comisión al usuario) con `metadata.type = qard_recarga`.
3. Pago → **`stripe-webhook-tickets`** rama `qard_recarga` acredita `qard_wallets.saldo_mxn` y escribe `qard_movimientos` (tipo `recarga`, con `saldo_despues`).
4. Regreso a `/qard?recarga=success`; el estado de cuenta muestra el saldo corrido.
- **OXXO/CLABE virtual: NO EXISTE como entrada.** Solo tarjeta vía Stripe Checkout.

### C. Pago de pasaje con QR
1. El chofer abre `/wallet/qr-boletos/validar` o el panel de viaje → pestaña **Lector QR** (pantalla completa, `html5-qrcode`).
2. Escanea el QaRd del pasajero → `rpc_qard_scan_foraneo` / `rpc_cobro_qr_scan`.
3. Validaciones: sub-QR activo, límite por transacción, horario permitido, tope de saldo −$50, geocerca de la unidad/ruta (Haversine), cooldown antiduplicado, `qr_scope` público vs privado (no se cruzan).
4. **Modelo standby**: al subir queda `estado = standby` con `precio_apartado`; al bajar y volver a escanear se calcula el tramo real (geocercas/tarifa) y se cobra `precio_real`, devolviendo la diferencia.
5. Descuento de saldo + `qard_movimientos` (tipo `cobro_comercio`, comisión 6%, neto 94% al concesionario).
6. Registro de conteo: `qard_viajes_pasajero` / `cobros_qr_tramo` (pasajero con número secuencial anónimo) + badge en tiempo real.
7. Notificación: mensaje al titular en `messages` en cada uso (útil para sub-QR familiares); en el lado chofer, solo **chime** (sin voz).
- Tarifa estudiante/3ra edad: existe en el sistema de boletos (`verificaciones_descuento`, desglose en liquidaciones), **no en el cobro QaRd por geocerca**.

### D. Retiro (pay-out)
1. Concesionario: `ReporteViajes` muestra **bruto por cobrar** calculado fila por fila (solo filas con `retirado_at IS NULL`).
2. `retirar-viajes-concesionario` mapea `auth.uid()` → `proveedores.id`, valida propiedad, calcula comisión por método (QaRd 0%, OXXO 0%, SPEI 3%) y marca `retirado_at` + `retiro_referencia` por fila (retiro granular, no bloquea el viaje en curso).
3. Usuario/comercio: `qard-retirar` (OXXO / SPEI a la cuenta registrada / transferencia a otra QaRd). **OXXO y SPEI están simulados**: mueven saldo y registran movimiento, pero no ejecutan dispersión bancaria real.
4. El pay-out bancario **real** existe solo por **Stripe Connect** en `process-daily-settlements` (transfer diaria/semanal/mensual a la CLABE, con `stripe_transfer_id` en `liquidaciones_diarias`).

### E. Dispersión corporativa empresa → empleados
**NO EXISTE.** Lo implementado es distinto: la empresa (`empresas_transporte`) firma un `contrato_transporte` con tarifa por persona; los empleados (`empleados_empresa`) reciben QR revolvente de 7 días por inbox/WhatsApp (`send-employee-invite`, importación masiva CSV: Nombre, Nómina, Depto, Turno, Teléfono) y cada validación se registra en `validaciones_transporte_personal` con deduplicación de 4 h. La empresa paga por corte, no dispersa saldo.

### F. Alta de concesionario / ruta
1. Registro como proveedor → `proveedores` + suscripción Stripe ($400/unidad).
2. `/panel-concesionario` → hub por tipo (público / privado / foráneo).
3. Unidad: `add-private-vehicle` o alta en `unidades_empresa` (placas, económico, capacidad).
4. Ruta: alta en `productos` con `route_type`; trazado por **KML/KMZ/GPX/GeoJSON** (`save-route-trace`) o **editor manual** (`RouteTraceEditor`: primero waypoints A-B-C ordenados, luego vértices para pegarse a las calles). Las foráneas pueden vincularse al catálogo maestro (`rutas_foraneas_maestras`) con aprobación de admin.
5. Geocercas de cobro por unidad/ruta con centro, radio y precio (`rpc_unidad_set_geocercas_cobro`, `rpc_producto_set_geocercas_cobro`).
6. Choferes: invitación por token (WhatsApp o inbox), asignación diaria única.

---

## 6. Reportes y analytics

**Admin**: `UserRegistryReport` (edge function `user-registry-report`), `AdminRutasMaestras`, `AdminSolicitudesCambioRutas`, `AdminVerificaciones`, `AdminDescuentos`. Rol maestro = `consecutive_number = 1`.

**Concesionario**: `ReporteViajes` (KPI por viaje: pasajeros **en stand**, cobrados, importes, bruto por cobrar con color, desglose por unidad/chofer/ruta, deduplicado), `ConcesionarioReportes`, `FlotaMonitoreo` (mapa en vivo), `ConteoHeatmap`.

**Usuario**: estado de cuenta tipo banco en `/qard` — saldo inicial, cada movimiento con **saldo corrido**, agrupado por mes, filtros de periodo (7/15/30/60 días), tanto para cuenta eje como para cada sub-QR (icono de historial).

**Empresa**: panel maquiladora con validaciones por turno, contrato y cortes.

**Tiempo real**: Supabase Realtime para asignaciones, semáforo de estado, posiciones de unidades y conteo de pasajeros a bordo.

**Exportación**: **CSV con BOM UTF-8** (`src/lib/csvExport.ts`) para validaciones diarias, movimientos QaRd (necesario porque se purgan a los 2 meses), reporte de viajes con lat/lng para hacer mapas de calor propios, y padrón de usuarios. **PDF**: tarjetas QaRd (`jspdf`) y folleto "Cómo funciona". Excel nativo: **NO EXISTE**.

**Audit log**: `audit_log_verificacion` (admin_id, accion, detalles jsonb, ip, user_agent), `logs_validacion_qr`, `intentos_fraude`, `qard_movimientos.metadata`. **No es inmutable a nivel BD** (no hay append-only enforcement); depende de las RLS.

**Alertas**: `gps_alerts` (geocerca, velocidad, batería), `conteo_pasajeros_alertas`, alertas de fraude por QR duplicado, notificaciones push vía Service Worker. **Alerta por saldo bajo: NO EXISTE.**

---

## 7. Integraciones externas

| Área | Proveedor real | Notas |
|---|---|---|
| Pagos entrada | **Stripe Checkout** | recargas QaRd, boletos, suscripciones |
| Pagos salida | **Stripe Connect (Express, MX/CLABE)** | `create-connect-account`, liquidaciones diarias/semanales/mensuales |
| **STP** | **NO INTEGRADO** | no hay CLABE virtual ni SPEI real |
| **Fintoc** | **NO INTEGRADO** | solo documentado |
| Mapas | **Leaflet + OpenStreetMap** | tiles OSM |
| Geocodificación / búsqueda | **Nominatim (OSM)** | gratuito, sin API key |
| Ruteo por calles | **OSRM público** | usado en trazado y taxi |
| Distancias / geocercas | **Haversine** propio (SQL + JS) | sin PostGIS |
| SMS | **Twilio** | verificación de teléfono y de dispositivo |
| WhatsApp | **Meta Cloud API** (plantillas UTILITY) | envío masivo con delay 0.5 s; en México se omite el "1" |
| Email | **NO EXISTE** proveedor propio | solo los correos de Supabase Auth |
| Push | **Service Worker propio** (`public/sw.js`) | sin Firebase/OneSignal |
| GPS trackers | **Flespi.com** por IMEI | `flespi-webhook`, `FLESPI_TOKEN` |
| Hardware conteo | **ESP32** propio | endpoint dedicado |
| Almacenamiento | **Supabase Storage** | fotos de productos, documentos |
| Analytics | **Google Analytics** (`src/lib/analytics.ts`) | |
| App nativa | **Capacitor** (Android, `com.todocerca.app`, con acceso a producción en Google Play) | background geolocation |
| Validación CURP/RFC, facturación | **NO EXISTE** | |

---

## 8. Riesgos y deuda técnica (lo incómodo)

1. **Los retiros OXXO/SPEI del usuario son simulados** — si alguien los usa en producción creyendo que sale dinero, hay un descuadre contable.
2. **CVV almacenados en claro** en `qard_sub_qr`.
3. **Sin rate limiting propio** en edge functions críticas (cobro, transferencia).
4. **Audit log no inmutable**.
5. **`src/lib/database-schema.sql` y `src/types/database.ts` están obsoletos** (describen PostGIS y tablas `user_profiles`/`provider_profiles` que ya no existen). Confunden a cualquiera que audite el repo.
6. **Purga de movimientos a 2 meses** sin respaldo automático: si el usuario no exporta el CSV, la información se pierde.
7. **Módulos ocultos pero vivos** (taxi, votaciones, SOS, TV, domótica): siguen con tablas, RLS y código ejecutable; superficie de ataque y mantenimiento sin uso.
8. **Sin KYC/PLD** — con montos crecientes en la billetera esto es un tema regulatorio, no técnico.
