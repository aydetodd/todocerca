# Identidad Dual, Activación QaRd y Límites Financieros

## Idea en una frase
Todos usan la app con su **Apodo**. El **Nombre Completo + CURP** solo nace cuando el usuario activa su tarjeta QaRd, y solo se muestra en pantallas de dinero.

## Estados de la tarjeta (semáforo)
| Estado | Color | Qué puede hacer |
|---|---|---|
| INACTIVA | Gris | Nada de dinero. Solo chat, mapa, extraviados, regalos |
| ACTIVA | Verde | Recargar hasta $10,000 al mes, pagar, transferir |
| EN_REVISION | Naranja | Sigue como activa, esperando revisión de empresa |
| MORAL_APROBADA | Azul/Oro | Igual, pero **sin tope de recarga** |
| RECHAZADA | Vuelve a Verde (activa física) + aviso del motivo |

## Fase 1 — Registro (solo Apodo)
- El registro pide: Apodo (único), Teléfono, Correo, Términos. Se quita el campo de nombre real.
- Al crearse el usuario, se genera su número QaRd y su wallet en segundo plano, en estado INACTIVA.
- En Bóveda QaRd: tarjeta con badge grande "INACTIVA", botones de Recargar / Transferir / Cobrar en gris con candado y botón "Activar mi QaRd".

## Fase 2 — Activación (3 pasos)
1. **Teléfono**: código SMS (reusa el sistema de verificación que ya existe).
2. **Correo**: token con caducidad de 7 días, enviado por correo.
3. **Datos legales**: Nombre Completo + CURP.
   - CURP validada por algoritmo completo: 18 caracteres, formato oficial y dígito verificador RENAPO. Si falla: "La CURP ingresada no es válida según el formato oficial."
- Al terminar: tarjeta ACTIVA, nombre completo y CURP guardados en tabla privada aparte (no en el perfil público).

## Límite de recargas
- Tope de **$10,000 MXN por mes calendario** solo para meter dinero. Se reinicia el día 1.
- El saldo **no caduca ni tiene tope**: lo que no gastes se acumula.
- Gastar es ilimitado (hasta tu saldo).
- En la pantalla de recarga: barra de progreso "Has recargado $X de tus $10,000 disponibles este mes". Si intentas pasarte, se bloquea y dice cuánto te queda.
- Ejemplo: recargas $7,000 el día 5 y $2,000 el día 20 → te quedan $1,000 ese mes. El día 1 del mes siguiente vuelves a tener $10,000 de margen, aunque traigas $9,000 de saldo acumulado.

## Fase 3 — Regla dual en la interfaz
- **Dinero** (movimientos, recibos, pantalla de cobro del chofer/comercio, transferencias): se muestra **Nombre Completo**.
- **Social** (chats, mapa, paradas virtuales, extraviados, regalos, contactos): se muestra **solo Apodo**.
- Las consultas de las vistas sociales nunca leen nombre completo ni CURP.

## Fase 4 — Upgrade a Persona Moral
- Desde el perfil: "Convertir mi cuenta a Persona Moral / Proveedor".
- Pide Razón Social, RFC (validación de formato) y archivo de Constancia de Situación Fiscal (PDF/JPG/PNG).
- Aviso: "El documento debe ser legible y tener el código de barras visible. Será revisado manualmente en 24 a 48 horas."
- La cuenta pasa a EN REVISIÓN.

## Fase 5 — Panel de administración
- Nueva pestaña en el panel de admin: lista con Razón Social, RFC, fecha y "Ver Constancia".
- Botones Aprobar / Rechazar (rechazo pide motivo).
- Aprobar → MORAL_APROBADA, se quita el tope de $10,000 y se notifica al usuario por el buzón interno.
- Rechazar → vuelve a activa física y se notifica con el motivo.

## Detalles técnicos
- **Base de datos**
  - `qard_identidad` (privada, 1 por usuario): nombre_completo, curp cifrado, estado (`inactive|active|moral_review|moral_approved`), teléfono y correo verificados, fechas. RLS: solo el dueño y admin.
  - `qard_moral_solicitudes`: razón social, rfc, ruta del documento, estado, motivo de rechazo, revisor.
  - `email_verification_tokens`: token, caducidad 7 días.
  - Vista/columna de control de recarga: función `qard_recargas_mes(user_id)` que suma movimientos tipo `recarga` del mes calendario en horario Hermosillo.
  - Trigger/validación en `qard-recargar` y en el webhook de Stripe para rechazar si excede el tope (salvo `moral_approved`).
  - Bucket privado `constancias-fiscales` con acceso solo al dueño y admins.
  - CURP cifrada con las funciones `qard_enc`/`qard_dec` ya existentes.
- **Frontend**
  - `src/lib/curp.ts` (validación con dígito verificador) y `src/lib/rfc.ts`.
  - `src/components/qard/ActivarQardDialog.tsx` (wizard de 3 pasos).
  - `src/components/qard/UpgradeMoralDialog.tsx`.
  - `src/components/AdminSolicitudesMoral.tsx` en el panel de admin.
  - Ajustes en `src/pages/Auth.tsx` (quitar nombre real), `src/pages/Qard.tsx` (badge de estado, bloqueo de botones, barra de progreso de recarga), `src/pages/QardCobrar.tsx` y `ForaneoScanner` (mostrar nombre completo al cobrar), `src/pages/MiPerfil.tsx` (entrada al upgrade).
- **Edge functions**: `qard-activar` (verificaciones y guardado legal), `qard-enviar-token-correo`, `qard-verificar-correo`, `qard-upgrade-moral`, `qard-admin-moral` (aprobar/rechazar).

## Orden de entrega
1. Base de datos + bucket + validadores CURP/RFC.
2. Registro solo con apodo + tarjeta INACTIVA con bloqueo.
3. Wizard de activación (teléfono, correo, datos legales).
4. Tope mensual de $10,000 con barra de progreso.
5. Nombre completo en pantallas de dinero / apodo en sociales.
6. Upgrade a persona moral + panel de admin.
