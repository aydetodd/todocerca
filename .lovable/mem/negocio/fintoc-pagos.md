---
name: Fintoc como proveedor SPEI
description: Plan de integración Fintoc (payins CLABE, payouts a concesionarios, pago de servicios) y estado actual por fases
type: feature
---

**Fintoc es el proveedor oficial de SPEI** (regulado Banxico/CNBV). Stripe **se queda** en paralelo: tarjeta = Stripe, transferencia SPEI = Fintoc. El usuario elige.

Secreto pendiente: `FINTOC_SECRET_KEY` (el usuario aún no tiene cuenta). Todo el código debe funcionar sin la llave y quedar en estado "pendiente_envio" en vez de fallar.

## Fase 3 (HECHA) — Pago de servicios
- `qard_servicios_catalogo`: catálogo de billers (slug, referencia_label, min/max longitud, min/max monto, `comision_fija_mxn` $8, `clabe_destino`). Solo admin (`is_admin()`) edita.
- `qard_pagos_servicio`: un renglón por pago, con `idempotency_key` UNIQUE (anti-duplicado), estado `pendiente_envio | enviado | pagado | reversado`, `proveedor_transfer_id`.
- `qard_pagar_servicio(...)`: cobra atómico con `FOR UPDATE`, **sin sobregiro** (a diferencia del pago de transporte que permite −$50), inserta movimiento `pago_servicio`.
- `qard_revertir_pago_servicio(...)`: devuelve saldo si Fintoc rechaza.
- Edge `qard-pagar-servicio` → RPC, luego POST `https://api.fintoc.com/v1/transfers` con header `Idempotency-Key`. Sin llave: no dispersa, queda pendiente.
- UI `/qard/servicios`.

## Fases pendientes
1. **Payins**: CLABE única por usuario con metadata = qard_number; webhook Fintoc acredita saldo automáticamente.
2. **Payouts a concesionarios**: acumular viajes, comisión configurable (porcentaje / cuota fija por viaje / híbrido), corte diario/semanal/manual, validar cuenta antes del primer pago. Neto = recaudado − comisión.
3. El **chofer nunca ve dinero**: solo escanea y ve "Cobro exitoso". El dinero se asigna al concesionario dueño de la unidad.
