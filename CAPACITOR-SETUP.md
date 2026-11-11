# Aplicación móvil TodoCerca

## Preparación incluida

Capacitor ya estaba configurado para Android. Ahora incluye también iPhone y la herramienta de desarrollo está en las dependencias de desarrollo. Se conserva la configuración de ubicación existente; esta tarea no modifica transporte, pagos, comisiones ni tarjetas impresas.

Identificador: `app.lovable.p85760625b6da43c890e2846dd01fbbe3`.

No ejecutar `cap init` otra vez: el proyecto ya tiene configuración. Cambiar este identificador en una aplicación previamente instalada crea una identidad distinta; no es una actualización de una aplicación anterior con otro identificador.

## Instalar desde tu computadora

1. Conecta/exporta el proyecto a tu repositorio de GitHub y descarga la versión más reciente.
2. Instala las dependencias con `npm install`.
3. Crea las plataformas que usarás, una sola vez:

```bash
npx cap add android
npx cap add ios
```

Android requiere Android Studio. iPhone requiere una Mac con Xcode; la preparación aquí no compila ni firma aplicaciones nativas.

4. Actualiza las plataformas:

```bash
npx cap update android
npx cap update ios
```

5. Prepara los archivos y sincroniza:

```bash
npm run build
npx cap sync
```

6. Ejecuta en teléfono o emulador:

```bash
npx cap run android
npx cap run ios
```

**Después de cada cambio:** primero actualiza tu copia desde el repositorio conectado y después ejecuta `npm run build` y `npx cap sync`.

## Desarrollo frente a aplicación empaquetada

La configuración normal abre la vista remota de Lovable para probar cambios. **Esta vista necesita internet y no sirve para probar arranque sin conexión ni para publicar en tiendas.**

Para copiar la aplicación compilada al teléfono sin usar la vista remota:

```bash
npm run build
CAPACITOR_BUNDLED=1 npx cap sync
CAPACITOR_BUNDLED=1 npx cap run android
# O, en Mac:
CAPACITOR_BUNDLED=1 npx cap run ios
```

En PowerShell, define primero `$env:CAPACITOR_BUNDLED="1"` y luego ejecuta los comandos sin el prefijo. Conserva esa variable para todas las operaciones de Capacitor de la versión empaquetada. Si vuelves a sincronizar sin ella, regresarás a la vista remota.

Arrancar desde archivos locales no hace que los pagos actuales funcionen sin internet. La conexión y todos los controles actuales siguen siendo obligatorios.

## Antes de publicar

Comprobar en teléfonos reales inicio de sesión, sesión única, cámara QR, permisos de ubicación y flujos actuales. Revisar los permisos de cada plataforma; no se han verificado aquí. Se requieren las cuentas de desarrollador correspondientes, firma y revisión de las tiendas. No se ha generado APK, AAB ni aplicación iOS.

## TCB

El diseño y sus condiciones de seguridad están en `TCB-ARCHITECTURE.md`. No hay archivo `.tcb` activo, reservas de saldo ni pagos sin conexión implementados todavía.

Lee también el blog de Lovable sobre aplicaciones móviles: https://lovable.dev/blog (busca Capacitor), y la guía oficial: https://capacitorjs.com/docs.