# Configuración de Tracking en Segundo Plano para Android

Este documento explica cómo configurar los permisos necesarios para que la app pueda rastrear ubicación en segundo plano (con pantalla apagada e incluso sin la app abierta).

## Permisos Necesarios

Debes agregar estos permisos en el archivo `android/app/src/main/AndroidManifest.xml`:

### 1. Permisos de Ubicación Básicos
```xml
<!-- Permisos de ubicación básicos -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### 2. Permiso de Ubicación en Background (Android 10+)
```xml
<!-- Para tracking en segundo plano (Android 10+) -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```

### 3. Permisos de Foreground Service
```xml
<!-- Permisos para servicio en primer plano -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### 4. Permiso Wake Lock (mantener dispositivo activo)
```xml
<!-- Para mantener el tracking activo -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

## Ubicación Completa en AndroidManifest.xml

Agrega estos permisos **antes** de la etiqueta `<application>`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Permisos de ubicación -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    
    <!-- Permisos para foreground service -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- Otros permisos necesarios -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        ...
    </application>
</manifest>
```

## Cómo Usar el Background Tracking

### 1. En componentes que necesitan tracking en background:

```typescript
import { useBackgroundTracking } from '@/hooks/useBackgroundTracking';

function TrackingComponent() {
  const [isTracking, setIsTracking] = useState(true);
  const groupId = "tu-group-id";
  
  // Esto iniciará automáticamente el tracking en background
  useBackgroundTracking(isTracking, groupId);
  
  return (
    <div>
      <button onClick={() => setIsTracking(!isTracking)}>
        {isTracking ? 'Detener Tracking' : 'Iniciar Tracking'}
      </button>
    </div>
  );
}
```

### 2. El hook automáticamente:
- ✅ Inicia un servicio en foreground (notificación persistente)
- ✅ Configura el rastreador de ubicación en background
- ✅ Actualiza la ubicación cada 50 metros
- ✅ Funciona con pantalla apagada
- ✅ Funciona incluso si la app está en background
- ✅ Actualiza las tablas `tracking_member_locations` y `proveedor_locations`

## Pasos para Implementar

1. **Hacer git pull** del proyecto actualizado
2. **Instalar dependencias**: `npm install`
3. **Editar AndroidManifest.xml** en `android/app/src/main/AndroidManifest.xml` y agregar los permisos arriba mencionados
4. **Sincronizar**: `npx cap sync android`
5. **Compilar**: `npm run build`
6. **Ejecutar**: `npx cap open android`

## Notas Importantes

⚠️ **Android 10+ (API 29+)**: El sistema pedirá dos permisos de ubicación por separado:
1. Primero pedirá permiso de ubicación normal (cuando uses la app)
2. Después pedirá permiso de ubicación "todo el tiempo" (background)

🔋 **Batería**: El tracking continuo puede consumir batería. El foreground service muestra una notificación persistente para que el usuario sepa que el tracking está activo.

📱 **Notificación**: Mientras el tracking esté activo, aparecerá una notificación que dice "TodoCerca - Ubicación Activa". Esto es requerido por Android para servicios en foreground.

## Troubleshooting

### El tracking se detiene cuando cierro la app
- Verifica que hayas agregado todos los permisos en AndroidManifest.xml
- Asegúrate de que el permiso ACCESS_BACKGROUND_LOCATION esté presente
- Revisa que el foreground service esté iniciado correctamente

### No aparece la solicitud de permisos
- Los permisos deben ser solicitados por código también
- El hook useBackgroundTracking los solicita automáticamente con `requestPermissions: true`

### La notificación no desaparece
- Esto es normal, la notificación debe permanecer mientras el tracking esté activo
- Se eliminará automáticamente cuando detengas el tracking o cierres la app

## Recursos Adicionales

- [Documentación oficial de Background Geolocation](https://github.com/capacitor-community/background-geolocation)
- [Android Foreground Service](https://github.com/capawesome-team/capacitor-plugins/tree/main/packages/android-foreground-service)
- [Android Location Best Practices](https://developer.android.com/training/location)
