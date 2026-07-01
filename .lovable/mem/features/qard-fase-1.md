---
name: QaRd Fase 1
description: Sistema QaRd (Quiero Administrar mis Recursos de dinero) — número universal de 16 dígitos, wallet con saldo hasta −$50, cobro comercio 94/6
type: feature
---

**Reemplaza** al sistema anterior de boletos QR de $9 y Wallet Familiar (tablas vaciadas: qr_tickets, cuentas_boletos, transacciones_boletos, movimientos_boleto, wallets_qr, sub_qr_saldo, movimientos_wallet).

**Número 16 dígitos**: `PP EE MMM UUUUUUU SS` (país por lada de teléfono via `paises.codigo_telefono`, estado/municipio por orden alfabético dentro de `subdivisiones_nivel1/2` cuando `profiles.qard_nivel2_id` está seteado, si no queda 00/000). Se guarda en `profiles.qard_number`, backfill hecho + trigger `trg_qard_on_profile_insert` para nuevos.

**Tablas**:
- `qard_wallets` (saldo con CHECK ≥ −50)
- `qard_sub_qr` (00 titular, 01–99 familiares; alias, limite_por_transaccion, horario)
- `qard_movimientos` (recarga/cobro_comercio/devolucion/ajuste; incluye comision_mxn y neto_comercio_mxn)
- `qard_secuencia_municipio` (contador por bucket)

**Funciones SQL**: `qard_bucket_for_user`, `qard_ensure_number`, `qard_ensure_wallet`.

**Edge functions**:
- `qard-recargar` — Stripe Checkout mín $200 MXN sin comisiones al usuario.
- `qard-cobrar-comercio` — Descuenta 100% al titular, split 6% plataforma / 94% comercio (Fase 1 solo lo registra en `qard_movimientos`; job de liquidación al CLABE es Fase posterior). Valida sub-QR activo, límite, horario y tope −$50. Notifica al titular en `messages`.
- `stripe-webhook-tickets` — Rama `metadata.type = qard_recarga` acredita el saldo.

**Rutas**: `/qard` (billetera del usuario, QR grande, recarga, sub-QR familiares, movimientos) y `/qard/cobrar` (escáner del comercio con html5-qrcode). `/wallet/familiar` y `/wallet/qr-boletos` redirigen a `/qard`.

**Faltantes** (fuera de Fase 1): talones PDF (Fase 2), control parental avanzado —comercios permitidos— (Fase 3), reemplazar cobro geocerca en transporte por QaRd (Fase 4), job de liquidación diaria QaRd al CLABE del comercio.
