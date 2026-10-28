# Productos estándar sin fotos
## Motor de Formalización y Cumplimiento
- [x] Proponer estructura de datos y pantallas para RESICO, facturación, asistencia y nómina; propuesta entregada sin activar cobros ni modificar transporte. Cómputo al superar 15 minutos pendiente de decisión antes de implementar.
## Confirmación de identidad
- [x] Mostrar y conservar resultados reales de CURP, INE y RFC con confirmación antes de continuar; consultas desplegadas y 25 pruebas correctas.
- [ ] Comprobar el flujo completo y registrar a Martín: su sesión externa y documentos no están disponibles para el asistente; nivel tres requiere biometría real. Página pública sin errores, compilación correcta.
## Terminales digitales
- [x] Aplicar terminales por invitación en perfil personal con solicitud de agente pendiente sin biometría real.
- [x] Cambiar recargas a $15, activación principal a $150 y sub-QR a $100 con CURP/nivel 1; preservar activaciones ya pagadas y transporte.
- [x] Mantener servicios pendientes sin proveedor y registrar operaciones y reparto en libro inmutable; pruebas de precios y permisos correctas.
- [x] Cambiar invitaciones de terminal a por teléfono hechas por el dueño del comercio (como con chóferes): tabla de invitaciones, enlace/token, aceptación, revocación y dinero a nombre del negocio; 22 pruebas correctas.
- [ ] Validar cobro, recarga, invitación y aceptación desde cuentas reales: Supabase externo sin sesión autenticada disponible.
- [ ] Habilitar nivel tres y servicios: faltan proveedor biométrico real y proveedor de pagos de servicios contratado.

- [x] Filtrar gestión personal de Fletes por tipo registrado: transportistas solo unidades y remitentes solo cargas; búsqueda de contraparte conservada, doce pruebas correctas y compilación sin errores. Comprobación en cuenta real pendiente por sesión externa no disponible.
- [x] Separar gestión de Fletes en perfil personal y búsqueda por renglones con destinos y características compatibles; nueve pruebas de reglas y acceso público correctos, sin errores de compilación. Publicación y coincidencias entre cuentas reales pendientes por Supabase externo sin sesión disponible.
- [x] Corregir registro persistido y permisos de Fletes: transportistas solo ven cargas y remitentes solo transportistas; enlaces no cambian el tipo, anuncios propios conservados y sincronización activa.
- [ ] Probar registro y búsqueda de Fletes con transportista/remitente reales: Supabase externo sin sesión autenticada disponible.
- [x] Incluir el medidor en el apartado Perfil del panel de usuario mostrado por Martín, sin condiciones de rol; compilación correcta. Prueba autenticada pendiente por sesión externa no disponible.
- [x] Agregar icono de consumo estimado diario/mensual en perfil personal: descargas reales, persistencia, agrupación y diálogo en teléfono verificados; sin errores ni cambios al tiempo real.
- [ ] Probar el acceso al medidor desde un perfil autenticado: Supabase externo sin sesión disponible; contador y diálogo probados por separado.
- [x] Mover Fletes al perfil personal y Testigo a la barra inferior, con acceso a mapa e información de trazabilidad; inicio sin accesos anteriores verificado y sin errores.
- [ ] Probar apertura de Testigo y Fletes desde el perfil real: Supabase externo sin sesión autenticada disponible.
- [x] Ajustar proporción bancaria, datos en una fila y controles externos de tarjetas principales y familiares; proporción 320/375/escritorio, controles y descarga PDF verificados sin datos personales.
- [x] Simplificar tarjetas, proteger titular y representar niveles guardados con rayas; pruebas visuales 320/375/escritorio y PDF con tarjetas inactivas excluidas correctas.
- [x] Agregar interruptor principal y tarjetas familiares con estado gris/color; prueba visual gris/color y ancho de teléfono correcta, sin alterar saldos ni comisiones.
- [ ] Verificar desbloqueo guardado con la cuenta real: Supabase externo sin sesión autenticada disponible.
- [x] Recuperar mapa y trazos de Trazado / Segmentación en Urbanas, Foráneas y Taxi Colectivo; carga demorada y controles verificados en prueba aislada.
- [ ] Comprobar Trazado / Segmentación con rutas de la cuenta real: Supabase externo sin sesión autenticada disponible.
- [x] Agrandar y dar color a los botones de aforo; probar respuesta inmediata, toques rápidos, límites y recuperación ante fallos.
- [x] Unificar etiquetas de transporte y separar Favoritos y Mi dinero por tipo de ruta; comprobar grupos, importes intactos y páginas sin errores.
- [ ] Revisar Favoritos y Mi dinero con cuenta real: Supabase externo sin sesión autenticada disponible.
- [x] Mostrar aforo vivo también en el mapa de búsqueda y agrandar globo y controles del chofer.
- [ ] Verificar cambio de aforo entre dos cuentas reales: Supabase externo sin sesión autenticada disponible.
- [x] Abrir el lector QaRd de Foráneo también en Urbano y Taxi Colectivo, respetando el tipo del chofer.
- [ ] Verificar un cobro real en Urbano y Taxi Colectivo: Supabase externo sin sesión autenticada disponible.
- [x] Corregir aislamiento de rutas y unidades en invitaciones y perfiles de chofer Taxi Colectivo.
- [x] Verificar filtros por tipo y aceptación guardada en datos reales.
- [ ] Probar selección y activación con la cuenta de Martin: Supabase externo sin sesión autenticada disponible.
- [x] Quitar foto de creación y edición estándar, conservando flujos especiales.
- [x] Mostrar tarjetas de gestión con nombre, precio, descripción, stock, estado y acciones.
- [x] Quitar imágenes estándar del catálogo público y búsqueda; conservar carrito y WhatsApp.
- [x] Verificar apertura de búsqueda sin errores y compilación correcta.
- [ ] Probar creación/edición con una cuenta real: sesión autenticada no disponible en este proyecto externo.
- [ ] Publicar: la configuración impide publicar desde el asistente; requiere Publicar → Actualizar del usuario.# Fletes
- [x] Etapa 1: registro con RFC (Verificamex SAT), categoría, formularios, Mis Disponibles, circuito cerrado, WhatsApp, apagado a 30 días.
- [ ] Etapa 2: Rastreo Efímero $100 y calificaciones bidireccionales — espera confirmación de Martín.
- [ ] Probar Fletes con cuenta real: Supabase externo sin sesión autenticada disponible.
