# Configuración de Google Analytics 4 para TodoCerca

## ✅ Ya está implementado

Google Analytics 4 ya está integrado en toda la aplicación. Solo necesitas obtener tu ID de medición y reemplazarlo en el código.

## 📊 Eventos que se están rastreando

### 1. **Suscripciones GPS**
- `gps_subscription` con estado: `started`, `completed`, `cancelled`
- Incluye valor de conversión ($400 MXN)

### 2. **Registro de Proveedores**
- `provider_registration` con paso: `started`, `completed`
- Incluye categoría del primer producto
- Conversión de $400 MXN

### 3. **Búsquedas de Productos**
- `search` con término de búsqueda y cantidad de resultados

### 4. **Mensajería**
- `messaging` con acciones: `opened`, `sent`

### 5. **Conversiones**
- `conversion` para suscripciones GPS y upgrades de proveedor

## 🚀 Cómo configurar tu cuenta

### Paso 1: Crear cuenta de Google Analytics

1. Ve a [Google Analytics](https://analytics.google.com/)
2. Inicia sesión con tu cuenta de Google
3. Haz clic en **"Comenzar a medir"**

### Paso 2: Crear una propiedad GA4

1. Configura tu cuenta:
   - Nombre de cuenta: `TodoCerca`
   - País: México
   - Moneda: Peso mexicano (MXN)

2. Crea una propiedad:
   - Nombre de la propiedad: `TodoCerca - Producción`
   - Zona horaria: `(GMT-06:00) América/Ciudad de México`
   - Moneda: `MXN - $ - Peso mexicano`

3. Completa los detalles del negocio:
   - Categoría: Tecnología / Software
   - Tamaño: según tu equipo

### Paso 3: Configurar flujo de datos web

1. Selecciona **"Web"** como plataforma
2. Ingresa:
   - URL del sitio web: `https://todocerca.mx`
   - Nombre del flujo: `TodoCerca Web`
   - ✅ Marcar "Activar la medición mejorada"

3. Haz clic en **"Crear flujo"**

### Paso 4: Obtener tu ID de medición

Tu ID de medición aparecerá en formato: `G-XXXXXXXXXX`

**Copia este ID**, lo necesitarás en el siguiente paso.

### Paso 5: Reemplazar el ID en tu código

Abre el archivo `index.html` y busca estas dos líneas (líneas ~34 y ~38):

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
```

```javascript
gtag('config', 'G-XXXXXXXXXX', {
```

**Reemplaza `G-XXXXXXXXXX` con tu ID real** (ambas ocurrencias).

También en `src/lib/analytics.ts` línea ~51:

```typescript
window.gtag('config', 'G-XXXXXXXXXX', {
```

### Paso 6: Verificar la implementación

1. Publica los cambios en tu sitio
2. Abre tu sitio en una ventana de incógnito
3. Ve a Google Analytics → **Informes** → **Tiempo real**
4. Deberías ver tu visita en tiempo real

## 📈 Métricas importantes a reviocionar

### Dashboard Principal
- **Usuarios en tiempo real**: Ve cuántas personas están en tu sitio ahora
- **Usuarios activos**: Usuarios únicos en los últimos 7/30 días
- **Sesiones**: Número total de visitas

### Conversiones
1. Ve a **Admin** → **Eventos**
2. Marca como conversión:
   - `gps_subscription` (cuando el estado es `completed`)
   - `provider_registration` (cuando el paso es `completed`)
   - `conversion`

### Audiencia
- **Ubicación geográfica**: ¿De dónde son tus usuarios?
- **Dispositivos**: ¿Móvil o desktop?
- **Canales de adquisición**: ¿Cómo llegaron? (Facebook, TikTok, directo)

### Embudos Personalizados
Crea un embudo para ver la conversión:
1. Landing → 2. Búsqueda → 3. Chat con proveedor → 4. Suscripción GPS

## 🎯 Configuración recomendada para campañas

### Para Facebook/Instagram Ads
Agrega parámetros UTM a tus enlaces:
```
https://todocerca.mx?utm_source=facebook&utm_medium=social&utm_campaign=gps_launch
```

### Para TikTok Ads
```
https://todocerca.mx?utm_source=tiktok&utm_medium=video&utm_campaign=gps_launch
```

### Para influencers
```
https://todocerca.mx?utm_source=influencer&utm_medium=referral&utm_campaign=nombre_influencer
```

## 🔒 Privacidad y GDPR

Google Analytics 4 es compatible con las regulaciones de privacidad. Considera:

1. **Añadir aviso de cookies** (recomendado para México)
2. **Política de privacidad** mencionando el uso de Google Analytics
3. **Opción de opt-out** para usuarios que no quieran ser rastreados

## 📞 Soporte

Si tienes problemas:
1. Verifica que el ID esté correcto en ambos archivos
2. Usa el modo incógnito para probar
3. Revisa la consola del navegador (F12) por errores
4. Espera 24-48 horas para que Google Analytics procese datos históricos

---

**¡Listo!** Ahora puedes ver en tiempo real cómo los usuarios interactúan con TodoCerca y optimizar tus campañas de marketing. 🚀
