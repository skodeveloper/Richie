# Abarrotes La Luna · Sitio web con pedidos

Sitio de [abarroteslaluna.com.mx](https://abarroteslaluna.com.mx) conectado a Google Apps Script + Google Sheets.

**Qué incluye**
- **Tienda** con buscador y categorías, **Promociones** (se aplican solas en el carrito), **Temporada** y **Licores** (con verificación +18).
- **Pedido por pasos**: Tu pedido → Datos → Entrega → Pago → Confirmar. Se puede regresar a cualquier paso o volver a la tienda sin perder nada.
- **Seguimiento** por folio o teléfono, con línea de tiempo y opción de **agregar productos** mientras el pedido no esté confirmado.
- **Opiniones** con moderación.
- **Panel de la tienda** (`/admin.html`) con contraseña, desde el que se administra **todo** sin abrir el Google Sheet:
  pedidos en vivo (aviso sonoro, ticket para imprimir), productos (precios en línea, agotados, fotos), promociones,
  temporadas, opiniones, clientes (CRM) y ajustes (envío, colonias, pagos, avisos, horario, WhatsApp, contraseña).
- **Google Sheets como base de datos interna** (se actualiza sola al publicar código nuevo) + correo de notificación
  + webhook opcional a un CRM externo.

**Estructura**
```
web/           → lo que se sube a HostGator (public_html)
apps-script/   → código del backend (se pega en Extensiones → Apps Script del Sheet)
shared/        → motor de promociones compartido (fuente única)
data/          → catálogo inicial (desde el inventario) y datos del modo demostración
tests/         → pruebas (npm test · npm run e2e)
dist/          → paquetes listos para instalar (npm run paquete)
docs/          → guía de instalación y uso
```

**Para instalar solo necesitas dos archivos de `dist/`:**
- `Codigo.gs` → se pega completo en Extensiones → Apps Script del Sheet.
- `la-luna-hostgator.zip` → se sube y extrae en `public_html` de HostGator.

Instalación y uso diario: **[docs/GUIA-INSTALACION.md](docs/GUIA-INSTALACION.md)**.
