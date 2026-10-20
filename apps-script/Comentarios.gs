/*
 * Comentarios y opiniones. Todo llega como PENDIENTE; solo se publican los
 * que el cliente marcó como publicables y la tienda aprobó en el panel.
 */

function comentariosPublicos_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('comentarios_v1');
  if (guardado) return JSON.parse(guardado);
  var aprobados = leerTabla_(HOJAS.COMENTARIOS).filter(function (c) {
    return c.estado === 'APROBADO' && LunaPromos.truthy(c.publicable);
  });
  var suma = 0;
  aprobados.forEach(function (c) { suma += Number(c.calificacion) || 0; });
  var data = {
    total: aprobados.length,
    promedio: aprobados.length ? LunaPromos.round2(suma / aprobados.length) : null,
    comentarios: aprobados.slice(-30).reverse().map(function (c) {
      return {
        nombre: nombreCorto_(c.nombre),
        calificacion: Number(c.calificacion) || 0,
        comentario: c.comentario,
        fecha: String(c.fecha).slice(0, 10),
        respuesta: c.respuesta || ''
      };
    })
  };
  try {
    cache.put('comentarios_v1', JSON.stringify(data), 300);
  } catch (e) {}
  return data;
}

function agregarComentario_(body) {
  if (body.website) throw new ErrorUsuario('Solicitud inválida.');
  var nombre = texto_(body.nombre, 60);
  var comentario = String(body.comentario || '').trim().slice(0, 800);
  var calificacion = Math.round(Number(body.calificacion));
  if (nombre.length < 2) throw new ErrorUsuario('Escribe tu nombre.');
  if (!(calificacion >= 1 && calificacion <= 5)) throw new ErrorUsuario('Elige de 1 a 5 estrellas.');
  if (comentario.length < 5) throw new ErrorUsuario('Escribe tu comentario.');
  limitar_('comentarios_global', 40, 3600, 'Recibimos muchos comentarios en este momento. Intenta más tarde.');

  var c = {
    id: 'C-' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000),
    fecha: ahora_(),
    nombre: nombre,
    calificacion: calificacion,
    comentario: comentario,
    folio: texto_(body.folio, 12).toUpperCase(),
    publicable: body.publicable === false ? 'NO' : 'SI',
    estado: 'PENDIENTE',
    respuesta: ''
  };
  agregarFila_(HOJAS.COMENTARIOS, c);
  notificarComentario_(c, leerConfig_());
  return { id: c.id };
}

function nombreCorto_(nombre) {
  var partes = String(nombre || '').trim().split(/\s+/);
  if (partes.length < 2) return partes[0] || 'Cliente';
  return partes[0] + ' ' + partes[1].charAt(0).toUpperCase() + '.';
}
