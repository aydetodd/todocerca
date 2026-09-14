---
name: Verificación de sub-QR (Nivel 1)
description: Cada sub-QR familiar se verifica con nombre completo + CURP RENAPO, cuesta $20 descontados del saldo del titular y nunca sube a Nivel 2
type: feature
---

Cada `qard_sub_qr` tiene `nombre_completo`, `curp_enc`, `curp_hash`, `curp_verificada`, `verificada_at`, `verificacion_costo` (20).

Flujo: `VerificarSubQrDialog` valida la CURP localmente (`src/lib/curp.ts`) → edge function `verificamex-curp` con `sub_qr_id` y `nombre_completo` → RENAPO → RPC `qard_verificar_sub_qr` (SECURITY DEFINER, solo service_role) que descuenta $20 del `qard_wallets` del titular, registra movimiento `comision` con descripción "Verificación de sub-QR (alias)" y abona a la QaRd Maestra vía `qard_cobrar_comision` tipo `account_opening`.

Reglas: se cobra una sola vez por sub-QR, solo si RENAPO responde bien; CURP única por titular (índice parcial); saldo insuficiente bloquea la validación; los sub-QR **nunca** suben a Nivel 2 (no hay flujo INE para ellos). Log en `verificamex_logs` con `tipo = 'curp_sub_qr'`.
