# 📡 iptv-proxy

Proxy que obtiene tokens de autenticación de **mdstrm.com** automáticamente y sirve los streams de canales chilenos como URLs estables para reproductores IPTV como OTTPlayer, TiViMate o VLC.

## ¿Cómo funciona?

```
Reproductor IPTV → Tu proxy (Render) → Puppeteer visita el sitio del canal → Captura el token → Redirige al stream real
```

Los tokens se **cachean por 45 minutos** y se renuevan automáticamente cuando expiran.

---

## 🚀 Deploy en Render (gratis)

### Paso 1 — Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# Crear un repo nuevo en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/mdstrm-proxy.git
git push -u origin main
```

### Paso 2 — Crear servicio en Render

1. Ve a [render.com](https://render.com) y crea una cuenta gratis
2. Click en **New → Web Service**
3. Conecta tu repositorio de GitHub
4. Render detectará automáticamente el `render.yaml`
5. Click en **Create Web Service**

### Paso 3 — Configurar la URL base

Una vez que el deploy termine, Render te dará una URL como:
```
https://mdstrm-proxy.onrender.com
```

Ve a **Environment → Environment Variables** y actualiza:
```
BASE_URL = https://mdstrm-proxy.onrender.com
```

Haz un nuevo deploy para que tome efecto.

---

## 📺 Usar en OTTPlayer / TiViMate

1. Abre tu reproductor IPTV
2. Agrega una nueva lista con la URL:
   ```
   https://TU-SERVICIO.onrender.com/playlist.m3u8
   ```
3. ¡Listo! Los canales aparecerán organizados por grupo.

---

## ⚠️ Limitaciones del plan gratuito de Render

- El servicio **se duerme después de 15 minutos sin peticiones**
- Al despertar, la primera petición puede tardar **30-50 segundos**
- Para evitar esto, puedes usar [UptimeRobot](https://uptimerobot.com) (gratis) para hacer ping al endpoint `/api/status` cada 10 minutos

---

## 📊 Panel de control

Visita `https://TU-SERVICIO.onrender.com` para ver:
- Estado de los tokens en caché
- Tiempo restante de cada token
- Botones para renovar tokens manualmente
- URL de la lista M3U para copiar

---

## 🔧 Canales incluidos

| Canal | Tipo | Grupo |
|-------|------|-------|
| TVN | mdstrm (con token) | Chile - Abierta |
| NTV | mdstrm (con token) | Chile - Cultura |
| 24 Horas | mdstrm (con token) | Chile - Noticias |
| Mega | mdstrm (con token) | Chile - Abierta |
| Meganoticias | mdstrm (con token) | Chile - Noticias |
| Megatiempo | mdstrm (con token) | Chile - Noticias |
| Canal 13 | URL directa | Chile - Abierta |
| CHV | URL directa | Chile - Abierta |
| CHV Deportes | URL directa | Chile - Deportes |
| Uchile TV | URL directa | Chile - Cultura |
| UCV TV | URL directa | Chile - Regional |
| Sporting HD | URL directa | Chile - Deportes |
| DW Español | URL directa | Internacional |

---

## 🛠️ Desarrollo local

```bash
npm install
node src/server.js
# Abre http://localhost:3000
```

---

## Agregar más canales

Edita `src/channels.js` y agrega una entrada:

```js
// Canal con mdstrm (necesita token):
micanal: {
  name: 'Mi Canal',
  group: 'Chile - Abierta',
  logo: 'https://...',
  sourceUrl: 'https://www.micanal.cl/en-vivo',
  mdstrmId: 'ABC123...', // ID de mdstrm (opcional, mejora el filtrado)
},

// Canal con URL directa (no necesita token):
otrocanal: {
  name: 'Otro Canal',
  group: 'Chile - Regional',
  logo: 'https://...',
  directUrl: 'https://stream.otrocanal.cl/live/playlist.m3u8',
},
```
