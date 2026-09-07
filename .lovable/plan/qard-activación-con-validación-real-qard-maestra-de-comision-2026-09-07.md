# QaRd: activación con validación real + QaRd Maestra de comisiones

Sí, entendí todo. Lo divido en 3 entregas para que puedas probar cada una sin romper lo que ya funciona.

## Entrega 1 — Nuevo flujo "Activar mi QaRd"

1. Correo: enviar código, verificar (igual que hoy, código válido 7 días).
2. Nombre completo + CURP. Al escribir los 18 caracteres, la app valida sola contra RENAPO y muestra "Validando tu identidad...".
   - Si sale bien: muestra nombre, fecha de nacimiento y entidad que devolvió RENAPO y pregunta "¿Estos datos son correctos?".
   - Si falla: mensaje claro y botón para reintentar.
3. Pantalla de costos y niveles:
   - Nivel 1: 1,000 UDIS al mes (~$8,150).
   - Costos: $10 de apertura (una sola vez) + $5 por cada recarga; primera recarga $15 en total.
   - Opción de subir a Nivel 2 (3,000 UDIS) validando INE.
4. Al confirmar: la tarjeta queda ACTIVA, nivel 1, con el cobro de apertura pendiente, y lleva directo a "Recargar".
5. Si elige INE: sube frente y reverso, se compara contra la CURP validada; si coincide sube a Nivel 2, si no, puede reintentar o quedarse en Nivel 1.

## Entrega 2 — QaRd Maestra y cobro automático de comisiones

- Se crea la cuenta maestra **5200 0000 0000 0100** ("QaRd Maestra de TodoCerca"): sin límites, no se puede borrar, invisible para usuarios, solo la ve el administrador.
- El aviso de depósito SPEI queda así:
  - Primera recarga: $10 apertura + $5 comisión van a la Maestra, el resto al usuario.
  - Recargas siguientes: $5 a la Maestra, el resto al usuario.
  - Retiros: 2% a la Maestra, el resto al usuario.
- El usuario recibe el aviso con el desglose exacto ("Transferencia $100, apertura -$10, comisión -$5, te acreditamos $85").
- Cada cobro queda registrado uno por uno para poder auditarlo.

## Entrega 3 — Panel de la QaRd Maestra (solo administrador)

- Tarjetas arriba: total del mes, comparación con el mes anterior, y desglose Aperturas / Recargas / Retiros (cantidad y monto).
- Filtros: hoy, 7 días, este mes, mes anterior, 30 días, rango a la medida, año.
- Filtro por tipo de operación y búsqueda por número de QaRd, usuario, monto o clave de rastreo.
- Tabla detallada ordenable, gráficas (pastel por tipo, barras por día, línea de saldo).
- Exportar a CSV y PDF; semáforo de conciliación (verde/amarillo/rojo) comparando comisiones contra saldo real.

## Detalles técnicos

- La identidad vive en `qard_identidad` (no en `users`): agrego `account_opening_fee_pending` (default true), `account_opening_fee_amount` (10.00), `verificamex_curp_validated`, `verificamex_ine_validated`. `verification_level`, `monthly_limit_udis` y `verificamex_data_enc` ya existen.
- Nuevas tablas: `master_qard_account` (fila única, id fijo `...0100`, contadores y saldo) y `commission_transactions` (tipo `account_opening` | `reload_fee` | `withdrawal_fee`, monto, monto original, clave de rastreo). RLS: lectura solo admin; escritura solo `service_role`.
- Función SQL `qard_cobrar_comision(...)` atómica: descuenta de la recarga, abona a la maestra, actualiza contadores y registra la transacción.
- `stp-webhook` se modifica para acreditar `monto - comisiones` y disparar esa función; se mantiene la idempotencia por `clave_rastreo`.
- Nueva función `qard-retiro-comision` para el 2% de salidas.
- Frontend: rehacer `ActivarQardDialog.tsx` (auto-validación CURP vía `verificamex-curp`, pantalla de costos, resumen, salto opcional a INE reutilizando `verificamex-ine`), y nueva página `/panel/qard-maestra` con filtros, gráficas (recharts, ya instalado) y exportación.

## Notas

- Los avisos automáticos (resumen semanal de los lunes, alertas de caída del 50%) los dejo fuera de esta primera implementación salvo que los quieras desde ya.
- El cobro real solo ocurre cuando STP esté configurado con credenciales reales; hasta entonces se puede probar simulando el aviso de depósito.
