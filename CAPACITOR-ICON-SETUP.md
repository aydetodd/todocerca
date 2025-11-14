# Configuración de Íconos y Splash Screen para Android

Este documento explica cómo agregar el ícono personalizado y splash screen a tu app nativa de Android.

## Archivos Generados

Ya se han generado los siguientes recursos:
- `public/icon-512.png` - Ícono principal (512x512)
- `public/icon-192.png` - Ícono pequeño (192x192)  
- `public/splash.png` - Splash screen (1080x1920)

## Pasos para Agregar el Ícono en Android

### 1. Preparar el Ícono para Android

Android requiere múltiples tamaños de íconos. La manera más fácil es usar Android Studio:

1. **Abre Android Studio** y abre tu proyecto (`npx cap open android`)
2. **Haz clic derecho** en `app/src/main/res` en el árbol de proyecto
3. Selecciona **New → Image Asset**
4. En el wizard que aparece:
   - **Icon Type**: Launcher Icons (Adaptive and Legacy)
   - **Name**: `ic_launcher`
   - **Foreground Layer**: Selecciona tu ícono (`public/icon-512.png`)
   - **Background Layer**: Puedes usar un color sólido o la misma imagen
   - **Preview**: Revisa cómo se ve en diferentes formas
5. Click **Next** y luego **Finish**

### 2. Alternativa: Copiar Manualmente

Si prefieres hacerlo manualmente, copia los íconos a estas carpetas en tamaños específicos:

```
android/app/src/main/res/
  mipmap-mdpi/ic_launcher.png       (48x48)
  mipmap-hdpi/ic_launcher.png       (72x72)
  mipmap-xhdpi/ic_launcher.png      (96x96)
  mipmap-xxhdpi/ic_launcher.png     (144x144)
  mipmap-xxxhdpi/ic_launcher.png    (192x192)
```

Puedes usar una herramienta online como [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html) para generar todos los tamaños.

## Pasos para Agregar el Splash Screen

### 1. Copiar el Splash Screen

Copia el archivo `public/splash.png` a la carpeta de recursos de Android:

```bash
# Desde la raíz del proyecto
cp public/splash.png android/app/src/main/res/drawable/splash.png
```

O manualmente:
- Copia `public/splash.png`
- Pégalo en `android/app/src/main/res/drawable/`
- Renómbralo a `splash.png` (en minúsculas, sin espacios)

### 2. Configurar el Splash Screen en Android

El splash screen ya está configurado en `capacitor.config.ts`:

```typescript
SplashScreen: {
  launchShowDuration: 2000,
  backgroundColor: "#1e3a5f",
  androidSplashResourceName: "splash",
  androidScaleType: "CENTER_CROP",
  showSpinner: false
}
```

### 3. Alternativa: Crear Múltiples Densidades

Para mejor calidad en diferentes dispositivos, crea múltiples versiones:

```
android/app/src/main/res/
  drawable-mdpi/splash.png      (480x800)
  drawable-hdpi/splash.png      (720x1280)
  drawable-xhdpi/splash.png     (1080x1920) ← usa este
  drawable-xxhdpi/splash.png    (1440x2560)
  drawable-xxxhdpi/splash.png   (1920x3840)
```

## Proceso Completo de Implementación

```bash
# 1. Hacer git pull del proyecto actualizado
git pull

# 2. Instalar dependencias nuevas
npm install

# 3. Compilar la aplicación
npm run build

# 4. Copiar el splash screen manualmente
cp public/splash.png android/app/src/main/res/drawable/splash.png

# 5. Abrir Android Studio
npx cap open android

# 6. En Android Studio:
#    - Generar íconos usando Image Asset (pasos arriba)
#    - O copiar íconos manualmente a las carpetas mipmap

# 7. Sincronizar cambios
npx cap sync android

# 8. Ejecutar la app
# Desde Android Studio: Run 'app' o Shift+F10
```

## Verificar los Cambios

1. **Ícono**: Cierra completamente la app y búscala de nuevo en el launcher. Deberías ver el nuevo ícono.
2. **Splash Screen**: Al abrir la app, deberías ver la pantalla de splash por ~2 segundos antes de que cargue la app.

## Troubleshooting

### El ícono no cambia
- **Limpia y reconstruye**: Build → Clean Project, luego Build → Rebuild Project
- **Desinstala la app** completamente del dispositivo y vuelve a instalarla
- **Reinicia el dispositivo** en casos extremos

### El splash no aparece
- Verifica que el archivo esté en `android/app/src/main/res/drawable/splash.png`
- El nombre debe ser **exactamente** `splash.png` (minúsculas)
- Ejecuta `npx cap sync android` nuevamente
- Limpia y reconstruye el proyecto en Android Studio

### Errores de compilación
```
Resource not found: drawable/splash
```
- Asegúrate de que el archivo splash.png existe en la carpeta drawable
- El nombre debe coincidir con `androidSplashResourceName` en capacitor.config.ts

## Personalización Adicional

### Cambiar el color de fondo del splash
Edita `capacitor.config.ts`:
```typescript
SplashScreen: {
  backgroundColor: "#TU_COLOR_AQUI", // en formato hex
}
```

### Cambiar la duración del splash
```typescript
SplashScreen: {
  launchShowDuration: 3000, // en milisegundos
}
```

### Agregar un spinner de carga
```typescript
SplashScreen: {
  showSpinner: true,
  spinnerColor: "#ffffff"
}
```

## Recursos Adicionales

- [Capacitor Splash Screen Docs](https://capacitorjs.com/docs/apis/splash-screen)
- [Android Icon Guidelines](https://developer.android.com/guide/practices/ui_guidelines/icon_design_launcher)
- [Android Splash Screen Guidelines](https://developer.android.com/develop/ui/views/launch/splash-screen)
