# Productos estándar sin fotos
## Guía fiscal de solo lectura
- [x] Retirar expediente, checklist y almacenamiento del módulo; sustituir por cuatro pasos y beneficios con enlaces oficiales. Tablas y documentos históricos quedan ignorados, sin lecturas ni escrituras de la guía; e.firma y terminales intactas.
- [x] Comprobar guía pública en 1280/390/320px, cuatro pasos y cuatro beneficios, sin formularios, solicitudes fiscales, desbordamiento ni errores; prueba de aislamiento correcta. Referencias web y PDF actualizadas; 23 páginas revisadas y compilación correcta. Accesos privados existentes conservados; sesión externa no disponible para probarlos.
- [ ] Publicación pausada por decisión de Martín: ocho avisos críticos previos; revisión profunda solicitada antes de publicar.
## Consulta pública de colectivos
- [x] Permitir búsqueda y mapa de colectivos desde la landing sin registro mediante consultas públicas existentes, sin ampliar permisos; corregir filtro que descartaba productos distintos de la misma ruta y sembrar el mapa de ubicaciones para actualizaciones inmediatas.
- [x] Comprobar portada → Buscar transporte → Ver mapa sin sesión: dos unidades reales, siete pruebas, móvil sin desbordamiento y sin errores. Consultas actualizadas cada tres segundos; no se observó cambio de coordenadas durante la comprobación, por lo que desplazamiento real sigue sin comprobar. Falta Publicar → Actualizar.
## Desglose empresarial conciliado
- [x] Presentar sucursales e importes en filas desplegables como el dibujo de Martín, terminales indentadas y registros reales sin cobros a cero; nueve pruebas correctas y compilación correcta. Vista en cuenta real no comprobada: sesión externa no disponible.
- [x] Mostrar cobros reales por periodo, sucursal y terminal con sumas exactas en centavos, saldo disponible separado y movimientos sin asignación identificados; nombres guardados por registro y captura de identidad en nuevos cobros.
- [x] Validar conciliación con datos reales: libro y recibos coinciden en 2 cobros por $1,360.44; 35 pruebas correctas, incluyendo diferencias de un centavo.
- [ ] Verificar despliegue y expansión desde la cuenta real: sesión Supabase externa no disponible para el asistente.
## Gestión empresarial de sucursales y terminales
- [x] Unificar sucursales, invitaciones e interruptores en Gestionar mi empresa; retirar gestión del perfil personal y redirigir enlaces antiguos.
- [x] Registrar el mismo teléfono por sucursal; mostrar controles por registro, cambiar automáticamente la terminal activa y preservar sucursal ante triggers. Eliminación de registro inactivo no afecta otra sucursal.
- [ ] Comprobar invitación y cambio de terminal en cuenta real: sesión externa no disponible; acceso local lleva a iniciar sesión.
## QaRd: pruebas de usuario del 7 noviembre
- [x] Separar saldo empresarial y personal en terminales, pagos y estados de cuenta; instantánea de terminal solo devuelve fondos empresariales, espejo tarjeta 01 y libros coherentes.
- [x] CVV-3 para ambos pagos con QR; CVV-4 obligatorio y rotativo para transferencias recibidas, sin revelar el nuevo código al remitente.
- [x] Carpetas expandibles en QaRd y confirmación e.firma persistente antes de regresar; actualizar identidad y tarjeta sin desmontar el mensaje.
- [x] Terminales con activación exclusiva por teléfono, eliminación confirmada e invitación WhatsApp/app; aceptación no reemplaza una terminal activa.
- [x] Apagar Empresarial de Martín para revalidación sin borrar saldos; consulta confirmó Empresarial $0.00, Personal $2,687.06 y estado revalidation. 44 pruebas correctas y compilación correcta.
- [ ] Probar pagos, terminales, coincidencia RFC y presentación móvil con sesión/documentos reales: Supabase externo sin sesión disponible; la visita local no mostró la pantalla privada. No se ejecutaron pagos reales ni se provocó un error artificial.
- [ ] Revisar avisos de seguridad anteriores a esta petición (354 hallazgos): fuera del alcance de estos cambios.
## Comparativa pública
- [x] Rediseñar /comparativa como presentación ejecutiva con siete infografías, iconos SVG propios, niveles, costos, seguridad local y matriz; texto compartido y PDF conservados. Siete acordeones, 23 bloques, tooltips y descarga comprobados; escritorio y móviles de 390/320px sin desbordamiento ni errores. Falta Publicar → Actualizar.
- [x] Rediseñar PDF sin eliminar texto: portada de la web, colores, iconos vectoriales, siete tablas y balance visual; 23 páginas carta revisadas, 86 párrafos/resúmenes/URLs conservados y descarga pública comprobada. Corregidos párrafos partidos, títulos aislados y fondo final que invadía el pie; requiere Publicar → Actualizar para el dominio público.
- [x] Crear /comparativa fuera de la aplicación privada, sin registro, con enlace público «¿Por qué TodoCerca?», siete secciones detalladas y fuentes; propuestas separadas de servicios activos.
- [x] Descargar PDF carta completo de ocho páginas, comprobar texto y descarga pública, acordeones y ancho de 390 px sin desbordamiento.
- [x] Portada: título completo «Conectamos con tu comunidad», enlace «¿Por qué elegir TodoCerca?» subrayado arriba y abajo con «Comparativa», pie con © 2026; header móvil en dos filas sin encimarse, comprobado en 390px y escritorio.
- [ ] Publicar la comparativa: la preferencia del proyecto deshabilita la publicación desde el asistente; Martín debe usar Publicar → Actualizar.
## Registro de comercio con e.firma
- [x] Sustituir formulario de terminales INE/selfie por RFC, constancia PDF, certificado .cer, llave .key y contraseña; cotejo local sin envío ni persistencia, seis pruebas de reglas y 31 pruebas totales correctas. Se conserva aprobación pendiente, sin crear solicitudes locales.
- [x] Validación local completa de e.firma con aprobación de Nivel 3 (Martín, 6 nov 2026): pasos A–E con vigencia, PDF opcional, alertas de vencimiento (90/30/7 días y gracia 60), guarda solo RFC/nombre/vencimiento/efirma_validada en terminal_agent_requests (migración aplicada), try/catch con console.log por paso, fallo conserva archivos y RFC (solo limpia contraseña), botón «Cotejando documentos…»; 33 pruebas correctas y compilación sin errores. Pendiente: probar con e.firma real de Martín.
- [x] SEO: única falla era el sitemap; creado con generador (predev/prebuild), 3 rutas públicas, directiva en robots.txt, HTTP 200 comprobado y hallazgo marcado como corregido. Falta Publicar → Actualizar para que llegue al dominio.
- [ ] Comprobar registro con documentos y sesión reales; no disponibles en el proyecto externo.
## Accesos por tarjeta QaRd
- [x] Colocar estado principal y estado empresarial de cobros en sus respectivas tarjetas, mover aumento a nivel 2 junto al saldo principal y mostrar CVV dinámico empresarial real; tres pruebas del libro correctas e iconos verificados a 375 px sin desbordamiento, sin cambiar saldos ni transporte.
- [ ] Comprobar estados de cuenta y CVV empresarial desde la cuenta real: Supabase externo sin sesión autenticada disponible.
## Motor de Formalización y Cumplimiento
- [x] Fase 1: guía RESICO y expediente fiscal privado del comercio en ambas entradas de Mi Perfil, con evidencia privada y avance sincronizado; 25 pruebas correctas y compilación sin errores, sin cobros ni transporte.
- [ ] Probar guardado, confirmación y documentos de fase 1 desde el perfil real: Supabase externo sin sesión autenticada disponible.
- [x] Proponer estructura de datos y pantallas para RESICO, facturación, asistencia y nómina; sin activar cobros ni modificar transporte. Martín confirmó que al superar 15 minutos se cuenta toda la diferencia (08:16 = 16 minutos); marcas anticipadas y descansos pendientes antes de implementar nómina.
## Confirmación de identidad
- [x] Mostrar y conservar resultados reales de CURP, INE y RFC con confirmación antes de continuar; consultas desplegadas y 25 pruebas correctas.
- [ ] Comprobar el flujo completo y registrar a Martín: su sesión externa y documentos no están disponibles para el asistente; nuevo nivel tres con e.firma espera validación oficial SAT. Página pública sin errores, compilación correcta.
## Terminales digitales
- [x] Revisar bloqueos en datos reales: City traffic pendiente de CURP/RFC/biometría y sin invitaciones; cobro atómico abona saldo_comercio_mxn del dueño, no del operador. Tarjeta Empresarial presenta saldo_mxn de otra bolsa; no se ejecutaron cobros ni consultas Verificamex.
- [ ] Unificar presentación de saldo y uso de cuenta Empresarial con el libro de cobros, completar enlace entre confirmaciones y solicitud de agente y registros visibles por negocio; comprobación autenticada depende de sesión externa, biometría depende de proveedor real.
- [ ] Después del funcionamiento de terminales, mostrar solo datos importantes reales para cotejar CURP/INE/RFC, sin metadatos técnicos ni consultas repetidas.
- [x] Quitar cobro directo de Mi dinero y conservar entrada por terminal invitada; acceso antiguo redirige al perfil y cobro solicita modo terminal. 22 pruebas correctas; comprobación autenticada sigue pendiente por sesión externa no disponible.
- [x] Aplicar terminales por invitación en perfil personal con solicitud de agente pendiente sin biometría real.
- [x] Cambiar recargas a $15, activación principal a $150 y sub-QR a $100 con CURP/nivel 1; preservar activaciones ya pagadas y transporte.
- [x] Mantener servicios pendientes sin proveedor y registrar operaciones y reparto en libro inmutable; pruebas de precios y permisos correctas.
- [x] Cambiar invitaciones de terminal a por teléfono hechas por el dueño del comercio (como con chóferes): tabla de invitaciones, enlace/token, aceptación, revocación y dinero a nombre del negocio; 22 pruebas correctas.
- [ ] Validar cobro, recarga, invitación y aceptación desde cuentas reales: Supabase externo sin sesión autenticada disponible.
- [ ] Habilitar nivel tres y servicios: falta validación oficial SAT de e.firma y acreditación del comercio; servicios esperan proveedor contratado.

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
