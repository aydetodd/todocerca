# TCB: diseño para pagos entre teléfonos

Estado: formato y bóveda nativa implementados, sin activar en cuentas ni pagos. La preparación de Capacitor no habilita cobros sin conexión ni reemplaza las tarjetas impresas actuales. TCB usará teléfonos en ambos extremos; los lectores de transporte permanecen fuera del protocolo.

### Avance: formato cifrado aislado

`src/lib/tcbCodec.ts` implementa un formato binario de 139 bytes: cabecera TCB/version y nonce aleatorio de 12 bytes, contenido fijo de 106 bytes y etiqueta AES-256-GCM de 16 bytes. El contenido contiene versión, identificador de 16 dígitos, centavos, instante UTC en milisegundos, secuencia y dos hashes SHA-256. La cabecera también se autentica. Los enteros se codifican big-endian y se restringen al rango entero seguro; el hash se calcula sobre los primeros 74 bytes del contenido, con codificación fija.

El codec aislado no crea llaves, archivos en dispositivos, controles en tarjetas ni movimientos. Recibe una llave no exportable proporcionada por el llamador: esa propiedad Web Crypto NO acredita protección por Keystore/Keychain. La bóveda nativa descrita abajo cifra sin pasar llaves a JavaScript. La comparación de sucesores exige un punto anterior confiable y no impide que un teléfono manipulado presente una copia antigua completa. El cifrado protege integridad/confidencialidad, no acredita saldo.

Pruebas locales: ida y vuelta exacta en centavos, nonce distinto, alteración de cada byte, llaves/tarjetas incorrectas, tamaño, campos inválidos y secuencia contra un punto de referencia. Las pruebas del coordinador usan un adaptador en memoria exclusivamente en tests; no acreditan funcionamiento nativo. Compilación nativa, persistencia atómica ante cierre, recuperación, sincronización real y pruebas en teléfonos siguen pendientes.

### Avance: bóveda nativa y coordinación del respaldo

`plugins/tcb-vault` es un plugin local Capacitor 7 para Android/iPhone, instalado como dependencia del proyecto. No usa servidor adicional ni servicios de pago.

- Android: AES-256-GCM con llave no exportable de Android Keystore, IV generado por Keystore, archivo en `noBackupFilesDir` y actualización recuperable con `AtomicFile`. No se afirma que todos los teléfonos tengan respaldo de hardware.
- iPhone: AES-256-GCM con CryptoKit, llave de 32 bytes en Keychain `WhenUnlockedThisDeviceOnly` sin sincronización iCloud, Application Support excluido de copias, protección completa del archivo y reemplazo atómico. La llave pasa por memoria nativa para cifrar; **no** es una llave AES no exportable de Secure Enclave.
- En ambos: archivo `[16 dígitos].tcb` de 139 bytes, mismo formato que el codec, una carpeta por hash de cuenta/proyecto y una llave por tarjeta. Lectura ausente devuelve `null`; corrupción o llave perdida fallan sin regenerar sobre el archivo. Los errores no incluyen identificadores, saldos ni rutas.
- Cada escritura verifica hash anterior, secuencia, fecha y tarjeta dentro del código nativo; serializa operaciones, rechaza conflictos y vuelve a leer antes de confirmar. Esto evita sobrescrituras accidentales, **no** restauraciones maliciosas ni falsificación por un dispositivo comprometido.
- `src/lib/tcbBackup.ts` coordina snapshots confirmados por el servidor, reintentos idempotentes, separación de saldos y cierre de sesión. No crea cargos, reserva fondos ni transmite datos. El contexto de cuenta delimita archivos, no sustituye autorización del servidor.
- `src/lib/tcbNative.ts` solo permite crear el coordinador desde la aplicación nativa empaquetada en origen local con plugin disponible, sin alternativa web/PWA. El constructor no se monta en pantallas actuales: no se muestran archivos ficticios.

**Pendiente antes de conectar a QaRd:** punto de referencia ordenado y fecha confirmados por el servidor para cada saldo emitido, recuperación de conflictos desde ese punto, vinculación al ciclo de sesión y prueba Android/iPhone con reinicio, fallo de escritura, bloqueo, reinstalación, cambio de cuenta y ausencia de llaves. No usar la hora del teléfono ni el orden de llegada de Realtime como secuencia financiera. La bóveda no es una aprobación de seguridad ni una activación del pago offline.

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