# Guía de instalación y uso · Abarrotes La Luna

Tiempo estimado: 30–40 minutos la primera vez.

```
Navegador del cliente ──► Sitio en HostGator (carpeta web/)
                              │  fetch (JSON)
                              ▼
                 Apps Script (web app, cuenta skodev.ia@gmail.com)
                              │
                              ▼
       Google Sheet = panel de control + CRM
       Config · Productos · Promociones · Temporadas · Pedidos · Clientes · Comentarios
                              │
                              ▼
            Correo de aviso (MailApp) · Webhook a CRM externo (opcional)
```

---

## 1. Crear el Google Sheet y el Apps Script

1. Entra a Google Drive con **skodev.ia@gmail.com** y crea una hoja nueva llamada **“La Luna · Panel”**.
2. En la hoja: **Extensiones → Apps Script**.
3. Borra todo lo que trae `Código.gs` y **pega completo el archivo `dist/Codigo.gs`** (es un solo archivo con
   todo el backend).
   - Opcional: en ⚙️ *Configuración del proyecto* pon la zona horaria en **(GMT-06:00) Ciudad de México**.
4. Guarda (💾). Vuelve a la hoja y **recarga la página**: aparecerá el menú **🌙 La Luna**.
5. **🌙 La Luna → 1. Configuración inicial**. Google pedirá permisos (hoja, enviar correo, conexiones
   externas): acéptalos. Si sale “Google no verificó esta app”, entra a *Configuración avanzada → Ir a…*:
   es tu propio script.
6. **🌙 La Luna → 2. Definir contraseña del panel** (mínimo 8 caracteres). Es lo único que se hace en el Sheet;
   después la contraseña se cambia desde el panel (Ajustes).
7. En el editor de Apps Script elige **`autorizarPermisos`** → **▶ Ejecutar** y acepta (Drive para fotos).

## 2. Publicar la API

1. En Apps Script: **Implementar → Nueva implementación → Tipo: Aplicación web**.
2. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario**.
3. Copia la URL que termina en **`/exec`**.
4. Pruébala en el navegador agregando `?action=ping`: debe responder `{"ok":true,...}`.

> Cada vez que cambies el **código** del script: *Implementar → Administrar implementaciones → ✏️ →
> Versión: Nueva versión*. Así la URL no cambia. (Cambiar datos en la hoja **no** requiere esto.)

## 3. Conectar y subir el sitio a HostGator

1. Descarga **`dist/la-luna-hostgator.zip`**.
2. cPanel → **Administrador de archivos** → `public_html/`. Respalda lo que haya (Comprimir → descargar).
3. **Cargar** el zip en `public_html/` → clic derecho → **Extraer**. Los archivos quedan directo en
   `public_html/` (index.html, .htaccess, assets/, data/…). Borra el .zip después.
4. Conéctalo a la API: en el Administrador de archivos abre `assets/js/config.js` → **Editar** y pega tu URL:
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```
   Guarda. (Mientras quede vacío, el sitio funciona en **modo demostración**: datos de ejemplo y contraseña
   del panel `demo`. Útil para enseñarlo antes de conectar.)
5. cPanel → **SSL/TLS Status**: confirma que el dominio tenga certificado (el `.htaccess` fuerza HTTPS).
6. Abre `https://abarroteslaluna.com.mx`, haz un pedido de prueba y revisa que llegue el correo, que aparezca
   en la hoja **Pedidos** y en `https://abarroteslaluna.com.mx/admin.html`.

> ¿Regeneraste el paquete? `API_URL=https://script.google.com/macros/s/XXX/exec npm run paquete` crea el zip
> con la URL ya puesta, y así te saltas el paso 4.

---

## Uso diario: todo desde el panel

La tienda **no abre el Google Sheet**: administra todo en `https://SU-SITIO/admin.html`.
El Sheet queda como base de datos interna (y respaldo) que solo Skodev revisa si hace falta.

| Sección del panel | Qué hace la tienda ahí |
|---|---|
| **Pedidos** | Ve los pedidos en vivo (suena y se actualiza cada 30 s), llama o escribe por WhatsApp, avanza el estado, deja mensajes al cliente e imprime el ticket. |
| **Productos** | Captura precios en línea (Enter = siguiente), marca agotados, oculta, destaca en portada, da de alta productos con foto. |
| **Promociones** | Crea 2x1/3x2, % de descuento, precio especial o $ menos por pieza; elige productos, categoría, marca o toda la tienda; fechas y vista previa. |
| **Temporadas** | Crea temporadas con fechas y elige sus productos. |
| **Opiniones** | Publica, oculta o responde comentarios. |
| **Clientes** | CRM: historial por cliente, ticket promedio, llamar/WhatsApp, ver sus pedidos. |
| **Ajustes** | Pausar pedidos, envío, colonias, pagos y datos bancarios, avisos, teléfonos/WhatsApp/horario, correos, contraseña. |

Las fotos que se suben desde el panel se guardan en Google Drive, en la carpeta **“La Luna · Fotos del sitio”**
de la cuenta dueña del script, compartidas solo para ver.

## Actualizar desde la versión anterior (sin perder datos)

1. Apps Script → borra todo el contenido del archivo y pega el **`dist/Codigo.gs` nuevo** → 💾.
2. En la barra de arriba elige la función **`autorizarPermisos`** → **▶ Ejecutar** → acepta los permisos
   (ahora incluye Google Drive para las fotos).
3. **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar.** La URL no cambia.
4. HostGator → `public_html` → sube **`dist/la-luna-hostgator.zip`** → **Extraer** (reemplazar archivos).
   Opcional: borra `assets/js/pages/admin.js`, que ya no se usa.
5. La primera visita al sitio actualiza solas las hojas (ajustes nuevos: teléfonos, WhatsApp, horario…).
   Los productos, pedidos y clientes existentes no se tocan.

## Avisos importantes
- **Tabaco:** la Ley General para el Control del Tabaco y su reglamento prohíben publicidad y promoción de
  productos de tabaco. Por eso los cigarros se cargaron con `visible = NO`. Antes de mostrarlos, consúltalo
  con un asesor legal.
- **Alcohol:** el sitio pide confirmar +18 y avisa que se pedirá identificación. Respeta horarios y ley seca
  de la alcaldía (usa `pedidos_activos` o `disponible = NO` esos días).
- **Límites de Google (cuenta gratuita):** ~100 correos al día y 20 000 llamadas a la API diarias; sobra para
  una tienda de barrio. Si crecen, conviene Google Workspace.
- **Seguridad:** la contraseña del panel se guarda cifrada (hash con sal); las sesiones duran 6 h y se cierran
  al cambiarla. Los precios siempre se recalculan en el servidor.

## Desarrollo
```bash
npm run paquete # genera dist/Codigo.gs (Apps Script en 1 archivo) y dist/la-luna-hostgator.zip
npm run build   # copia shared/promos.js y regenera Seed.gs y web/data/demo.json
npm test        # pruebas del motor de promociones y del backend (simulador de Apps Script)
npm run serve   # sitio local en http://localhost:8080
```
`shared/promos.js` es la **única** fuente del cálculo de precios/promociones: no edites sus copias.
