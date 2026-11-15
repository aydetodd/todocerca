# QaRd: terminaciones, bonos sectoriales y sellos

## Lo que entendí
- 00 Eje personal · 01 Empresarial · 02 Alimentos · 03 Despensa (nace apagada, solo la prende un interruptor maestro del servidor) · 04 Gasolina · 05 Farmacia · 06 Papelería · 07–10 reservadas · 11+ familiares y empleados.
- Las 2 familiares que hoy terminan en 02 pasan a 11 y 12 (su QR/número anterior deja de servir; se avisa al titular en el buzón).
- Los bonos los compra una empresa a TodoCerca con factura y los regala a sus empleados. El usuario no puede pasar saldo general a un bono.
- El sello "Acepta Bono X" depende del giro verificado del negocio; el comerciante solo puede prender los sellos compatibles con su giro.

## Pasos (en este orden, cada uno probado antes del siguiente)
1. **Numeración**: tabla de tipos por terminación; mover familiares 02 → 11+; nuevas familiares desde 11. Bonos 02–06 se crean al recibir el primer bono (03 siempre apagada).
2. **Giro del negocio**: catálogo giro → bonos permitidos (comida → Alimentos/Despensa, gasolinera → Gasolina, farmacia → Farmacia, papelería → Papelería). Al registrar empresa se elige giro; cambiarlo lo revisa admin.
3. **Sellos en el mapa**: interruptores en "Gestionar mi empresa" solo para bonos compatibles; sello brillante en el perfil del mapa.
4. **Cobro con bono**: un bono solo paga en comercio con ese sello prendido; el cobro entra al comerciante separado por tipo de bono.
5. **Convertir bonos a saldo general**: botón en panel del comerciante; un solo movimiento atómico e idempotente por bono, en el libro inmutable, sin comisión (salvo que me indiques una).
6. **Transferencia homóloga**: bono X solo a una cuenta con bono X habilitado; cruces bloqueados en el servidor.
7. **Compra empresarial de bonos**: admin registra la compra con folio de factura; la empresa reparte a empleados por teléfono.
8. **Hash TCB**: cada movimiento de bono/conversión guarda hash encadenado (anterior + actual) en el servidor; el respaldo .tcb del teléfono sigue pendiente de la app nativa.

## Límites claros
- La facturación real (CFDI) y el cobro a la empresa no se automatizan aquí; el admin registra la compra ya pagada.
- Despensa 03 queda sin uso hasta que prendas el interruptor.
- No cambio comisiones ni transporte.

## Técnico
- `qard_sub_qr.sub_index` define tipo; constraint 2–10 = bono, ≥11 = familiar. Saldos de bono por sub_qr; saldos del comerciante por bono en columnas/tabla aparte de `saldo_comercio_mxn`.
- Interruptor maestro en `pagos_config`, solo admin (`user_roles`).
- Todo dinero vía RPC SECURITY DEFINER atómicas con operation_key; pruebas SQL + vitest por regla.
