# Verificar cada sub-QR con CURP (Nivel 1) y cobrar $20

Cada sub-QR familiar tendrá su propia verificación: nombre completo + CURP validada en RENAPO. Cada verificación cuesta **$20 MXN** y se descuenta del saldo de la cuenta principal (cuenta eje) del titular. Los sub-QR **nunca** suben a Nivel 2 (no piden INE).

## Cómo se verá

1. En "Sub-QR familiares", cada tarjeta muestra una etiqueta: **Sin verificar** (gris) o **Verificada** (verde) con el nombre de la persona.
2. Un sub-QR sin verificar muestra el botón **Verificar ($20)**.
3. Al tocarlo se abre una ventana con: Nombre completo y CURP, el aviso "Se descontarán $20.00 de tu saldo" y el enlace oficial para consultar la CURP.
4. Al confirmar: se valida la CURP en RENAPO, se descuentan los $20 del saldo del titular y el sub-QR queda **Verificada**.
5. Si la CURP no existe o está mal escrita: mensaje claro y **no se cobra nada**.
6. Si el saldo del titular es menor a $20: mensaje "Saldo insuficiente, recarga tu QaRd" y no se valida.
7. En el estado de cuenta aparece el renglón **Verificación de sub-QR (Nombre) −$20.00**.

## Reglas

- Un sub-QR solo se cobra una vez; si ya está verificado no se vuelve a cobrar.
- La misma CURP no puede usarse en dos sub-QR del mismo titular.
- El cobro solo ocurre cuando RENAPO responde correctamente.
- Los $20 se abonan a la QaRd Maestra de TodoCerca como comisión de apertura.
- Los sub-QR se quedan en Nivel 1: no hay flujo de INE ni de Nivel 2 para ellos.
- Opcional a definir por uso: un sub-QR sin verificar puede seguir recibiendo saldo, pero mostrará el aviso de verificación pendiente.

## Detalles técnicos

- Columnas nuevas en `qard_sub_qr`: `nombre_completo`, `curp_enc`, `curp_verificada boolean default false`, `verificada_at`, `verificacion_costo numeric default 20`. Índice único parcial por (titular_user_id, curp_hash) para evitar CURP repetidas.
- Nueva función de base de datos `qard_verificar_sub_qr(_sub_qr_id, _nombre, _curp)` (SECURITY DEFINER): valida propiedad, que no esté ya verificada, saldo ≥ 20, descuenta del `qard_wallets` del titular, inserta en `qard_movimientos` con descripción "Verificación de sub-QR (alias)" y llama a `qard_cobrar_comision(..., 'account_opening', 20, ...)`.
- Nueva acción en la edge function `verificamex-curp`: parámetro `sub_qr_id`. Cuando viene, valida formato + RENAPO reusando el código existente, y en vez de tocar `qard_identidad` llama a `qard_verificar_sub_qr`, guarda nombre y CURP cifrada con `qard_enc`, y registra en `verificamex_logs` con `tipo = 'curp_sub_qr'`. Sin `sub_qr_id` el comportamiento actual del titular queda igual.
- Frontend en `src/pages/Qard.tsx`: estado de verificación en cada tarjeta de sub-QR, diálogo reutilizando la validación local `src/lib/curp.ts` antes de llamar al servidor, y refresco por Realtime ya existente sobre `qard_sub_qr`.
- Estado de cuenta: el movimiento nuevo ya entra como renglón propio con su descripción; no se usa la palabra "ajuste".
