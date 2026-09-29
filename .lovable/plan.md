# Estados de cuenta separados por cubeta + pantalla "Mi dinero"

## Lo que está mal hoy (tu captura)
- En la cuenta eje aparecen palabras raras: `traspaso_cobros_out` y `traspaso_cobros_in`.
- Los dos traspasos salen en rojo (-150 y -150), cuando uno debería ser +150.
- "Cobro recibido +150" sale en la cuenta eje, pero ese dinero es de "En cobros".
- Por eso los saldos no cuadran: el correcto es pasar de $555 a $705.

## Resultado
1. **Cada movimiento sabe a qué cubeta pertenece**: cuenta eje, una sub-QR o cobros. Si el dinero pasa de una cubeta a otra, se escriben 2 renglones: uno sale (-) y otro entra (+).
   - Traspaso de $150: en Cobros "Traspaso a mi cuenta eje -$150"; en Eje "Traspaso recibido de cobros +$150".
   - Cobro de $150 a una sub-QR: en Cobros "Cobro recibido +$150"; en la sub-QR "Cobro en comercio -$150".
   - Pasar dinero de eje a sub-QR: sale en eje, entra en esa sub-QR.
2. **Tres estados de cuenta, cada uno solo con lo suyo**:
   - Cuenta eje: solo renglones de la eje, con saldo inicial real y saldos correctos renglón por renglón. CSV solo de eje.
   - Sub-QR: desde el botón de historial de cada tarjeta, solo lo de esa sub-QR.
   - Cobros: solo lo de "En cobros", con su propio saldo.
3. **Pantalla nueva "Mi dinero"**: Cuenta eje $X, cada sub-QR activa con su nombre y saldo, Cobros $Z, y al final "Total de tu dinero". Los saldos se leen de los saldos reales en vivo, no se calculan sumando renglones.
4. **Solo nombres claros**: una sola lista de nombres para todos los estados de cuenta y los CSV. Nunca se muestra una palabra técnica.
5. **Mensajes de error amables**: si falla un traspaso o un cobro, el usuario ve "No se pudo completar en este momento; intenta de nuevo". El detalle técnico solo se guarda en el servidor.

## Detalles técnicos
- Migración: agregar en `qard_movimientos` las columnas `ambito` ('eje'|'sub_qr'|'cobros') y `direccion` ('entrada'|'salida'); `sub_qr_id` ya existe. Solo se agregan columnas, sin editar filas: el candado anti-cambios se queda como está.
- Los 9 movimientos que ya existen se clasifican con una regla solo de lectura, según su tipo y su signo, dentro de una vista `qard_movimientos_ledger`. Esa vista usa las nuevas columnas cuando existen y, si no, aplica la regla. Los movimientos que cruzan cubetas y hoy tienen un solo renglón (cobro_comercio / cobro_recibido, transfer_a_sub) se abren en 2 renglones virtuales dentro de la vista. Así no se toca el historial y los datos viejos cuadran.
- Actualizar las funciones que escriben movimientos para que llenen `ambito` y `direccion`, y escriban el renglón doble cuando cruzan cubetas: `qard_pasar_cobros_a_eje` (además arregla el signo de `traspaso_cobros_in`), `qard_transferir_a_sub`, `qard_aplicar_recarga`, `qard_transfer_p2p`, `qard_verificar_sub_qr`, `rpc_qard_scan_foraneo`, y el cobro en `qard-cobrar-comercio`. Los montos y las comisiones no cambian.
- Revisar `qard_movimientos_tipo_check` en la migración aplicada en la corrección anterior. Si no la cubre toda, rehacerla con todos los tipos vivos: recarga, comision, transferencia_p2p_in/out, cobro_comercio, cobro_recibido, traspaso_cobros_in/out, transfer_a_sub/desde_sub, devolucion, retiros y ajuste. Dejarlo anotado en AGENTS.md.
- Frontend: nuevo `src/lib/qardEtiquetas.ts` (lista tipo → nombre, separada por cubeta). `Qard.tsx`: el estado de cuenta filtra por cubeta y el saldo inicial es el saldo vivo menos solo los renglones de esa cubeta; CSV por cubeta; botón de historial en cada sub-QR; nueva sección "Mi dinero" que lee `qard_wallets` y `qard_sub_qr`, con actualización en tiempo real.
- Errores: los mensajes de las funciones del servidor y las pantallas se cambian por el texto amable, y el detalle queda en `console.error` del servidor.
- No se toca el transporte, las comisiones ni el trigger que impide editar movimientos.

## Pruebas que te entrego
- Traspaso de $150: Cobros -150, Eje +150; la eje sin "Cobro recibido" y con saldos que van de 555 a 705.
- Cobro de $150 a una sub-QR: Cobros +150 y la sub-QR -150; aparece en su estado de cuenta y no en el de la eje.
- "Mi dinero" suma bien.
- Cada CSV trae solo lo de su cubeta.
