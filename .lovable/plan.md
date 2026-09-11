# Desglose de comisiones en el estado de cuenta

## Resultado
- Sustituir el movimiento histórico de **“ajuste -$25.00”** por dos renglones: **“Comisión por apertura de cuenta -$20.00”** y **“Comisión por recarga -$5.00”**.
- Para futuras primeras recargas, mostrar el importe original de la recarga y ambos cobros por separado, conservando exactamente el mismo saldo final.
- Para recargas posteriores, mostrar únicamente **“Comisión por recarga -$5.00”**.
- Eliminar la palabra “ajuste” de los conceptos visibles y de la descarga CSV del estado de cuenta.

## Implementación técnica
- Convertir los datos reales de cada recarga en renglones visuales de recarga y comisión usando el desglose ya guardado en sus metadatos; no se crearán tablas ni se modificarán saldos.
- Reconocer el movimiento retroactivo existente de $25 y dividirlo visualmente en $20 y $5.
- Calcular el saldo corrido después de crear esos renglones para que cada saldo y el saldo inicial sigan cuadrando.
- Verificar la vista móvil, la descarga CSV y el estado de compilación.
