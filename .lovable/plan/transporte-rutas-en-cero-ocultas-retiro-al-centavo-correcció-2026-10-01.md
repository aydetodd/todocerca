# Transporte: rutas en cero ocultas, retiro al centavo, corrección de ayer y cierre a las 23:59

## Lo que encontré
- **Por qué el pasajero de ayer cobró $0.00:** el cierre automático busca el precio solo en la tabla de tramos (A→B), y Ruta 3 no tiene tramos. El cobro al bajar sí busca después el precio de la geocerca, por eso ese cobró $9. El cierre automático no hace esa segunda búsqueda.
- **El cierre corre a las 00:05**, no a las 23:59, y solo cierra viajes de días anteriores.
- **El retiro elige cobros completos, de menor a mayor.** Por eso rechaza $4 cuando el cobro más chico es de $9.
- **El panel dice SPEI 3%** y el servidor cobra 3%. "Mis cobros" ya dice 2%.

## Qué voy a hacer
1. **"Mi dinero":** escondo las rutas con $0.00 y sin pasajeros en stand. Si ninguna tiene dinero, escondo el grupo completo. Agrego un enlace discreto "Ver todas las rutas" que muestra todas, también las de $0, para revisión.
2. **Retiro al centavo:** acepto cualquier monto desde $0.01 hasta todo lo disponible. Se pagan los cobros del más viejo al más nuevo. El último que no alcance queda pagado en parte, y su resto sigue pendiente. El botón "Todo" paga todo exacto. Nuevo texto en el aviso: "Se pagan los viajes en orden; el último que no alcance queda pendiente por el resto."
3. **Corrección de ayer, una sola vez:** cobro hoy $9.00 al pasajero con un renglón nuevo, "Cobro automático por bajada sin QR · Ruta 3". No cambio nada del historial. Su viaje queda en $9.00, el pozo de Ruta 3 sube a $18.00 y le llega un mensaje al buzón. Si no tiene saldo, no le cobro: lo marco "sin saldo" y lo muestro aparte como pendiente, sin sumarlo al pozo.
4. **Cierre de cada noche:** corre a las 23:59 hora de Sonora. Cada viaje se cierra una sola vez; si el cierre corre tarde, cierra todo lo pendiente sin cobrar dos veces. A cada pasajero en stand le cobra su tarifa: el precio del tramo A→B si existe; si no, el precio de la geocerca, como hace el cobro al bajar. Le escribe un renglón con nombre claro en su cuenta, suma el dinero al pozo de la ruta y le manda este mensaje: "Se aplicó cobro automático de $X porque no mostraste tu QR al bajar en Ruta Y. Si crees que es un error, dispútalo dentro de 48 horas." Si no tiene saldo, queda "sin saldo", aparte y con su aviso en la fila de la ruta.
5. **Mismos números en todos lados:** el "Bruto por cobrar" del panel y "Mi dinero" toman los mismos últimos 60 días, sin importar el periodo elegido en el panel. Los contadores dirán "N aplicados · M por aplicar al cierre". Todas las pantallas dirán "SPEI 2%, retiro mínimo $500".

## Necesito tu OK en esto
- **SPEI 2% sí toca comisiones:** hoy el servidor cobra 3% en el retiro de viajes. Para que el texto diga la verdad, lo bajo a 2% y pongo el mínimo de $500. Hoy SPEI está apagado ("Muy pronto"), así que nadie paga esa comisión todavía.
- **El cobro de las 23:59 sí cambia el transporte de noche**, pero no el de día: el cobro al subir y bajar no cambia.

## Pruebas
- Retiro de $4 con pozo de $9: se acepta. El viaje más viejo queda con $5 pendientes, el pozo baja exactamente $4 y tu cuenta eje sube $4.
- "Mi dinero" sin rutas en cero y con el enlace "Ver todas".
- Corrección de ayer: renglón −$9.00 con su nombre en la cuenta del pasajero, y Ruta 3 en $18.00 antes de la prueba de hoy.
- Prueba de hoy, con un cobro al bajar y un pasajero en stand: al cierre se cobra su tarifa, le llega el mensaje, sale su renglón en su cuenta y el viaje muestra 2 cobros aplicados con el importe completo.

## Detalles técnicos
- Migración: `pagado_mxn numeric default 0` en `qard_viajes_pasajero` y `cobros_qr_tramo`. "Pendiente" = monto − pagado; `retirado_at` se marca cuando pagado = monto. Nuevo estado `auto_cerrado_sin_saldo`.
- `tg_auto_cerrar_standbys` reescrita: precio = máximo de `ruta_tarifas_tramo` desde la geocerca de subida; si no hay, precio de `unidad_geocercas_cobro` de esa geocerca. Revisa el saldo con la misma regla del escaneo (cuenta principal hasta −$50, sub-QR hasta $0) y cobra de la sub-QR cuando toca. Escribe un movimiento `cobro_comercio` con nombre claro y mensaje al buzón. Para cerrar una sola vez: `UPDATE ... WHERE estado='abierto' RETURNING`.
- Corrección de ayer: se hace con datos (renglón nuevo y mensaje), no se edita ningún movimiento viejo; el candado del historial queda igual.
- Cron `close-overnight-trips-daily` → `59 6 * * *` (UTC = 23:59 de Sonora). La función cierra viajes `en_curso` con fecha ≤ hoy en Sonora.
- `retirar-viajes-concesionario`: elige del más viejo al más nuevo y paga parcial; SPEI 0.02 con mínimo de $500 en el servidor y en la pantalla.
- `ReporteViajes` y `useIngresosTransporte` comparten una función de 60 días para el pozo.
