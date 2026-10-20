# Terminales digitales de TodoCerca

## Resultado
Un comercio podrá tener varias terminales en su perfil personal, dentro de la misma cuenta y teléfono. TodoCerca enviará una invitación por cada terminal; aceptarla habilitará únicamente esa función cuando el comercio esté aprobado.

## Importes confirmados
- Cada recarga: **$15 MXN**, reemplazando los $5 actuales.
- Activación de QaRd principal: **$150 MXN una sola vez**, descontados en la primera recarga. No volver a cobrar a cuentas que ya pagaron su activación.
- Activación de sub-QR: **$100 MXN una sola vez**, descontados de la cuenta principal del titular. Requiere nombre completo y CURP validada; solo nivel 1, sin INE ni subida a nivel 2. Conservar la protección contra CURP duplicadas.
- Recarga atendida por comercio: de los $15, **$5 al comercio y $10 a TodoCerca**.
- Recarga sin comercio: los **$15 a TodoCerca**, sin crear un beneficiario ficticio. Este es el criterio propuesto para las recargas directas.
- Ejemplo: primera recarga principal de $200 → $35 de saldo ($150 de activación + $15 de comisión); recarga posterior de $200 → $185.
- No modificar comisiones de transporte ni retiros.

## Comercio afiliado y permisos
1. Incorporar la solicitud de Comercio Afiliado Nivel Tres / Agente Autorizado en el perfil personal.
2. Exigir CURP, RFC e INE con comprobación biométrica real. Guardar documentos en almacenamiento privado y mostrar estado de cada comprobación.
3. **Mantener las solicitudes pendientes** mientras no exista comprobación biométrica conectada. Leer una INE no equivale a comprobar biometría. No gastar consultas de Verificamex durante el desarrollo.
4. Preparar revisión administrativa e invitaciones independientes por terminal: pendiente, aceptada, revocada. Una invitación aceptada no sustituye la aprobación del comercio.
5. Ninguna solicitud pendiente elimina límites financieros. Los permisos especiales de agente solo se habilitan con todas las comprobaciones aprobadas; el nivel financiero QaRd no cambia por apariencia ni por aceptar una invitación.

## Terminales
- **Cobro:** QR o número de 16 dígitos con CVV dinámico de 4 dígitos. El CVV estático de 3 dígitos no se transmite. Conservar el dinámico en el buzón interno, de un uso y sin vencimiento temporal. Revisar el cobro de comercio existente para que no pida el estático; no tocar lectores de transporte.
- **Recargas:** recibir efectivo y acreditar saldo desde fondos disponibles del comercio, nunca crear saldo sin respaldo. Confirmar saldo suficiente, destinatario y desglose antes de realizar la operación. Descontar y repartir fondos de forma indivisible, evitando duplicados por doble toque o reintentos.
- **Servicios:** permanecerá pendiente, sin aceptar pagos ni anunciar operaciones exitosas hasta tener proveedor contratado. Cuando exista, $5 al comercio y el remanente real de la comisión mayorista a TodoCerca.
- **Consulta y asistencia:** saldo e historial propios; no exponer movimientos de otros usuarios ni inventar conceptos cobrables.
- Nuevas terminales se agregan al catálogo y se habilitan por invitación; una función nueva requiere su integración real, no solo cambiar su nombre.

## Libro y sincronización
- Registrar cada operación con comerciante, terminal, destinatario o servicio, monto, hora exacta y desglose financiero.
- Mantener renglones inmutables y los libros separados de cuenta principal, sub-QR, cobros y rutas.
- Saldo y permisos confirmados se sincronizan en tiempo real. No mostrar como guardado un cobro o recarga fallidos.
- Actualizar todos los avisos y ejemplos de activación/recarga para que coincidan con los cobros reales.

## Detalles técnicos
- Usar tablas de solicitudes, catálogo y permisos de terminales separadas de `profiles` y de los niveles financieros existentes. Validar administración en el servidor mediante los roles protegidos actuales.
- Revisar políticas y privilegios existentes antes de la migración. Cada tabla nueva tendrá permisos explícitos y protección por usuario/comercio; solo administración podrá emitir o revocar invitaciones.
- Actualizar las funciones reales `qard_aplicar_recarga` y `qard_verificar_sub_qr`, preservando indicadores de activación pagada y usando bloqueos e idempotencia para impedir cobros duplicados.
- Implementar recargas por comercio y su reparto mediante una operación transaccional; no usar escrituras financieras independientes desde el teléfono.
- Conservar etiquetas centralizadas en `qardEtiquetas`, no editar tipos generados de Supabase y no alterar funciones de transporte.
- Registrar las decisiones estructurales en `AGENTS.md` y mantener la lista de tareas actualizada.

## Comprobaciones y pendientes
- Pruebas con valores concretos: $150 principal, $100 sub-QR, $15 por recarga, reparto $5/$10, activación pagada no repetida, nivel 1 obligatorio y rechazo por CURP repetida, fondos insuficientes y operación duplicada.
- Comprobar invitación propia, rechazo de invitación ajena, revocación y bloqueo de operaciones con solicitud pendiente.
- Revisar pantalla de perfil, importes, saldos y movimientos después de cada operación. No ejecutar cargos ni consultas pagadas en cuentas reales sin autorización.
- **Bloqueado por proveedor:** activación de nivel tres y pagos de servicios. Sus solicitudes y terminales se preparan, pero no operan.
- **Comprobación autenticada:** este Supabase externo no permite obtener una sesión de prueba desde el asistente; reportar cualquier recorrido real que no pueda verificarse.