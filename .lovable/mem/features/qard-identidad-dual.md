---
name: Identidad dual QaRd
description: Apodo para lo social, nombre legal + CURP solo para dinero; activación SOLO por correo, tope $10,000/mes de entradas, 0% comisiones internas, 2% al retirar, upgrade Comerciante $200/año
type: feature
---

**Identidad social (gratis)**: solo `profiles.apodo`. Chats, mapa, paradas virtuales, extraviados y regalos NUNCA consultan `nombre_completo` ni `curp`.

**Identidad financiera**: tabla `qard_identidad` (estado `inactive` | `active` | `moral_review` | `moral_approved`). Todo usuario nace con tarjeta generada pero **INACTIVA**.

**Activación (2 pasos, EXCLUSIVAMENTE por correo)** vía `qard-identidad`: (1) código al correo (token 7 días, Resend desde `hola@todocerca.mx`), (2) Nombre Completo + CURP validada con dígito verificador (`src/lib/curp.ts`) y enlace `https://www.gob.mx/curp/` en pestaña nueva. **Ya no se usa SMS.**

**Reglas financieras**:
- Movimientos internos (pagos, transporte, servicios, P2P, cobros de comercio): **0% comisión**.
- Retiros SPEI/OXXO: **2%** y solo para cuentas Comerciante aprobadas.
- Tope PLD: **$10,000 MXN de ENTRADAS por mes calendario** (recargas + cobros netos), calculado por `qard_entradas_mes` / `qard_limite_recarga` en horario Hermosillo. Se reinicia el día 1. Saldo acumulado sin tope ni caducidad; gastar es ilimitado.

**Upgrade a Comerciante ($200 MXN/año)**: `qard-moral` acción `solicitar` con `tipo_persona` (fisica|moral), nombre/razón social, CURP o RFC, Constancia de Situación Fiscal en bucket privado `constancias-fiscales` (`{user_id}/...`) y re-verificación por correo. Estado pasa a EN REVISIÓN; admin aprueba/rechaza en `AdminSolicitudesMoral` (/panel) y el usuario recibe correo + buzón interno. Aprobado = sin tope + retiros desbloqueados, `suscripcion_vence` a 1 año.

**Semáforo UI** (`ESTADO_UI`): gris INACTIVA, verde ACTIVA, ámbar EN REVISIÓN, azul/oro COMERCIANTE.
