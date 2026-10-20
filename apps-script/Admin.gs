/*
 * Panel de administración: sesión con contraseña, pedidos y comentarios.
 * La contraseña se define desde el menú 🌙 La Luna del Sheet y se guarda
 * como hash con sal en las propiedades del script.
 */

var DURACION_SESION = 21600; // 6 horas, el máximo de CacheService

function hashear_(password, sal) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + password, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function guardarContrasena_(password) {
  if (String(password || '').length < 8) throw new ErrorUsuario('La contraseña debe tener al menos 8 caracteres.');
  var props = PropertiesService.getScriptProperties();
  var sal = Utilities.getUuid();
  props.setProperties({
    ADMIN_SAL: sal,
    ADMIN_HASH: hashear_(password, sal),
    ADMIN_VERSION: Utilities.getUuid() // invalida las sesiones abiertas
  });
}

function iniciarSesion_(body) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('login_fallos') || 0);
  if (fallos >= 8) throw new ErrorUsuario('Demasiados intentos. Espera 15 minutos.');
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty('ADMIN_HASH');
  if (!hash) throw new ErrorUsuario('El panel aún no tiene contraseña. Defínela desde el menú 🌙 La Luna del Sheet.');
  if (hashear_(String(body.password || ''), props.getProperty('ADMIN_SAL')) !== hash) {
    cache.put('login_fallos', String(fallos + 1), 900);
    Utilities.sleep(700);
    throw new ErrorUsuario('Contraseña incorrecta.');
  }
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('sesion_' + token, props.getProperty('ADMIN_VERSION') || '1', DURACION_SESION);
  return { token: token, expira_en: DURACION_SESION };
}

function cerrarSesion_(body) {
  if (body.token) CacheService.getScriptCache().remove('sesion_' + String(body.token));
  return { ok: true };
}

function requerirAdmin_(body) {
  var token = String(body.token || '');
  var cache = CacheService.getScriptCache();
  var version = token && cache.get('sesion_' + token);
  if (!version || version !== (PropertiesService.getScriptProperties().getProperty('ADMIN_VERSION') || '1')) {
    throw new ErrorUsuario('SESION_EXPIRADA');
  }
  cache.put('sesion_' + token, version, DURACION_SESION); // sesión deslizante
}

function adminPedidos_(body) {
  requerirAdmin_(body);
  var filas = leerTabla_(HOJAS.PEDIDOS).reverse();
  var resumen = {};
  ESTADOS.forEach(function (e) { resumen[e] = 0; });
  var hoy = hoy_();
  var deHoy = 0;
  filas.forEach(function (r) {
    if (resumen[r.estado] !== undefined) resumen[r.estado]++;
    if (String(r.fecha).indexOf(hoy) === 0) deHoy++;
  });

  var estado = String(body.estado || '');
  var q = LunaPromos.norm(body.q || '');
  var lista = filas.filter(function (r) {
    if (estado === 'ACTIVOS' && ESTADOS_FINALES.indexOf(r.estado) >= 0) return false;
    if (estado && estado !== 'ACTIVOS' && estado !== 'TODOS' && r.estado !== estado) return false;
    if (q) {
      var texto = LunaPromos.norm([r.folio, r.nombre, r.telefono, r.colonia, r.direccion].join(' '));
      if (texto.indexOf(q) < 0) return false;
    }
    return true;
  }).slice(0, 200).map(pedidoAdmin_);

  return { pedidos: lista, resumen: resumen, hoy: deHoy, estados: ESTADOS };
}

function pedidoAdmin_(r) {
  var o = pedidoPublico_(r);
  ['nombre', 'email', 'direccion', 'colonia', 'referencias', 'paga_con', 'notas', 'nota_interna', 'actualizado']
    .forEach(function (k) { o[k] = r[k] === undefined ? '' : r[k]; });
  o.telefono = normalizarTelefono_(r.telefono) || String(r.telefono);
  o.contiene_alcohol = LunaPromos.truthy(r.contiene_alcohol);
  return o;
}

function adminActualizarPedido_(body) {
  requerirAdmin_(body);
  var estado = String(body.estado || '').toUpperCase();
  if (ESTADOS.indexOf(estado) < 0) throw new ErrorUsuario('Estado no válido.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var pedido;
  try {
    pedido = buscarPedido_(body.folio);
    if (!pedido) throw new ErrorUsuario('Pedido no encontrado.');
    var fecha = ahora_();
    var cambios = { estado: estado, actualizado: fecha };
    if (body.nota_cliente !== undefined) cambios.nota_cliente = texto_(body.nota_cliente, 300);
    if (body.nota_interna !== undefined) cambios.nota_interna = texto_(body.nota_interna, 500);
    var cambioEstado = estado !== pedido.estado;
    if (cambioEstado) {
      var historial = parseJson_(pedido.historial, []);
      historial.push({ estado: estado, fecha: fecha, nota: cambios.nota_cliente || '' });
      cambios.historial = JSON.stringify(historial);
    }
    actualizarFila_(HOJAS.PEDIDOS, pedido._fila, cambios);
    Object.keys(cambios).forEach(function (k) { pedido[k] = cambios[k]; });
  } finally {
    lock.releaseLock();
  }
  if (cambioEstado) notificarCambioEstado_(pedido, leerConfig_());
  return { pedido: pedidoAdmin_(pedido) };
}

function adminComentarios_(body) {
  requerirAdmin_(body);
  return {
    comentarios: leerTabla_(HOJAS.COMENTARIOS).reverse().slice(0, 300).map(function (c) {
      return {
        id: c.id, fecha: c.fecha, nombre: c.nombre, calificacion: c.calificacion, comentario: c.comentario,
        folio: c.folio, publicable: LunaPromos.truthy(c.publicable), estado: c.estado || 'PENDIENTE',
        respuesta: c.respuesta || ''
      };
    })
  };
}

function adminModerarComentario_(body) {
  requerirAdmin_(body);
  var estado = String(body.estado || '').toUpperCase();
  if (ESTADOS_COMENTARIO.indexOf(estado) < 0) throw new ErrorUsuario('Estado no válido.');
  var filas = leerTabla_(HOJAS.COMENTARIOS);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id) === String(body.id)) {
      var cambios = { estado: estado };
      if (body.respuesta !== undefined) cambios.respuesta = texto_(body.respuesta, 400);
      actualizarFila_(HOJAS.COMENTARIOS, filas[i]._fila, cambios);
      CacheService.getScriptCache().remove('comentarios_v1');
      return { id: filas[i].id, estado: estado };
    }
  }
  throw new ErrorUsuario('Comentario no encontrado.');
}
