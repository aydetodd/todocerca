## Fase 1 — QaRd (Quiero Administrar mis Recursos de dinero)

Reemplaza por completo el sistema anterior de **boletos QR de $9** y **Wallet Familiar**. Todo lo actual eran pruebas, así que se **borran datos** de esas tablas y arrancamos limpio.

---

### 1. Número universal de 16 dígitos

Formato: `PP EE MMM UUUUUUU SS`
- **PP** = país (código telefónico, ej. 52 México)
- **EE** = estado (2 dígitos, orden alfabético dentro del país)
- **MMM** = municipio (3 dígitos, orden alfabético dentro del estado)
- **UUUUUUU** = ID del usuario dentro del municipio (7 dígitos, secuencial)
- **SS** = sub-QR familiar (00 = titular, 01–99 = familiares)

**Asignación automática por lada del teléfono:**
- Se lee el prefijo del `telefono` en `profiles`.
- Se busca `pais` en la tabla `paises` por `codigo_telefonico`.
- Si el perfil ya tiene `estado`/`municipio` → se codifican con catálogo interno.
- Si no → se guarda `EE=00 MMM=000` y el usuario podrá completar después (el número se recalcula cuando complete su perfil).
- El `UUUUUUU` se asigna con secuencia por municipio (secuencia SQL).
- Se ejecuta un backfill para **todos los usuarios actuales** y un trigger `AFTER INSERT ON profiles` para los nuevos.

El **número consecutivo antiguo (`consecutive_number`) se conserva** para no romper la lógica de admin (`consecutive_number = 1`), pero se añade la columna nueva `qard_number` (text, 16 dígitos, único).

---

### 2. Billetera QaRd

Tabla nueva `qard_wallets`:
- `titular_user_id` (dueño)
- `saldo_mxn` (permite hasta **−50**)
- `estado` (activa / bloqueada)
- `telefono_lock` (para bloquear "una cuenta por teléfono de por vida" si queda en −50 sin pagar)

Tabla nueva `qard_sub_qr`:
- `titular_user_id`, `sub_index` (00–99), `qard_number` (16 dígitos completos)
- `alias`, `limite_por_transaccion`, `horario_inicio`, `horario_fin`, `estado`
- El **titular siempre tiene el 00 automático** al crear su wallet.

Tabla nueva `qard_movimientos`:
- `wallet_id`, `sub_qr_id`, `tipo` (recarga / cobro / devolución), `monto`, `saldo_despues`, `comercio_id`, `descripcion`.

**Se eliminan / vacían** (datos de prueba):
- `qr_tickets`, `movimientos_boleto`, `transacciones_boletos`, `cuentas_boletos`
- `wallets_qr`, `sub_qr_saldo`, `movimientos_wallet`

---

### 3. Recarga vía Stripe

- Edge Function `qard-recargar`: reutiliza el patrón actual, mínimo **$200 MXN**, el usuario recibe el monto exacto (sin descuentos).
- Webhook `stripe-webhook-tickets` se adapta: al recibir `checkout.session.completed` con `metadata.type = qard_recarga`, suma al `saldo_mxn` del titular.

---

### 4. Cobro del comercio (flujo COBRAR → ESCANEAR)

Pantalla nueva `/qard/cobrar` para el proveedor (comercio):
1. Input de monto en pesos.
2. Botón **ESCANEAR QR** → abre cámara → lee número de 16 dígitos.
3. Llama a Edge Function `qard-cobrar-comercio`:
   - Valida que el sub-QR exista y esté activo.
   - Valida horario y límite por transacción (si tiene).
   - Verifica saldo ≥ monto (permite dejar hasta −50, así que si saldo − monto < −50 → rechaza con "SALDO INSUFICIENTE").
   - Descuenta 100% del monto al titular.
   - Calcula 6% de comisión (queda en la plataforma) y 94% al comercio.
   - **Reutiliza `cuentas_conectadas` + `liquidaciones_diarias`** (Stripe Connect ya existente) para acumular el 94% al CLABE del comercio en la frecuencia que ya tenga configurada.
   - Registra `qard_movimientos` para ambos lados.
   - Devuelve mensaje: `COBRADO $100 · Saldo restante $340` (verde) o el mensaje de error de color correspondiente.

Notificación en tiempo real al titular vía `messages` (bandeja de sistema): "Se cobró $100 en [Comercio] con tu QR 01 (Juan). Saldo: $340".

---

### 5. UI del usuario

Nueva página `/qard`:
- Muestra el número de 16 dígitos formateado `5226 0180 0000 0100`.
- QR grande imprimible del titular.
- Saldo actual (verde si positivo, rojo si negativo).
- Botón **Recargar** (mín $200).
- Lista de sub-QR familiares con botón para crear/cancelar (control parental básico: alias + límite).
- Historial de movimientos.

Se **redirige** `/wallet/familiar` y `/wallet/qr-boletos` → `/qard` para que nadie quede colgado.

---

### Lo que NO entra en esta fase (queda para después)

- Talones PDF de 10 QR imprimibles → Fase 2.
- Reglas avanzadas de control parental (comercios permitidos, horarios complejos) → Fase 3.
- Reemplazar cobro de transporte por QaRd (hoy sigue con tarifas geocerca) → Fase 4.

---

### Detalles técnicos

- Catálogo de estados/municipios: uso el JSON existente `public/data/estados-municipios-mx.json` + tabla `paises` (código telefónico). Para otros países queda `EE=00 MMM=000` hasta que sumemos catálogo.
- Secuencia por municipio: tabla `qard_secuencia_municipio(pais, estado, municipio, next_id)` con `SELECT ... FOR UPDATE` para atomicidad.
- Función `public.qard_generar_numero(user_id)` SECURITY DEFINER.
- Trigger `handle_new_user` extendido para llamar la función.
- Todas las tablas nuevas con GRANTs correctos + RLS (titular ve lo suyo; service_role todo).

¿Apruebas este plan y arranco con la migración SQL?
