/*
 * API pública del sitio de Abarrotes La Luna (Apps Script como web app).
 *
 * GET  ?action=catalog | track | comments | ping
 * POST {action: createOrder | updateOrder | addComment | login | logout |
 *               adminOrders | adminUpdateOrder | adminComments | adminModerateComment}
 *
 * El navegador envía los POST como text/plain para evitar la verificación
 * CORS previa, que Apps Script no soporta. Toda respuesta es {ok, data|error}.
 */

function doGet(e) {
  return responder_(function () {
    var p = (e && e.parameter) || {};
    switch (p.action) {
      case 'catalog': return obtenerCatalogo_();
      case 'track': return rastrearPedido_(p);
      case 'comments': return comentariosPublicos_();
      case 'ping': return { pong: true, hora: ahora_() };
      default: throw new ErrorUsuario('Acción no válida.');
    }
  });
}

function doPost(e) {
  return responder_(function () {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '');
    } catch (err) {
      throw new ErrorUsuario('Solicitud inválida.');
    }
    switch (body.action) {
      case 'createOrder': return crearPedido_(body);
      case 'updateOrder': return modificarPedido_(body);
      case 'addComment': return agregarComentario_(body);
      case 'login': return iniciarSesion_(body);
      case 'logout': return cerrarSesion_(body);
      case 'adminOrders': return adminPedidos_(body);
      case 'adminUpdateOrder': return adminActualizarPedido_(body);
      case 'adminComments': return adminComentarios_(body);
      case 'adminModerateComment': return adminModerarComentario_(body);
      default: throw new ErrorUsuario('Acción no válida.');
    }
  });
}

function responder_(fn) {
  var out;
  try {
    out = { ok: true, data: fn() };
  } catch (err) {
    if (err instanceof ErrorUsuario) {
      out = { ok: false, error: err.message };
    } else {
      console.error(err && err.stack ? err.stack : err);
      out = { ok: false, error: 'Ocurrió un error en el servidor. Intenta de nuevo o llámanos.' };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
