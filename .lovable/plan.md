# Modo Rescate: "¿Perdiste tu teléfono?"

Objetivo: si pierdes tu teléfono, puedes entrar desde CUALQUIER teléfono prestado (de un amigo o un desconocido) sin que el dueño de ese teléfono vea nada tuyo, y dejando tu cuenta bloqueada en el teléfono perdido.

## Cómo se ve para el usuario

1. Le pides el teléfono a alguien. En la app de esa persona, en su perfil, hay un botón: **"¿Perdiste tu teléfono? Entrar en modo rescate"**.
2. Al tocarlo, la app abre una pantalla limpia (modo invitado). **No cierra la sesión del dueño del teléfono**: su sesión queda guardada y regresa sola cuando terminas.
3. Te pide **teléfono + tu clave de 5 números**.
4. Te llega un **código de 6 dígitos a tu correo** (el correo verificado de tu cuenta). Lo escribes.
5. Entras en **sesión temporal de rescate**:
   - Dura **15 minutos**, con contador visible.
   - El teléfono prestado **nunca queda como dispositivo de confianza**.
   - Se muestra un banner rojo: "Sesión de rescate en teléfono prestado. Se cerrará sola en 14:32".
6. Lo primero que ves es la pantalla **"Proteger mi cuenta"** con tres botones grandes:
   - **Bloquear mi cuenta** (congela todo: pagos, cobros, transferencias, retiros; los QR dejan de validar).
   - **Cerrar sesión en todos mis dispositivos** (mata el teléfono perdido).
   - **Cambiar mi clave de 5 números**.
7. Al salir (o al vencer los 15 min) la app borra todo rastro y devuelve al dueño a su propia sesión.

## Reactivar la cuenta

Cuando recuperes o repongas tu teléfono: entras normal (teléfono + clave), pides código al correo y tocas **"Desbloquear mi cuenta"**. Mientras esté bloqueada, la app solo muestra la pantalla de desbloqueo y el saldo en modo lectura.

## Mejoras sobre tu idea

- El botón no vive escondido: aparece también en la **pantalla de inicio de sesión** ("¿Perdiste tu teléfono?"), por si el amigo no tiene cuenta abierta.
- Se agrega **código al correo** además de la clave: si alguien te vio teclear los 5 números, no le basta.
- **Bloqueo primero, sesión completa después**: en modo rescate solo puedes proteger la cuenta, no gastar. Si el que "perdió el teléfono" fuera un impostor, no puede sacarte dinero.
- **Aviso al correo** cada vez que se usa modo rescate, con la hora y la ciudad aproximada.
- **Límite anti-abuso**: 3 intentos de rescate por cuenta cada hora; después espera 30 minutos.
- El teléfono prestado queda **limpio**: sesión temporal en memoria, no en el almacenamiento permanente.

## Detalles técnicos

- Nueva columna en `profiles`: `cuenta_bloqueada` (bool), `bloqueada_en`, `bloqueada_motivo`.
- Nueva tabla `rescate_intentos` (user_id, ip/fingerprint, creado, resultado) para el límite por hora. Con GRANTs y RLS: solo service_role escribe.
- Nueva Edge Function `rescate-cuenta` con acciones: `solicitar_codigo` (valida teléfono + clave contra Auth, manda código por Resend), `verificar_codigo` (devuelve sesión temporal), `bloquear`, `cerrar_todo`, `desbloquear`.
- La sesión de rescate se guarda en `sessionStorage` (no `localStorage`) y no crea fila en `trusted_devices`; en `active_sessions` se marca `es_rescate = true` para excluirla del bloqueo de sesión única.
- Guard global: si `cuenta_bloqueada` es verdadero, RLS y las funciones de pago (`qard_transfer_p2p`, `qard-cobrar-comercio`, `qard-retirar`, validación de QR) rechazan la operación con un mensaje claro.
- Componentes nuevos: `RescateModeButton` (perfil + pantalla de login), `RescateFlow` (teléfono → clave → código → acciones), banner de cuenta bloqueada.

## Fuera de alcance por ahora

- Recuperación sin acceso al correo (requeriría soporte humano y verificación de identidad).
- SMS como segundo canal (hoy solo funciona correo).
