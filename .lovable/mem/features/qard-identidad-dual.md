---
name: Identidad dual QaRd
description: Apodo para lo social, nombre legal + CURP solo para dinero; activación de tarjeta, tope $10,000/mes y upgrade a Persona Moral
type: feature
---

**Identidad social (gratis)**: solo `profiles.apodo`. Chats, mapa, paradas virtuales, extraviados y regalos NUNCA consultan `nombre_completo` ni `curp`.

**Identidad financiera**: tabla `qard_identidad` (estado `inactive` | `active` | `moral_review` | `moral_approved`, `nombre_completo`, `curp_enc` cifrada con `qard_enc`, `phone_verified`, `email_verified`). Todo usuario nuevo nace con tarjeta generada pero **INACTIVA** y botones de dinero bloqueados.

**Activación (3 pasos)** vía edge function `qard-identidad`: SMS (Twilio + respaldo en buzón interno), correo (token 7 días en `email_verification_tokens`, Resend + respaldo buzón) y datos legales con validación algorítmica de CURP (`src/lib/curp.ts`, dígito verificador RENAPO).

**Tope de recarga**: $10,000 MXN por mes calendario (`qard_limite_recarga`), validado en cliente y en `qard-recargar`. El **saldo no caduca ni tiene tope**; el gasto es ilimitado. Persona moral aprobada = sin tope (`tope = null`).

**Persona Moral**: `qard-moral` (acciones `solicitar` / `resolver`). Razón social + RFC (`src/lib/rfc.ts`) + Constancia de Situación Fiscal en bucket privado `constancias-fiscales` (ruta `{user_id}/...`). Revisión manual en `AdminSolicitudesMoral` dentro de `/panel` (solo admin).

**Semáforo UI** (`ESTADO_UI` en `src/hooks/useQardIdentidad.ts`): gris INACTIVA, verde ACTIVA, ámbar EN REVISIÓN, azul/oro EMPRESA.

**Regla dual en pantallas**: recibos, movimientos y la confirmación de cobro del comercio (`qard-cobrar-comercio` devuelve `titular_nombre` vía `qard_nombre_legal`) muestran el **nombre completo**; chats y mapas solo el **apodo**.
