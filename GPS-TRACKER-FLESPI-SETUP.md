# Guía de Configuración: GPS Trackers con Flespi

Esta guía te ayudará a configurar tus rastreadores GPS (KS199A y KS300) con Flespi para que funcionen con la aplicación.

---

## PARTE 1: Configuración de Flespi (Hacer HOY)

### Paso 1: Crear cuenta en Flespi

1. Ve a **https://flespi.com**
2. Clic en **"Sign Up"** (esquina superior derecha)
3. Registra tu cuenta con email
4. Confirma tu email

### Paso 2: Obtener tu Token de Flespi

1. Una vez logueado, ve a **https://flespi.io/#/panel/tokens**
2. Clic en el botón **"+"** para crear un nuevo token
3. Configura:
   - **Name:** `webhook-token` (o cualquier nombre descriptivo)
   - **ACL:** Selecciona **"All"** (acceso completo)
4. Clic en **"Create"**
5. **¡IMPORTANTE!** Copia el token generado (solo se muestra una vez)
6. Este token ya lo agregaste como `FLESPI_TOKEN` en los secrets ✅

### Paso 3: Crear un Channel para GT06

1. Ve a **https://flespi.io/#/panel/channels**
2. Clic en el botón **"+"** para crear nuevo channel
3. Busca y selecciona: **"gt06"** (el protocolo de tus trackers)
4. Configura:
   - **Name:** `mis-trackers` (o cualquier nombre)
   - **Protocol:** gt06 (ya seleccionado)
5. Clic en **"Create"**
6. **¡ANOTA!** El puerto asignado (ej: `10200`) - lo necesitarás para configurar los trackers

### Paso 4: Configurar el Stream (Webhook)

1. Ve a **https://flespi.io/#/panel/streams**
2. Clic en el botón **"+"** para crear nuevo stream
3. Selecciona tipo: **"Webhook"**
4. Configura:
   - **Name:** `app-webhook`
   - **Configuration → URI:** 
     ```
     https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/flespi-webhook
     ```
   - **Configuration → Method:** `POST`
   - **Configuration → Headers:** (dejar vacío)
5. En **"Selectors"**, agrega tu channel:
   - Clic en **"Add selector"**
   - Selecciona tu channel `mis-trackers`
6. Clic en **"Create"**

### Paso 5: Verificar configuración

1. En la lista de Streams, tu webhook debe aparecer con estado **"Active"**
2. Cuando los trackers envíen datos, los verás en:
   - Flespi: En el panel de Messages del channel
   - App: En los logs de la edge function

---

## PARTE 2: Preparar la Tarjeta SIM (Antes de que lleguen los trackers)

### Requisitos de la SIM

- **DEBE ser SIM con soporte 2G (GSM)** - Los trackers GT06 solo funcionan con 2G
- Tamaño: **Micro SIM** o **Nano SIM con adaptador** (verificar modelo)
- Plan de datos: Mínimo 50 MB/mes es suficiente
- **Operadores recomendados en México:**
  - Telcel (mejor cobertura 2G)
  - AT&T México
  - Movistar
  
> ⚠️ **IMPORTANTE:** Algunos operadores están desactivando 2G. Verifica que tu operador aún tenga cobertura 2G en tu zona.

### Activar la SIM antes de insertar

1. Inserta la SIM en un teléfono normal
2. Verifica que pueda hacer llamadas y usar datos
3. Anota el número de teléfono de la SIM
4. Retira la SIM del teléfono

---

## PARTE 3: Configurar los Trackers (Cuando lleguen)

### Paso 1: Insertar la SIM

1. Apaga el tracker (si tiene botón de encendido)
2. Abre la tapa del compartimento de SIM
3. Inserta la SIM en la orientación correcta
4. Cierra la tapa
5. Enciende el tracker

### Paso 2: Comandos SMS de configuración

Envía estos SMS **desde tu teléfono al número de la SIM del tracker**:

#### A) Configurar APN (Red de datos)

El comando varía según el operador. Envía UNO de estos:

**Para Telcel:**
```
APN,internet.itelcel.com#
```

**Para AT&T México:**
```
APN,internet.itelcel.com#
```

**Para Movistar:**
```
APN,internet.movistar.mx#
```

> Algunos modelos usan formato diferente: `APN,nombre_apn,usuario,contraseña#`
> Si no funciona, consulta el manual de tu modelo específico.

#### B) Configurar IP y Puerto de Flespi

Este es el comando más importante. Apunta el tracker a Flespi:

```
SERVER,1,gw.flespi.io,PUERTO,0#
```

**Reemplaza `PUERTO` con el puerto de tu channel de Flespi** (el que anotaste en el Paso 3).

Ejemplo si tu puerto es 10200:
```
SERVER,1,gw.flespi.io,10200,0#
```

#### C) Configurar intervalo de actualización

Para actualizar ubicación cada 30 segundos:
```
TIMER,30#
```

Para actualizar cada 60 segundos (ahorra batería):
```
TIMER,60#
```

#### D) Verificar configuración

Para recibir un SMS con la configuración actual:
```
PARAM#
```

### Paso 3: Verificar que está transmitiendo

1. Espera 2-3 minutos después de enviar los comandos
2. Ve a Flespi → Channels → tu channel → Messages
3. Deberías ver mensajes llegando con lat/long
4. En la app, el tracker debería aparecer en el mapa

---

## PARTE 4: Registrar el Tracker en la App

### Paso 1: Encontrar el IMEI

El IMEI está en:
- Etiqueta adhesiva en el dispositivo
- Caja del producto
- Respuesta al comando SMS: `IMEI#`

### Paso 2: Agregar en la app

1. Ve a **Tracking GPS** en la app
2. En la sección **"Rastreadores GPS"**, clic en **"Agregar"**
3. Ingresa:
   - **IMEI:** Los 15 dígitos del dispositivo
   - **Nombre:** Ej: "Auto de Papá", "Moto", "Bicicleta"
   - **Modelo:** Selecciona KS199A o KS300 según corresponda
4. Clic en **"Registrar Rastreador"**

---

## Solución de Problemas

### El tracker no aparece en Flespi

1. **Verifica la SIM:** ¿Tiene saldo/datos activos?
2. **Verifica el APN:** Envía el comando APN nuevamente
3. **Verifica IP/Puerto:** Envía el comando SERVER nuevamente
4. **Reinicia el tracker:** Apaga y enciende

### El tracker aparece en Flespi pero no en la app

1. **Verifica el IMEI:** ¿Está bien escrito en la app?
2. **Revisa los logs:** Ve a los logs de la edge function
3. **Verifica el webhook:** En Flespi, revisa que el Stream esté activo

### El tracker tiene ubicación incorrecta

1. **Espera en exterior:** GPS necesita cielo abierto para calibrar
2. **Primera conexión:** Puede tomar 5-10 minutos en obtener señal GPS
3. **Batería baja:** Carga el dispositivo completamente

---

## Comandos SMS Útiles (Referencia Rápida)

| Comando | Descripción |
|---------|-------------|
| `PARAM#` | Ver configuración actual |
| `IMEI#` | Obtener IMEI del dispositivo |
| `STATUS#` | Ver estado (batería, señal, GPS) |
| `RESET#` | Reiniciar el dispositivo |
| `WHERE#` | Recibir ubicación actual por SMS |
| `TIMER,30#` | Actualizar cada 30 segundos |
| `TIMER,60#` | Actualizar cada 60 segundos |

---

## Datos del Servidor Flespi

- **Host:** `gw.flespi.io`
- **Puerto:** El asignado a tu channel (ej: 10200)
- **Protocolo:** GT06

## URL del Webhook

```
https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/flespi-webhook
```

---

## Soporte

Si tienes problemas:
1. Revisa los logs en Flespi (Messages del channel)
2. Revisa los logs de la edge function en Supabase
3. Verifica que la SIM tenga datos activos

¡Buena suerte con la configuración! 🛰️
