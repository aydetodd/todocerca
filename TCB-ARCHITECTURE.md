# TCB: diseño para pagos entre teléfonos

Estado: diseño, no operativo. La preparación de Capacitor no habilita cobros sin conexión ni reemplaza las tarjetas impresas actuales. TCB usará teléfonos en ambos extremos; los lectores de transporte permanecen fuera del protocolo.

## 1. Respaldo local

Un archivo binario cifrado por tarjeta emitida, llamado exactamente `[16 dígitos].tcb`, en almacenamiento privado persistente de la aplicación, nunca caché, descargas ni almacenamiento del navegador. No ofrecer apertura ni exportación. El nombre contiene un identificador sensible: excluirlo de registros y copias de seguridad públicas.

La llave deberá estar protegida por Android Keystore/iOS Keychain con capacidades reales verificadas en cada dispositivo. No guardar llave y archivo juntos ni asumir que Capacitor por sí solo proporciona una bóveda segura. Un teléfono comprometido sigue siendo un riesgo.

Contenido propuesto: versión, identificador de tarjeta, saldo confirmado en centavos, fecha, secuencia, hash anterior y hash actual. Cifrado autenticado con nonce único por escritura y actualización atómica recuperable tras cierre inesperado. La cadena de hashes detecta cambios solo si su punto de referencia es confiable: no acredita fondos ni hace un historial infalsificable.

## 2. Movimientos con conexión

El libro del servidor permanece como autoridad. Después de confirmar una operación, actualizar el respaldo local mediante eventos ordenados, idempotentes y reconciliables. Si falta un evento o falla la escritura, marcar respaldo no vigente y recuperar desde el servidor; no revertir ni duplicar el cobro por un fallo local. No interceptar ni reducir la sincronización actual.

## 3. Preparación del saldo sin conexión

Requiere una nueva reserva atómica del servidor, separada por Personal/Empresarial/Familiar y excluida del dinero gastable por internet. El servidor emitiría una autorización firmada limitada por tarjeta, dispositivo, importe y vigencia. El comercio recibiría solo la información mínima necesaria para verificar el pago, no el saldo total. No transmitir el archivo completo como QR: revelar el historial o el saldo no es necesario para cobrar.

Antes de implementar, definir límites y quién cubre pérdidas. Una reserva limita exposición, pero no elimina copias, retrocesos del estado local o gasto de una misma autorización en comercios distintos.

## 4. Intercambio sin internet

1. El teléfono del comercio presenta importe, identificador de terminal y reto único.
2. El pagador confirma explícitamente y autoriza el pago desde su teléfono. No eliminar la exigencia vigente de QR y CVV-3; cualquier sustitución requiere una decisión expresa y revisión de seguridad. Nunca incluir CVV en comprobantes o archivos.
3. El pagador entrega una autorización firmada vinculada al reto, importe y destinatario, mediante QR estándar con carga protegida para ese destinatario.
4. El comercio valida localmente las firmas y registra un recibo; devuelve confirmación para actualizar el teléfono del pagador. Reintentos usan el mismo identificador de operación.

La ausencia del último recibo deja una operación por reconciliar, no autoriza volver a gastar el importe. Los avisos mostrarán pago pendiente de comprobación, nunca pago definitivo garantizado. No habilitar circulación sucesiva del dinero recibido sin conexión antes de liquidarlo: eso propagaría la exposición a duplicados.

## 5. Regreso de internet y recuperación

Ambos participantes envían comprobantes para validación y liquidación atómicas e idempotentes. Detectar duplicados y conflictos; un pago disputado no se acredita como definitivo por decisión del teléfono. El saldo disponible se lee nuevamente del servidor.

Definir recuperación por teléfono perdido, reinstalación y reserva vencida: no liberar automáticamente dinero posiblemente gastado sin conexión. Los relojes locales y el plazo por sí solos no prueban que no existan comprobantes pendientes.

## 6. Acceso en las tarjetas

Solo después de existir un respaldo real, el icono de disquete mostrará su nombre y estado confirmado. No presentar un archivo ficticio, una promesa de seguridad absoluta ni activarlo solo por detectar falta de internet. Las tarjetas sin emitir no tendrán bóveda ni controles.

## Condiciones antes de activar

- Definir límites, vigencia, responsabilidad comercial y recuperación.
- Validar llaves y almacenamiento privado en Android/iPhone reales.
- Probar manipulación, repetición, restauración de copias, dos comercios, fallo entre cada paso y pérdida de teléfono.
- Revisar seguridad independiente y conciliación al centavo antes de mover fondos reales.
- Mantener las entradas financieras actuales cerradas a datos `.tcb`; la implementación futura requiere funciones de servidor específicas y sus pruebas.