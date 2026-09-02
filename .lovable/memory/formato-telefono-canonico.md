---
name: Formato canónico de teléfono
description: Todo teléfono en DB, login, rescate y búsquedas se normaliza a clave país + 10 dígitos (México: +52XXXXXXXXXX)
type: feature
---
El formato único de teléfono en toda la app es: **código de país + 10 dígitos**, sin espacios ni símbolos en DB (ej. México: `+526624124381`, guardado como `+526624124381`).
- Todo guardado en `profiles.telefono`, auth, invitaciones y búsquedas debe normalizarse a este formato antes de escribirse.
- Las funciones de búsqueda (login, rescate-cuenta, find_user_by_phone) deben normalizar la entrada a este formato canónico; las variantes legacy solo sirven como fallback de lectura para datos viejos.
- La UI muestra bandera + prefijo vía `<PhoneInput>` (Protocolo Bandera+Prefijo) y el valor interno siempre es E.164 sin el "1" mexicano.
**Why:** El usuario lo definió como regla única para evitar inconsistencias de formatos (52..., 521..., +52..., 10 dígitos sueltos) que causan fallos de login y rescate.
