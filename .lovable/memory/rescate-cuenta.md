---
name: modo-rescate-telefono-perdido
description: Rescue Mode — block account from a borrowed phone, 15-min temp sessions, email unlock
type: feature
---
Modo Rescate (teléfono perdido): entrada `/rescate` pública, login con teléfono + clave de 5 dígitos (sin código de correo para ENTRAR — la clave es secreta y el correo puede estar en el teléfono perdido). Sesión temporal de 15 min en sessionStorage aislada (`src/lib/rescate.ts`), nunca toca la sesión del dueño del teléfono prestado ni registra dispositivo de confianza.

Acciones: bloquear cuenta, cerrar todas las sesiones, cambiar clave. Desbloqueo SÍ exige código por correo (6 dígitos vía rescate-cuenta). Candados universales: `public.cuenta_esta_bloqueada(user_id)` consultada en qard-cobrar-comercio (comercio y pagador), qard-retirar, qard-pagar-servicio, wallet-cobrar-qr, validate-qr-ticket y RPC qard_transfer_p2p. `CuentaBloqueadaGate` es overlay global fullscreen si profiles.cuenta_bloqueada. Rate limit en tabla rescate_intentos (5 fallos → 10 min). Cualquier función nueva que mueva dinero DEBE incluir el candado.
