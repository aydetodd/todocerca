export type ComparisonBlock = { title: string; paragraphs: string[] };
export type ComparisonSection = { id: string; title: string; summary: string; blocks: ComparisonBlock[]; sources: string[] };
export const comparisonSources = [
  { id: 'pix', label: 'Banco Central do Brasil · Pix', url: 'https://www.bcb.gov.br/estabilidadefinanceira/pix' },
  { id: 'pix-faq', label: 'Banco Central do Brasil · preguntas sobre Pix', url: 'https://www.bcb.gov.br/meubc/faqs/s/pix' },
  { id: 'wechat', label: 'Tencent · Weixin Pay para visitantes internacionales', url: 'https://www.tencent.com/en-us/articles/2201793.html' },
  { id: 'privacy', label: 'WeChat · política de privacidad', url: 'https://www.wechat.com/en/privacy_policy.html' },
  { id: 'isr', label: 'Cámara de Diputados · Ley del ISR, artículos 113-E y siguientes', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf' },
  { id: 'iva', label: 'Cámara de Diputados · Ley del IVA, artículo 15, fracción V', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf' },
  { id: 'sat', label: 'SAT · trámites fiscales y constancia', url: 'https://www.sat.gob.mx/portal/public/tramites' },
  { id: 'pac', label: 'SAT · proveedores autorizados de certificación', url: 'https://www.sat.gob.mx/consultas/76969/proveedores-autorizados-de-certificacion-(pac)' },
  { id: 'ocsp', label: 'Gobierno de México · requisitos de uso de OCSP del SAT', url: 'https://www.gob.mx/cms/uploads/attachment/file/36607/ANEXO-UNICO_Req-de-uso-de-OCSP.pdf' },
  { id: 'udi', label: 'Banco de México · valor de la UDI', url: 'https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=8&accion=consultarCuadro&idCuadro=CP150&locale=es' },
];
export const comparisonSections: ComparisonSection[] = [
  {
    id: 'respaldo', title: 'Filosofía y respaldo', summary: 'Una plataforma local, una infraestructura nacional y un ecosistema corporativo no son el mismo producto.', sources: ['pix', 'wechat'],
    blocks: [
      {title:'TodoCerca · comunidad y trazabilidad',paragraphs:[
        'TodoCerca es un proyecto mexicano que conecta movilidad, saldo QaRd y operación de negocios. Su propuesta es resolver tareas cotidianas en una misma experiencia: encontrar una ruta, pagar, consultar movimientos y administrar equipos por invitación.',
        'El libro propio separa cuenta principal, tarjetas adicionales, cobros y rutas. Los movimientos financieros se protegen contra cambios ordinarios y las operaciones de terminal buscan evitar cargos duplicados mediante transacciones atómicas. Esto ofrece trazabilidad; no equivale por sí mismo a una auditoría independiente, una garantía de depósitos ni una autorización financiera.',
        'El documento de visión propone una bóveda respaldada por Transfer.com. No se ha acreditado aquí un contrato operativo, la entidad regulada concreta ni su alcance. Por eso no se anuncia custodia regulada de Transfer.com como una integración disponible. Antes de ofrecerla debe identificarse quién custodia los fondos, con qué autorización y qué derechos tiene el usuario.',
      ]},
      {title:'Pix · infraestructura pública interoperable',paragraphs:[
        'Pix es un esquema de pagos instantáneos creado por el Banco Central do Brasil. Permite transferencias entre instituciones participantes; no es una aplicación única ni una cuenta del banco central abierta para cada persona.',
        'Su fortaleza es la interoperabilidad: distintos bancos y entidades de pago comparten un riel. El respaldo institucional no elimina riesgos de fraude, engaños al usuario o problemas operativos.',
      ]},
      {title:'WeChat Pay / Weixin Pay · escala corporativa',paragraphs:[
        'El sistema de pagos de Tencent se integra con mensajería, comercios y servicios de WeChat/Weixin. Su alcance se explica por un ecosistema consolidado, no por ser una moneda emitida por el banco central.',
        'La comparación distingue el riel de Pix, el módulo de pagos de Tencent y la plataforma completa de TodoCerca. Atribuir al módulo de pagos todas las capacidades o limitaciones de cada ecosistema produciría una comparación injusta.',
      ]},
    ],
  },
  {
    id:'inclusion',title:'Barrera de entrada e inclusión',summary:'Reducir requisitos ayuda; los niveles y sus límites deben describirse sin prometer derechos bancarios inexistentes.',sources:['pix-faq','wechat','udi'],
    blocks:[
      {title:'TodoCerca · niveles de la propuesta QaRd',paragraphs:[
        'Nivel 1: validación de CURP para la identidad básica de QaRd. El límite anunciado en el proyecto es de hasta 1,000 UDIS mensuales, sujeto al tipo de operación y controles vigentes. La CURP facilita identificación, pero no sustituye todos los requisitos legales de una cuenta financiera.',
        'Nivel 2: CURP y lectura de INE, con cotejo de datos y confirmación explícita antes de continuar. La interfaz contempla hasta 3,000 UDIS. Leer una imagen no demuestra prueba de vida y no se presenta como biometría. Las tarjetas adicionales tienen sus propias reglas: su activación por CURP no las convierte automáticamente en Nivel 2.',
        'Nivel 3 empresarial: RFC, constancia fiscal y cotejo local de certificado/llave de e.firma, sin pedir selfie en el nuevo formulario. La aprobación automática no está habilitada: falta comprobar autenticidad y no revocación con SAT desde un proceso protegido. No se anuncian operaciones ilimitadas ni acceso a nómina operativa.',
        'Para menores, la visión es una tarjeta familiar administrada por el titular, no una cuenta bancaria independiente desde el nacimiento. El acceso efectivo exige reglas de representación, consentimiento y protección de menores. Tener CURP no permite prometer bancarización universal ya disponible.',
        'UDIS y pesos no son lo mismo. La UDI cambia de valor y sirve como referencia de límites. El saldo QaRd se expresa en pesos mexicanos; no se publica una conversión fija UDI/peso ni un valor inventado.',
      ]},
      {title:'Pix · cuenta previa, no necesariamente banco tradicional',paragraphs:[
        'Para usar Pix se necesita una cuenta corriente, de ahorro o de pago prepagada en una institución participante. Una cuenta de pago puede ampliar la inclusión sin requerir una relación bancaria tradicional.',
        'Las claves pueden ser CPF/CNPJ, teléfono, correo o una clave aleatoria; también se puede pagar mediante QR. Quien no logra abrir una cuenta participante sigue enfrentando una barrera, pero sería incorrecto afirmar que Pix solo admite cuentas bancarias clásicas.',
      ]},
      {title:'WeChat Pay · extranjeros no están excluidos en bloque',paragraphs:[
        'Tencent ha habilitado vinculación de tarjetas internacionales y procesos de identificación para visitantes de China. La aceptación y límites dependen del producto, país, tarjeta y tipo de transacción.',
        'No es correcto decir que siempre exige una tarjeta de banco chino ni que resulta imposible para todos los extranjeros. Sí hay fricción por verificación, cobertura, idioma y funciones que pueden no estar disponibles con tarjetas internacionales.',
      ]},
    ],
  },
  {
    id:'pagos',title:'Mecánica de pago y costos',summary:'Los QR simplifican el pago; la comparación útil incluye recargas, activaciones y restricciones reales.',sources:['pix-faq','wechat'],
    blocks:[
      {title:'TodoCerca · QaRd, control y costos transparentes',paragraphs:[
        'QaRd identifica la tarjeta con 16 dígitos y un QR. Los cobros comerciales usan un CVV dinámico de cuatro cifras y un solo uso. El CVV estático de tres cifras no se transmite en pagos. Los lectores de transporte mantienen un flujo separado.',
        'La operación está diseñada para importes al centavo, evitando depender de cambio en efectivo. Esa precisión no implica que todos los servicios acepten cualquier mínimo: transporte y recargas tienen controles específicos. No se promete ausencia universal de saldo mínimo.',
        'Tarifas vigentes del proyecto: $150 MXN de activación principal una sola vez; $100 MXN por activación de tarjeta adicional; $15 MXN por recarga. En recarga atendida por comercio, la comisión se reparte en $5 para el negocio y $10 para TodoCerca. Activaciones ya pagadas no se cobran otra vez.',
        'Ejemplo de una recarga posterior de $200: se acreditan $185 tras la comisión de $15. Si además falta activar la principal, de esos $200 se descuentan $150 de activación y $15 de comisión, dejando $35. Son ejemplos de tarifas, no saldos de usuarios reales.',
        'La visión contempla circulación interna sin comisión por transferir, pero no autoriza afirmar que toda operación es gratis. Retiros, recargas, activaciones y servicios pueden tener costos. Todo cobro debe mostrarse antes de confirmar.',
        'Las terminales se operan por invitación del negocio, incluso al propio teléfono del titular. El cobro pertenece al negocio, no al empleado. La unificación del saldo mostrado en la tarjeta Empresarial con el libro de cobros aún requiere completar y verificar el flujo.',
      ]},
      {title:'Pix · rapidez y reglas de cobro',paragraphs:[
        'Pix funciona las 24 horas y suele liquidar en pocos segundos. Su diseño contempla pagos instantáneos; no conviene prometer un tiempo infalible para toda operación ni confundir rapidez con ausencia de fraude.',
        'Para personas físicas suele ser gratuito, con excepciones previstas por el Banco Central, por ejemplo determinados usos comerciales o canales de atención. Las instituciones pueden cobrar a personas jurídicas. Las reglas del participante importan.',
      ]},
      {title:'WeChat Pay · costos según tarjeta y contexto',paragraphs:[
        'Los costos no son iguales para usuario doméstico, visitante con tarjeta internacional y comercio. Tencent ha publicado condiciones específicas para pagos internacionales; deben revisarse al momento de pagar porque pueden cambiar.',
        'No hay evidencia aquí de que todas las comisiones sean crecientes o restrictivas. La comparación honesta reconoce tarifas y límites variables, sin asignar una tasa universal ni prometer gratuidad completa.',
      ]},
    ],
  },
  {
    id:'formalizacion',title:'El diferencial: formalización fiscal y laboral',summary:'Una hoja de ruta mexicana que va más allá del pago, con una primera fase disponible y automatizaciones todavía pendientes.',sources:['isr','iva','sat','pac'],
    blocks:[
      {title:'Disponible · guía RESICO y expediente fiscal privado',paragraphs:[
        'La primera fase de TodoCerca reúne una guía en seis pasos: revisar elegibilidad, reunir documentos, inscripción o actualización de RFC, credenciales fiscales y Buzón Tributario, expediente fiscal y revisión de obligaciones. El usuario puede guardar evidencia privada y marcar avances.',
        'El expediente incluye RFC, nombre fiscal, régimen, código postal y actividad. La confirmación es del usuario: no equivale a alta ante el SAT ni a aprobación de una autoridad. Adjuntar una constancia no cambia el régimen fiscal automáticamente.',
        'RESICO para personas físicas contempla tasas de ISR de 1% a 2.5% conforme a bases, rangos y requisitos de la Ley del ISR. No todos califican; existen topes de ingresos, exclusiones y obligaciones. La tasa no es una promesa del total de impuestos ni de deducibilidad.',
        'No se encontró respaldo oficial suficiente para anunciar un IVA simplificado del 7% en 2027. Esa afirmación queda fuera de la oferta. Un cambio solo puede comunicarse como vigente cuando exista publicación normativa y se confirme su aplicabilidad.',
      ]},
      {title:'Planeado · CFDI 4.0 y continuidad del timbrado',paragraphs:[
        'La visión propone solicitudes de factura vinculadas al pago y timbrado mediante un proveedor autorizado. Un flujo completo debe reunir datos del receptor, régimen, uso del CFDI, conceptos, impuestos y certificados que correspondan; después debe conservar XML y representación imprimible.',
        'MultiPAC y el uso de más de cinco PACs no se han acreditado como integración contratada ni activa en esta aplicación. Tampoco se ofrece conmutación instantánea si un PAC falla. Para implementarla se requieren contrato, manejo seguro de certificados, identificación de respuestas y prevención de doble timbrado.',
        'La continuidad debe apoyarse en idempotencia, estados consultables y reintentos controlados. Un pago exitoso no prueba que una factura ya fue timbrada: el usuario debe poder distinguir solicitud, proceso, CFDI válido y error.',
        'La llamada autofacturación no convierte cualquier gasto en deducible. El comprobante debe tener emisor real, requisitos fiscales correctos y corresponder al régimen y operación. TodoCerca puede facilitar una solicitud; no debe inventar facturas ni garantías de deducción.',
      ]},
      {title:'Transporte · exención de IVA condicionada',paragraphs:[
        'La Ley del IVA contempla exención para transporte público terrestre de personas prestado exclusivamente en áreas urbanas, suburbanas o zonas metropolitanas, con exclusiones y condiciones específicas. No todo transporte, ni toda ruta concesionada, queda exento automáticamente.',
        'Si una operación realmente encuadra en la exención y su tarifa es $9, no se agrega un IVA ficticio al pasaje. Los $9 son un ejemplo ilustrativo, no una tarifa general de TodoCerca. Rutas foráneas, servicios privados u operaciones mediante plataformas deben revisarse según su naturaleza jurídica.',
        'La automatización futura necesita una clasificación fiscal respaldada por el prestador y comprobantes correctos. El color del mapa o la categoría de una ruta no deben decidir por sí solos su tratamiento tributario.',
      ]},
      {title:'Planeado · asistencia con marcas reales',paragraphs:[
        'El reloj checador propuesto conserva dos tiempos: la marca real y la considerada para el cálculo. Para entrada programada a las 08:00, marcar 08:14 o 08:15 no genera retraso; marcar 08:16 cuenta los 16 minutos completos, no solo uno.',
        'Para salida a las 18:00, marcar 18:12 o 18:15 se considera 18:00; 18:16 activa la revisión de los 16 minutos completos. La regla interna de tolerancia no elimina derechos laborales ni justifica descuentos automáticos.',
        'Este módulo aún no está implementado. Entradas anticipadas, descansos, autorizaciones de horas extra y trabajo remoto requieren definición. Los procesos diarios deben usar hora de Hermosillo y permitir corrección documentada y revisión de incidencias.',
      ]},
      {title:'Planeado · nómina, dispersión e impuestos',paragraphs:[
        'La propuesta conecta incidencias aprobadas, periodo de nómina, conceptos, deducciones legalmente aplicables y pago al trabajador. El cálculo y la dispersión no están disponibles como automatización operativa.',
        'Dispersar saldo QaRd no sustituye por sí solo el CFDI de nómina, obligaciones de seguridad social ni requisitos laborales. Una implementación real debe comprobar fondos, beneficiario, autorizaciones y conciliación; no puede marcar un salario como pagado solo porque se envió una solicitud.',
        'El cálculo mensual de impuestos también es una fase futura. Debe considerar régimen, ingresos efectivamente cobrados, operaciones gravadas o exentas, retenciones y demás obligaciones. Una estimación no equivale a declaración presentada ni a pago aceptado por SAT.',
      ]},
      {title:'Comparación justa con Pix y WeChat',paragraphs:[
        'Pix es infraestructura brasileña y no tiene como objeto formalizar un negocio mexicano ante el SAT. Sus participantes y aplicaciones pueden ofrecer servicios contables adicionales: no se afirma que todo su ecosistema carezca de ellos.',
        'WeChat permite servicios y miniaplicaciones de terceros, por lo que tampoco se afirma que ninguna herramienta fiscal o laboral exista en su ecosistema. La oportunidad de TodoCerca es adaptar una experiencia integrada al contexto mexicano, no negar capacidades de otros países.',
        'El diferencial hoy verificable es la orientación local, la guía y el expediente privado. El diferencial completo de facturación, asistencia y nómina es una hoja de ruta, no un producto terminado.',
      ]},
    ],
  },
  {
    id:'privacidad',title:'Privacidad y seguridad de datos',summary:'Minimizar datos es una decisión de diseño, no una promesa de riesgo cero ni una comparación de vigilancia sin pruebas.',sources:['privacy','ocsp','pix'],
    blocks:[
      {title:'TodoCerca · llave privada bajo control del usuario',paragraphs:[
        'El nuevo formulario coteja el RFC escrito con el certificado .cer y el texto de la constancia PDF. Extrae el nombre del certificado y comprueba localmente que la contraseña abra el .key y que la llave corresponda criptográficamente al certificado.',
        'La llave y la contraseña no se envían al servidor ni se guardan en base de datos o almacenamiento de la aplicación. Tras revisar, el formulario limpia esos campos. La revisión local no guarda una solicitud ni un indicador de aprobación empresarial.',
        'Está pendiente verificar la cadena de confianza del certificado, distinguir e.firma de sello digital, comprobar no revocación y vincular una prueba de posesión a la cuenta. La consulta OCSP requiere información del emisor además del número de serie público; no usa la llave privada. Un error, estado desconocido o falta de respuesta nunca debe convertirse en aprobación.',
        'Un certificado autofirmado puede coincidir con una llave y aun así no ser del SAT. Por eso el cotejo local no basta para Nivel 3, no se proclama superior a la biometría y no acredita por sí solo facultades de representación de una empresa.',
      ]},
      {title:'Pix y WeChat · datos, controles y contexto',paragraphs:[
        'Pix necesita información de identificación y transacciones para operar, prevenir fraude y cumplir obligaciones. Las instituciones participantes y el Banco Central tienen funciones diferentes. No se describe ese tratamiento como recolección masiva indebida sin evidencia de alcance y finalidad.',
        'WeChat declara categorías de datos y condiciones de tratamiento en sus políticas. El alcance varía entre WeChat internacional, Weixin, pagos y otras funciones. No se afirma vigilancia total ni acceso universal a todos los chats, ubicaciones y gastos de cada persona.',
        'En cualquier plataforma, la evaluación debe revisar datos necesarios, finalidad, acceso, retención, transferencias, derechos y respuesta a incidentes. TodoCerca también necesita estos controles; tener menos archivos no elimina los riesgos de cuenta comprometida o ingeniería social.',
      ]},
    ],
  },
  {
    id:'ecosistema',title:'Ecosistema: pago, movilidad y comunidad',summary:'TodoCerca busca integración local; Pix destaca por interoperabilidad y WeChat por amplitud de servicios.',sources:['pix','wechat'],
    blocks:[
      {title:'TodoCerca · capacidades y fronteras reales',paragraphs:[
        'El proyecto reúne mapas y rutas, QaRd, mensajería interna de texto, tarjetas familiares, consultas de movimientos y administración por invitación. Las rutas y sus ingresos se separan por familia para evitar mezclas entre operaciones distintas.',
        'El catálogo y la búsqueda comunitaria existen en el proyecto, pero su exposición depende de módulos habilitados y del enfoque actual de movilidad. No se promete un marketplace nacional completo ni todos los servicios disponibles para toda cuenta.',
        'Los estados de cuenta son de consulta, con movimientos etiquetados y exportación. Las tarjetas adicionales tienen saldo y controles propios; el acceso de empleados a terminales no debe concederles propiedad del dinero del negocio.',
        'La propuesta no presume aceptación bancaria universal, interoperabilidad automática con Pix/WeChat, saldo protegido como depósito bancario ni conversión QaRd/UDI fija. Son aspectos diferentes de una experiencia comunitaria.',
      ]},
      {title:'Pix · riel compartido; WeChat · plataforma amplia',paragraphs:[
        'Pix permite que múltiples aplicaciones y entidades construyan experiencias sobre un mismo sistema. Su menor integración visual en una sola app es una elección de infraestructura, no necesariamente una desventaja.',
        'WeChat/Weixin integra comunicación, pagos, comercio y miniaplicaciones a gran escala. Es un entorno gobernado por reglas de Tencent, pero no resulta imposible usarlo para visitantes internacionales ni carece de conexiones externas.',
        'TodoCerca puede diferenciarse con necesidades territoriales, lenguaje sencillo y acompañamiento mexicano. Para sostenerlo necesita adopción real, soporte, continuidad y evidencia de que sus integraciones resuelven tareas completas.',
      ]},
    ],
  },
  {
    id:'balance',title:'Pros, límites y decisiones estratégicas',summary:'Una recomendación sólida explica cuándo elegir cada modelo y qué falta para cumplir sus promesas.',sources:['pix','wechat','sat'],
    blocks:[
      {title:'TodoCerca · ventajas y tareas pendientes',paragraphs:[
        'A favor: orientación a movilidad y comunidad mexicana; consultas por cuenta; control de tarjetas adicionales; equipo por invitación; libro protegido; guía RESICO y expediente privado. La e.firma se coteja sin transferir llave o contraseña.',
        'Límites: menor efecto de red; dependencia de adopción territorial; nivel empresarial y validación SAT pendientes; unificación del saldo empresarial pendiente de verificación; custodia regulada e integración Transfer.com no acreditadas aquí; CFDI, asistencia y nómina todavía propuestos.',
        'Decisión para un visitante: evaluar primero el servicio disponible en su localidad y los costos reales. Para un inversionista: exigir métricas comprobables de adopción y retención, contratos y controles. Para una autoridad: revisar entidad responsable, custodia, consentimientos, fiscalidad y protección del usuario.',
      ]},
      {title:'Pix · ventajas y límites',paragraphs:[
        'A favor: infraestructura del Banco Central, interoperabilidad entre participantes, operación continua y alcance consolidado en Brasil. Personas físicas normalmente no pagan por los usos cubiertos por gratuidad.',
        'Límites: exige cuenta participante; no resuelve directamente obligaciones fiscales mexicanas; puede haber tarifas empresariales, límites y fraude. Su escala no implica que sea una solución local mexicana disponible sin una integración específica.',
      ]},
      {title:'WeChat Pay · ventajas y límites',paragraphs:[
        'A favor: pagos integrados en una experiencia consolidada, comercio y servicios dentro de WeChat/Weixin; soporte a visitantes con tarjetas internacionales bajo condiciones.',
        'Límites: reglas de plataforma, verificación y cobertura variables; costos y funciones según contexto; tratamiento de datos que requiere revisión; no es una solución nativa al RESICO, nómina o SAT de un negocio mexicano.',
      ]},
      {title:'Conclusión · complementar, no proclamar superioridad absoluta',paragraphs:[
        'TodoCerca tiene una oportunidad concreta: acercar operación local, movilidad y acompañamiento fiscal a personas y pequeños negocios mexicanos. Pix enseña el valor de interoperar; WeChat enseña el valor de integrar experiencias.',
        'La solución más completa depende del país, necesidad, servicios activos y evidencia. Este análisis no afirma exclusividad mundial, seguridad superior ni cumplimiento automático. Expone la visión y los pendientes para que la decisión sea informada.',
      ]},
    ],
  },
];