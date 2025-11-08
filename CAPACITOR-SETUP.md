# 📱 Guía de Configuración de Capacitor para todocerca

## ✅ Lo que ya está hecho en Lovable

- ✅ Capacitor instalado y configurado
- ✅ Plugin de Geolocation instalado
- ✅ Código de tracking GPS preparado
- ✅ Permisos configurados

## 🚀 Pasos que debes seguir en tu computadora

### 1. Exportar proyecto a GitHub

1. En Lovable, haz clic en el botón **GitHub** (arriba a la derecha)
2. Conecta tu cuenta de GitHub si no lo has hecho
3. Crea un repositorio nuevo o usa uno existente

### 2. Clonar proyecto en tu computadora

```bash
git clone https://github.com/TU-USUARIO/TU-REPOSITORIO.git
cd TU-REPOSITORIO
```

### 3. Instalar dependencias

```bash
npm install
```

### 4. Agregar plataforma Android

```bash
npx cap add android
```

### 5. Sincronizar código con Android

```bash
npm run build
npx cap sync android
```

### 6. Abrir proyecto en Android Studio

```bash
npx cap open android
```

### 7. Configurar permisos de Android

El archivo `AndroidManifest.xml` necesitará estos permisos (Capacitor los agrega automáticamente, pero verifica):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

### 8. Compilar y probar

En Android Studio:
1. Conecta un celular Android con USB debugging activado
2. O usa un emulador de Android
3. Presiona el botón ▶️ (Run) para instalar la app

### 9. Probar en tu celular

La app se instalará automáticamente. Al abrir:
1. Dará permisos de ubicación cuando se soliciten
2. Para tracking GPS, pedirá "Permitir siempre" (necesario para segundo plano)

## 📦 Para publicar en Google Play (cuando estés listo)

### Requisitos:
1. Cuenta de Google Play Developer ($25 USD, una sola vez)
2. App firmada (Android Studio te guiará)
3. Iconos y screenshots de la app
4. Descripción y política de privacidad

### Pasos:
1. En Android Studio: Build → Generate Signed Bundle / APK
2. Crear keystore (archivo de firma)
3. Subir a Google Play Console
4. Completar información de la app
5. Enviar a revisión

**Tiempo de revisión:** 1-3 días típicamente

## 🆘 Problemas comunes

**Error: "SDK not found"**
- Instala Android SDK desde Android Studio

**Error: "Gradle build failed"**
- Ejecuta `npx cap sync` de nuevo
- Limpia caché: `cd android && ./gradlew clean`

**No se actualiza la ubicación en segundo plano:**
- Verifica que diste permiso "Permitir siempre"
- Ve a Ajustes → Apps → todocerca → Permisos → Ubicación → Permitir siempre

## 📚 Recursos útiles

- [Documentación de Capacitor](https://capacitorjs.com/docs)
- [Geolocation Plugin](https://capacitorjs.com/docs/apis/geolocation)
- [Publicar en Google Play](https://developer.android.com/distribute/googleplay/start)

## 💡 Próximos pasos (iOS)

Cuando quieras agregar iOS:
1. Necesitarás una Mac
2. `npx cap add ios`
3. `npx cap open ios` (abre Xcode)
4. Similar proceso pero en Xcode
