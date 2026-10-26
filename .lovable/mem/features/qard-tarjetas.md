---
name: QaRd tarjetas y numeración
description: Interruptor principal y tarjetas familiares; gris apagada, colores encendida. Terminación 01 reservada a QaRd Empresarial; familiares desde 02
type: feature
---

- Interruptor principal y tarjetas familiares: gris cuando están apagadas, colores cuando están encendidas.
- **Numeración (terminación de los 16 dígitos)**: 00 = titular principal; **01 = QaRd Empresarial (Nivel 3), reservada exclusivamente**; sub-QaRd familiares empiezan en **02** y siguen 03, 04… hasta 99. Regla forzada en base de datos (CHECK en qard_sub_qr + columna `tipo` familiar/empresarial).
- **QaRd Empresarial**: se crea sola cuando se aprueba la cuenta de Comerciante/Persona Moral (`qard_identidad.estado = 'moral_approved'`, función `qard_ensure_empresarial` + trigger). Diseño: gradiente azul marino `#1E3A5F → #2C5F7C` con acentos dorados, etiqueta solo "EMPRESARIAL" (sin iconos), gris cuando inactiva. Nivel 3, sin biometría automática.
