# TODOCERCA - Configuración de Base de Datos

## 📋 PASOS PARA CONFIGURAR LA BASE DE DATOS

### 1. **Acceder a tu Dashboard de Supabase**
- Ve a [supabase.com/dashboard](https://supabase.com/dashboard)
- Selecciona tu proyecto `todocerca`

### 2. **Ejecutar el Schema Principal**
- Ve a **SQL Editor** en el menú lateral
- Copia todo el contenido del archivo `src/lib/database-schema.sql`
- Pégalo en el editor SQL y haz clic en **RUN**

### 3. **Insertar Categorías por Defecto**  
- En el mismo SQL Editor
- Copia todo el contenido del archivo `src/lib/default-categories.sql`
- Pégalo y haz clic en **RUN**

### 4. **Configurar Storage para Fotos**
- Ve a **Storage** en el menú lateral
- Crea un nuevo bucket llamado `provider-photos`
- Configúralo como **público**

### 5. **Verificar las Tablas Creadas**
Una vez ejecutados los scripts, deberías tener estas tablas:

✅ **user_profiles** - Perfiles de clientes y proveedores  
✅ **provider_profiles** - Información de negocio de proveedores  
✅ **service_categories** - Categorías jerárquicas (Bienes/Servicios)  
✅ **provider_services** - Servicios ofrecidos por proveedores  
✅ **provider_photos** - Fotos de productos/instalaciones  
✅ **subscription_payments** - Historial de pagos de suscripción  
✅ **tracking_groups** - Grupos de tracking de dispositivos  
✅ **tracking_group_members** - Miembros de grupos de tracking  

### 6. **Activar Autenticación**
- Ve a **Authentication** > **Settings**
- Activa **Enable email confirmations** 
- Configura tu **Site URL** (opcional)

---

## 🔧 ESTRUCTURA DE LA BASE DE DATOS

### **Roles de Usuario**
- **Cliente**: No paga, puede buscar proveedores y publicar productos temporalmente
- **Proveedor**: Paga $200 MXN/año, puede ofrecer servicios y usar tracking

### **Geolocalización**
- Utiliza PostGIS para búsquedas por proximidad
- Almacena coordenadas en formato `GEOGRAPHY(POINT, 4326)`
- Permite búsquedas en radio de 1-50 km

### **Categorías Jerárquicas**
```
Bienes
├── Alimentos
│   ├── Tacos
│   │   ├── Tacos de Pastor
│   │   ├── Tacos de Pescado
│   │   └── Tacos de Carnitas
│   └── Pizzas
├── Herramientas
│   ├── Eléctricas
│   └── Manuales
└── Hogar

Servicios  
├── Transporte
│   ├── Taxis
│   ├── Uber-like
│   └── Mudanzas
├── Instructor
│   ├── Música
│   ├── Idiomas
│   └── Deportes
└── Empleos
```

### **Estados de Disponibilidad**
- 🟢 **Disponible**: Proveedor activo y listo para atender
- 🟡 **Ocupado**: En servicio, pero visible en mapa
- 🔴 **No disponible**: Fuera de servicio temporalmente

### **Estados de Suscripción**
- ✅ **Activa**: Proveedor con suscripción vigente
- ⚠️ **Vencida**: Suscripción expirada (oculto del mapa)
- ❌ **Cancelada**: Suscripción cancelada

---

## 🔒 SEGURIDAD (RLS - Row Level Security)

Las políticas RLS ya están configuradas:

- **Usuarios** pueden ver y editar solo su propio perfil
- **Proveedores activos** son visibles públicamente en el mapa
- **Fotos y servicios** de proveedores son públicos
- **Pagos y tracking** solo accesibles por el propietario

---

## 📊 ÍNDICES DE RENDIMIENTO

Se crearon índices optimizados para:
- Búsquedas por geolocalización (GIST index)
- Filtros por código postal
- Filtros por tipo de usuario y disponibilidad
- Consultas por categorías y subcategorías

---

## 🚀 PRÓXIMOS PASOS

Una vez configurada la base de datos:

1. **Activar autenticación** en tu app
2. **Implementar registro** de clientes y proveedores  
3. **Crear interfaz de mapa** con geolocalización
4. **Desarrollar sistema de categorías** jerárquico
5. **Integrar chat** entre usuarios
6. **Configurar pagos** con Stripe/Conekta

---

## ⚠️ IMPORTANTE

- **Hacer backup** de tu base de datos antes de cambios importantes
- **Probar primero** las consultas en un entorno de desarrollo
- **Monitorear** el uso de storage para las fotos
- **Configurar límites** de rate limiting en endpoints sensibles

---

¿Necesitas ayuda con algún paso? ¡Pregúntame!