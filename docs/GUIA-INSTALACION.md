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
3. Borra el contenido de `Código.gs` y crea un archivo por cada `.gs` de la carpeta `apps-script/`,
   **con el mismo nombre** y pegando su contenido:
   `Promos.gs`, `Config.gs`, `Code.gs`, `Catalogo.gs`, `Pedidos.gs`, `Admin.gs`, `Comentarios.gs`,
   `Notificaciones.gs`, `Setup.gs`, `Seed.gs`.
   - Opcional: en ⚙️ *Configuración del proyecto* activa “Mostrar appsscript.json” y pega `appsscript.json`
     (deja la zona horaria en `America/Mexico_City`).
4. Guarda (💾). Vuelve a la hoja y **recarga la página**: aparecerá el menú **🌙 La Luna**.
5. **🌙 La Luna → 1. Configuración inicial**. Google pedirá permisos (hoja, enviar correo, conexiones
   externas): acéptalos. Si sale “Google no verificó esta app”, entra a *Configuración avanzada → Ir a…*:
   es tu propio script.
6. **🌙 La Luna → 2. Definir contraseña del panel** (mínimo 8 caracteres).

## 2. Publicar la API

1. En Apps Script: **Implementar → Nueva implementación → Tipo: Aplicación web**.
2. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario**.
3. Copia la URL que termina en **`/exec`**.
4. Pruébala en el navegador agregando `?action=ping`: debe responder `{"ok":true,...}`.

> Cada vez que cambies el **código** del script: *Implementar → Administrar implementaciones → ✏️ →
> Versión: Nueva versión*. Así la URL no cambia. (Cambiar datos en la hoja **no** requiere esto.)

## 3. Conectar el sitio

Abre `web/assets/js/config.js` y pega la URL:

```js
API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
```

Mientras `API_URL` esté vacío el sitio funciona en **modo demostración** (datos de ejemplo, pedidos solo en
el navegador, contraseña del panel `demo`). Úsalo para enseñarlo antes de conectar.

## 4. Subir a HostGator

1. cPanel → **Administrador de archivos** → `public_html/`.
2. Respalda lo que haya (descarga un .zip del sitio actual).
3. Sube **el contenido** de la carpeta `web/` (no la carpeta en sí), incluido `.htaccess`
   (activa “Mostrar archivos ocultos”).
4. cPanel → **SSL/TLS Status**: confirma que el dominio tenga certificado (el `.htaccess` fuerza HTTPS).
5. Abre `https://abarroteslaluna.com.mx`, haz un pedido de prueba y revisa que llegue el correo y que
   aparezca en la hoja **Pedidos** y en `https://abarroteslaluna.com.mx/admin.html`.

---

## Uso diario (lo que hace la tienda)

### Productos — hoja **Productos**
| Columna | Qué poner |
|---|---|
| `precio` | Número sin `$`. Vacío = “Precio por confirmar” (se puede pedir igual). |
| `visible` | `NO` lo oculta del sitio. Los **cigarros vienen en NO** (ver aviso legal abajo). |
| `disponible` | `NO` lo muestra como “Agotado”. |
| `destacado` | `SI` lo pone en “Lo más pedido” de la portada. |
| `es_alcohol` | `SI` = sale en **Licores**, pide confirmación +18. |
| `temporada` | El `id` de una temporada (ej. `muertos-2026`) para que salga en esa sección. |
| `imagen` | URL `https://` de una foto (opcional). |

Para dar de alta licores: agrega renglones con `categoria` = Cerveza / Tequila / Vino…, y `es_alcohol` = `SI`.

### Promociones — hoja **Promociones** (se aplican solas en el carrito)
| tipo | valor / lleva / paga | Ejemplo |
|---|---|---|
| `PORCENTAJE` | `valor` = % | 10 → 10% de descuento |
| `PRECIO_ESPECIAL` | `valor` = nuevo precio | 79 → la pieza a $79 |
| `DESCUENTO_PIEZA` | `valor` = pesos menos por pieza | 5 → $5 menos c/u |
| `NXM` | `lleva` y `paga` | 2 y 1 → 2x1; 3 y 2 → 3x2 |

`aplica_a`: ids separados por coma (`danonino-maxi,danonino-lunch`), una categoría (`cat:Leche`),
una marca (`marca:Lala`) o `*` para todo. `inicio`/`fin` opcionales (`2026-11-02` o `02/11/2026`).
`activa` = `SI`. Por producto se aplica la mejor promoción (no se acumulan). Se necesita `precio` para descontar.

### Temporadas — hoja **Temporadas**
Crea la temporada (`id`, `nombre`, fechas, `activa` = `SI`) y en **Productos** pon ese `id` en la columna `temporada`.

### Configuración — hoja **Config**
Envío (`envio_costo`, `envio_gratis_desde`), `pedido_minimo`, `colonias_cobertura`, formas de pago,
`transferencia_datos` (banco/CLABE que ve el cliente al terminar), `aviso_general` (banner arriba del sitio),
`pedidos_activos` = `NO` para pausar pedidos, y `email_notificacion`.

Los cambios se ven en el sitio **en segundos**. Si no, **🌙 La Luna → Publicar cambios ya**.

### Pedidos y CRM
- Cada pedido llega por **correo** y queda en la hoja **Pedidos**. La hoja **Clientes** acumula por teléfono:
  número de pedidos, total gastado, última dirección (tu CRM).
- Atiéndelos desde **`/admin.html`** (celular o computadora): se actualiza cada 30 s y suena al llegar uno
  nuevo; botones de Llamar / WhatsApp / Mapa y cambio de estado en un toque.
- Flujo: Recibido → Confirmado → En preparación → En camino / Listo para recoger → Entregado (o Cancelado).
  El cliente lo ve en **Seguimiento** y, si dejó correo, recibe aviso.
- Mientras esté **Recibido**, el cliente puede **agregar productos** desde Seguimiento.
- También puedes cambiar el `estado` directo en la hoja; queda en el historial.
- ¿Usas otro CRM (HubSpot, Zoho, Kommo…)? Pon en `crm_webhook_url` una URL de Zapier/Make y cada pedido
  y cambio de estado se envía ahí.

### Comentarios
Llegan como `PENDIENTE`. En el panel → pestaña **Comentarios**: *Publicar*, *Ocultar* o responder.

---

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
npm run build   # copia shared/promos.js y regenera Seed.gs y web/data/demo.json
npm test        # pruebas del motor de promociones y del backend (simulador de Apps Script)
npm run serve   # sitio local en http://localhost:8080
```
`shared/promos.js` es la **única** fuente del cálculo de precios/promociones: no edites sus copias.
