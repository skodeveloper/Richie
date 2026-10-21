/*
 * Notificaciones: correo a la tienda y al cliente, y envío opcional a un CRM
 * externo (Zapier, Make, HubSpot, etc.) mediante "crm_webhook_url" en Config.
 * Un fallo aquí nunca debe tumbar el pedido: todo va en try/catch.
 */

var NOMBRE_ESTADO = {
  RECIBIDO: 'Recibido',
  CONFIRMADO: 'Confirmado',
  PREPARANDO: 'En preparación',
  EN_CAMINO: 'En camino',
  LISTO_RECOGER: 'Listo para recoger',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado'
};

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function dinero_(n) {
  return n === null || n === '' || n === undefined ? 'Por confirmar' : '$' + Number(n).toFixed(2);
}

function enlaceSitio_(cfg, ruta) {
  var base = String(cfg.sitio_url || '').replace(/\/+$/, '');
  return /^https:\/\//.test(base) ? base + '/' + ruta : '';
}

// Con productos sin precio no se muestra un "$0.00" engañoso.
function importe_(monto, pendiente) {
  if (!pendiente) return dinero_(monto);
  return Number(monto) > 0 ? dinero_(monto) + ' + por confirmar' : 'Por confirmar';
}

function tablaProductosHtml_(c) {
  var filas = c.lines.map(function (l) {
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #e3e3d7">' + l.cantidad + ' × ' + esc_(l.nombre) +
      (l.presentacion ? ' <small>(' + esc_(l.presentacion) + ')</small>' : '') +
      (l.promo ? ' <b style="color:#8a5a00">' + esc_(l.promo.etiqueta) + '</b>' : '') +
      '</td><td style="padding:6px 8px;border-bottom:1px solid #e3e3d7;text-align:right">' + dinero_(l.total) + '</td></tr>';
  }).join('');
  return '<table style="border-collapse:collapse;width:100%;font-size:14px">' + filas +
    '<tr><td style="padding:6px 8px">Subtotal</td><td style="padding:6px 8px;text-align:right">' + importe_(c.subtotal, c.preciosPendientes) + '</td></tr>' +
    (c.descuento ? '<tr><td style="padding:6px 8px">Descuentos</td><td style="padding:6px 8px;text-align:right">-' + dinero_(c.descuento) + '</td></tr>' : '') +
    '<tr><td style="padding:6px 8px">Envío</td><td style="padding:6px 8px;text-align:right">' + dinero_(c.envio) + '</td></tr>' +
    '<tr><td style="padding:6px 8px"><b>Total' + (c.preciosPendientes || c.envioPorConfirmar ? ' estimado' : '') + '</b></td>' +
    '<td style="padding:6px 8px;text-align:right"><b>' + importe_(c.total, c.preciosPendientes) + '</b></td></tr></table>' +
    (c.preciosPendientes ? '<p style="font-size:12px;color:#8a5a00">Hay productos sin precio en el catálogo: el total se confirma por teléfono.</p>' : '');
}

function notificarPedido_(pedido, cotizacion, cfg, tipo) {
  var titulo = (tipo === 'modificado' ? '✏️ Pedido modificado ' : '🛒 Nuevo pedido ') + pedido.folio;
  try {
    if (emailValido_(cfg.email_notificacion)) {
      var admin = enlaceSitio_(cfg, 'admin.html');
      var html = '<div style="font-family:Arial,sans-serif;color:#213d34;max-width:560px">' +
        '<h2 style="font-family:Georgia,serif;font-weight:400">' + esc_(titulo) + '</h2>' +
        '<p><b>' + esc_(pedido.nombre) + '</b> · <a href="tel:+52' + esc_(pedido.telefono) + '">' + esc_(pedido.telefono) + '</a>' +
        (pedido.email ? ' · ' + esc_(pedido.email) : '') + '</p>' +
        '<p><b>Entrega:</b> ' + (pedido.entrega === 'recoger' ? 'Pasa a recoger' :
          esc_(pedido.direccion) + ', ' + esc_(pedido.colonia) + (pedido.referencias ? ' — ' + esc_(pedido.referencias) : '')) + '<br>' +
        '<b>Pago:</b> ' + esc_(pedido.pago) + (pedido.paga_con ? ' (paga con ' + dinero_(pedido.paga_con) + ')' : '') + '</p>' +
        (pedido.notas ? '<p><b>Notas:</b> ' + esc_(pedido.notas) + '</p>' : '') +
        tablaProductosHtml_(cotizacion) +
        (cotizacion.contieneAlcohol ? '<p>⚠️ Contiene bebidas alcohólicas: verifica identificación al entregar.</p>' : '') +
        (admin ? '<p><a href="' + esc_(admin) + '">Abrir panel de pedidos</a></p>' : '') + '</div>';
      var correo = {
        to: String(cfg.email_notificacion),
        subject: titulo + ' · ' + importe_(cotizacion.total, cotizacion.preciosPendientes) + ' · ' + pedido.nombre,
        htmlBody: html,
        name: 'Pedidos La Luna'
      };
      if (pedido.email && emailValido_(pedido.email)) correo.replyTo = pedido.email;
      MailApp.sendEmail(correo);
    }
  } catch (e) {
    console.error('Correo a la tienda: ' + e);
  }

  try {
    if (tipo === 'nuevo' && pedido.email && emailValido_(pedido.email) &&
        (cfg.email_cliente === undefined || cfg.email_cliente === '' || LunaPromos.truthy(cfg.email_cliente))) {
      var seguimiento = enlaceSitio_(cfg, 'seguimiento.html?folio=' + encodeURIComponent(pedido.folio));
      MailApp.sendEmail({
        to: pedido.email,
        subject: 'Recibimos tu pedido ' + pedido.folio + ' · ' + (cfg.tienda_nombre || 'Abarrotes La Luna'),
        htmlBody: '<div style="font-family:Arial,sans-serif;color:#213d34;max-width:560px">' +
          '<h2 style="font-family:Georgia,serif;font-weight:400">¡Gracias, ' + esc_(pedido.nombre.split(' ')[0]) + '!</h2>' +
          '<p>Tu folio es <b style="font-size:18px">' + esc_(pedido.folio) + '</b>. Te avisaremos cuando confirmemos tu pedido.</p>' +
          tablaProductosHtml_(cotizacion) +
          (pedido.pago === 'transferencia' && cfg.transferencia_datos ?
            '<p><b>Datos para transferencia:</b><br>' + esc_(cfg.transferencia_datos).replace(/\n/g, '<br>') + '</p>' : '') +
          (seguimiento ? '<p><a href="' + esc_(seguimiento) + '">Sigue tu pedido aquí</a></p>' : '') + '</div>',
        name: cfg.tienda_nombre || 'Abarrotes La Luna'
      });
    }
  } catch (e) {
    console.error('Correo al cliente: ' + e);
  }

  enviarCrm_(tipo === 'nuevo' ? 'pedido.creado' : 'pedido.modificado', pedido, cotizacion, cfg);
}

function notificarCambioEstado_(pedido, cfg) {
  try {
    var avisar = ['CONFIRMADO', 'EN_CAMINO', 'LISTO_RECOGER', 'ENTREGADO', 'CANCELADO'];
    if (pedido.email && emailValido_(pedido.email) && avisar.indexOf(pedido.estado) >= 0 &&
        (cfg.email_cliente === undefined || cfg.email_cliente === '' || LunaPromos.truthy(cfg.email_cliente))) {
      var seguimiento = enlaceSitio_(cfg, 'seguimiento.html?folio=' + encodeURIComponent(pedido.folio));
      MailApp.sendEmail({
        to: pedido.email,
        subject: 'Tu pedido ' + pedido.folio + ': ' + NOMBRE_ESTADO[pedido.estado],
        htmlBody: '<div style="font-family:Arial,sans-serif;color:#213d34">' +
          '<p>Tu pedido <b>' + esc_(pedido.folio) + '</b> ahora está: <b>' + esc_(NOMBRE_ESTADO[pedido.estado]) + '</b>.</p>' +
          (pedido.nota_cliente ? '<p>' + esc_(pedido.nota_cliente) + '</p>' : '') +
          (seguimiento ? '<p><a href="' + esc_(seguimiento) + '">Ver seguimiento</a></p>' : '') + '</div>',
        name: cfg.tienda_nombre || 'Abarrotes La Luna'
      });
    }
  } catch (e) {
    console.error('Correo de estado: ' + e);
  }
  enviarCrm_('pedido.estado', pedido, null, cfg);
}

function notificarComentario_(c, cfg) {
  try {
    if (emailValido_(cfg.email_notificacion) && cfg.notificar_comentarios !== 'NO') {
      MailApp.sendEmail({
        to: String(cfg.email_notificacion),
        subject: '💬 Nuevo comentario (' + c.calificacion + '★) de ' + c.nombre,
        htmlBody: '<p>' + '★'.repeat(c.calificacion) + '</p><p>' + esc_(c.comentario) + '</p>' +
          '<p>Apruébalo u ocúltalo desde el panel o la hoja Comentarios.</p>',
        name: 'Sitio La Luna'
      });
    }
  } catch (e) {
    console.error('Correo de comentario: ' + e);
  }
}

function enviarCrm_(evento, pedido, cotizacion, cfg) {
  var url = urlSegura_(cfg.crm_webhook_url);
  if (!url) return;
  try {
    var datos = {};
    COLUMNAS.Pedidos.forEach(function (k) {
      if (k !== 'productos_json' && k !== 'historial') datos[k] = pedido[k] === undefined ? '' : pedido[k];
    });
    datos.productos_detalle = parseJson_(pedido.productos_json, []);
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ evento: evento, fecha: ahora_(), pedido: datos }),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('CRM: ' + e);
  }
}
