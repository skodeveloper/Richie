/*
 * Pedidos: creación, modificación por el cliente (solo mientras está
 * RECIBIDO) y seguimiento por folio o teléfono.
 * Los precios siempre se recalculan aquí; nunca se confía en el navegador.
 */

var MAX_RENGLONES = 60;
var MAX_CANTIDAD = 99;

function crearPedido_(body) {
  if (body.website) throw new ErrorUsuario('Solicitud inválida.'); // trampa anti-spam
  var cfg = leerConfig_();
  if (cfg.pedidos_activos !== undefined && cfg.pedidos_activos !== '' && !LunaPromos.truthy(cfg.pedidos_activos)) {
    throw new ErrorUsuario(cfg.mensaje_pedidos_pausados || 'Por el momento no estamos recibiendo pedidos en línea. Llámanos por teléfono.');
  }

  var cliente = validarCliente_(body, cfg);
  var cotizacion = cotizar_(body.items, cliente.entrega, cfg, body.mayor_edad);
  limitar_('pedido_' + cliente.telefono, 5, 600, 'Ya recibimos varios pedidos de este teléfono. Espera unos minutos o llámanos.');
  limitar_('pedidos_global', 120, 3600);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var pedido;
  try {
    var folio = nuevoFolio_();
    var fecha = ahora_();
    pedido = {
      folio: folio,
      fecha: fecha,
      estado: 'RECIBIDO',
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      email: cliente.email,
      entrega: cliente.entrega,
      direccion: cliente.direccion,
      colonia: cliente.colonia,
      referencias: cliente.referencias,
      pago: cliente.pago,
      paga_con: cliente.paga_con,
      notas: cliente.notas,
      nota_cliente: '',
      nota_interna: '',
      actualizado: fecha,
      historial: JSON.stringify([{ estado: 'RECIBIDO', fecha: fecha, nota: 'Pedido recibido' }])
    };
    aplicarCotizacion_(pedido, cotizacion);
    agregarFila_(HOJAS.PEDIDOS, pedido);
    actualizarCliente_(pedido);
  } finally {
    lock.releaseLock();
  }

  notificarPedido_(pedido, cotizacion, cfg, 'nuevo');
  return {
    folio: pedido.folio,
    estado: pedido.estado,
    fecha: pedido.fecha,
    cotizacion: cotizacion,
    transferencia: pedido.pago === 'transferencia' ? String(cfg.transferencia_datos || '') : ''
  };
}

function modificarPedido_(body) {
  var cfg = leerConfig_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var pedido, cotizacion;
  try {
    pedido = buscarPedido_(body.folio);
    if (!pedido || pedido.telefono !== normalizarTelefono_(body.telefono)) {
      throw new ErrorUsuario('No encontramos un pedido con ese folio y teléfono.');
    }
    if (pedido.estado !== 'RECIBIDO') {
      throw new ErrorUsuario('Tu pedido ya está en preparación y no se puede modificar en línea. Llámanos para agregar productos.');
    }
    cotizacion = cotizar_(body.items, pedido.entrega, cfg, body.mayor_edad);
    var fecha = ahora_();
    var historial = parseJson_(pedido.historial, []);
    historial.push({ estado: 'RECIBIDO', fecha: fecha, nota: 'El cliente modificó su pedido' });
    var cambios = { actualizado: fecha, historial: JSON.stringify(historial) };
    if (body.notas !== undefined) cambios.notas = texto_(body.notas, 500);
    aplicarCotizacion_(cambios, cotizacion);
    actualizarFila_(HOJAS.PEDIDOS, pedido._fila, cambios);
    Object.keys(cambios).forEach(function (k) { pedido[k] = cambios[k]; });
  } finally {
    lock.releaseLock();
  }
  notificarPedido_(pedido, cotizacion, cfg, 'modificado');
  return { folio: pedido.folio, estado: pedido.estado, cotizacion: cotizacion };
}

function rastrearPedido_(p) {
  var folio = String(p.folio || '').trim().toUpperCase();
  var tel = normalizarTelefono_(p.telefono);
  if (!folio && !tel) throw new ErrorUsuario('Escribe tu folio o tu teléfono.');
  limitar_('rastreo_global', 600, 600);

  if (folio) {
    var pedido = buscarPedido_(folio);
    if (!pedido || (tel && pedido.telefono !== tel)) {
      throw new ErrorUsuario('No encontramos ese pedido. Revisa el folio' + (tel ? ' y el teléfono.' : '.'));
    }
    return { pedido: pedidoPublico_(pedido) };
  }

  // Por teléfono solo se muestra el resumen (sin productos ni dirección).
  var pedidos = leerTabla_(HOJAS.PEDIDOS)
    .filter(function (r) { return String(r.telefono) === tel; })
    .slice(-5)
    .reverse()
    .map(function (r) {
      return { folio: r.folio, fecha: r.fecha, estado: r.estado, total: r.total, piezas: r.piezas, entrega: r.entrega };
    });
  if (!pedidos.length) throw new ErrorUsuario('No encontramos pedidos con ese teléfono.');
  return { pedidos: pedidos };
}

function pedidoPublico_(r) {
  return {
    folio: r.folio,
    fecha: r.fecha,
    estado: r.estado,
    entrega: r.entrega,
    pago: r.pago,
    productos: parseJson_(r.productos_json, []),
    piezas: r.piezas,
    subtotal: r.subtotal,
    descuento: r.descuento,
    envio: r.envio === '' ? null : r.envio,
    total: r.total,
    precios_pendientes: LunaPromos.truthy(r.precios_pendientes),
    nota_cliente: r.nota_cliente || '',
    historial: parseJson_(r.historial, []),
    editable: r.estado === 'RECIBIDO'
  };
}

function buscarPedido_(folio) {
  var f = String(folio || '').trim().toUpperCase();
  if (!/^LL-[A-Z0-9]{5,8}$/.test(f)) return null;
  var filas = leerTabla_(HOJAS.PEDIDOS);
  for (var i = filas.length - 1; i >= 0; i--) {
    if (String(filas[i].folio).toUpperCase() === f) {
      filas[i].telefono = normalizarTelefono_(filas[i].telefono);
      return filas[i];
    }
  }
  return null;
}

function validarCliente_(b, cfg) {
  var c = {
    nombre: texto_(b.nombre, 80),
    telefono: normalizarTelefono_(b.telefono),
    email: texto_(b.email, 120).toLowerCase(),
    entrega: b.entrega === 'recoger' ? 'recoger' : 'domicilio',
    direccion: texto_(b.direccion, 200),
    colonia: texto_(b.colonia, 80),
    referencias: texto_(b.referencias, 200),
    pago: b.pago === 'transferencia' ? 'transferencia' : 'efectivo',
    paga_con: LunaPromos.num(b.paga_con),
    notas: texto_(b.notas, 500)
  };
  if (c.nombre.length < 2) throw new ErrorUsuario('Escribe tu nombre.');
  if (!c.telefono) throw new ErrorUsuario('Escribe un teléfono de 10 dígitos.');
  if (c.email && !emailValido_(c.email)) throw new ErrorUsuario('El correo no es válido.');
  if (c.entrega === 'recoger' && cfg.permitir_recoger !== undefined && cfg.permitir_recoger !== '' &&
      !LunaPromos.truthy(cfg.permitir_recoger)) {
    throw new ErrorUsuario('Por ahora solo hacemos entregas a domicilio.');
  }
  if (c.entrega === 'domicilio') {
    if (c.direccion.length < 5) throw new ErrorUsuario('Escribe tu dirección (calle y número).');
    if (!c.colonia) throw new ErrorUsuario('Escribe tu colonia.');
    var cobertura = listaCobertura_(cfg);
    if (cobertura.length && cobertura.indexOf(LunaPromos.norm(c.colonia)) < 0) {
      throw new ErrorUsuario('Por ahora no entregamos en esa colonia. Puedes pasar a recoger tu pedido.');
    }
  }
  if (c.pago === 'transferencia' && cfg.pago_transferencia !== undefined && cfg.pago_transferencia !== '' &&
      !LunaPromos.truthy(cfg.pago_transferencia)) {
    throw new ErrorUsuario('Por ahora no aceptamos transferencia.');
  }
  if (c.pago !== 'efectivo') c.paga_con = null;
  return c;
}

function listaCobertura_(cfg) {
  return String(cfg.colonias_cobertura || '').split(',')
    .map(function (s) { return LunaPromos.norm(s); })
    .filter(String);
}

function cotizar_(items, entrega, cfg, mayorEdad) {
  if (!Array.isArray(items) || !items.length) throw new ErrorUsuario('Tu pedido está vacío.');
  if (items.length > MAX_RENGLONES) throw new ErrorUsuario('Tu pedido tiene demasiados productos distintos.');
  var catalogo = construirCatalogo_();
  var porId = {};
  catalogo.productos.forEach(function (p) { porId[p.id] = p; });

  var limpios = items.map(function (it) {
    var cantidad = Math.floor(Number(it && it.cantidad));
    if (!(cantidad >= 1 && cantidad <= MAX_CANTIDAD)) throw new ErrorUsuario('Cantidad no válida.');
    var p = porId[String(it.id)];
    if (p && !p.disponible) throw new ErrorUsuario(p.nombre + ' está agotado por ahora. Quítalo de tu pedido.');
    return { id: String(it.id), cantidad: cantidad };
  });

  var c = LunaPromos.quote(limpios, porId, catalogo.promociones, {
    today: catalogo.hoy,
    entrega: entrega,
    envioCosto: cfg.envio_costo,
    envioGratisDesde: cfg.envio_gratis_desde
  });
  if (c.faltantes.length) throw new ErrorUsuario('Algunos productos ya no están disponibles. Actualiza tu carrito.');
  if (!c.lines.length) throw new ErrorUsuario('Tu pedido está vacío.');
  if (c.contieneAlcohol && mayorEdad !== true) {
    throw new ErrorUsuario('Para comprar bebidas alcohólicas confirma que eres mayor de 18 años.');
  }
  var minimo = LunaPromos.num(cfg.pedido_minimo);
  if (minimo !== null && !c.preciosPendientes && c.subtotal - c.descuento < minimo) {
    throw new ErrorUsuario('El pedido mínimo es de $' + minimo + '.');
  }
  return c;
}

function aplicarCotizacion_(destino, c) {
  destino.productos = c.lines.map(function (l) {
    return l.cantidad + ' × ' + l.nombre + (l.presentacion ? ' (' + l.presentacion + ')' : '') +
      (l.promo ? ' [' + l.promo.etiqueta + ']' : '');
  }).join('\n');
  destino.productos_json = JSON.stringify(c.lines.map(function (l) {
    return {
      id: l.id, nombre: l.nombre, presentacion: l.presentacion, cantidad: l.cantidad, precio: l.precio,
      descuento: l.descuento, total: l.total, promo: l.promo ? l.promo.etiqueta : '', es_alcohol: l.es_alcohol
    };
  }));
  destino.piezas = c.piezas;
  destino.subtotal = c.subtotal;
  destino.descuento = c.descuento;
  destino.envio = c.envio === null ? '' : c.envio;
  destino.total = c.total;
  destino.precios_pendientes = c.preciosPendientes || c.envioPorConfirmar ? 'SI' : 'NO';
  destino.contiene_alcohol = c.contieneAlcohol ? 'SI' : 'NO';
}

function nuevoFolio_() {
  var alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var existentes = {};
  leerTabla_(HOJAS.PEDIDOS).forEach(function (r) { existentes[String(r.folio)] = true; });
  for (var intento = 0; intento < 20; intento++) {
    var f = 'LL-';
    for (var i = 0; i < 5; i++) f += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
    if (!existentes[f]) return f;
  }
  throw new Error('No se pudo generar un folio único.');
}

// La hoja Clientes funciona como CRM: un renglón por teléfono.
function actualizarCliente_(pedido) {
  var filas = leerTabla_(HOJAS.CLIENTES);
  var existente = null;
  for (var i = 0; i < filas.length; i++) {
    if (normalizarTelefono_(filas[i].telefono) === pedido.telefono) {
      existente = filas[i];
      break;
    }
  }
  var datos = {
    nombre: pedido.nombre,
    ultimo_pedido: pedido.fecha,
    ultimo_folio: pedido.folio
  };
  if (pedido.email) datos.email = pedido.email;
  if (pedido.entrega === 'domicilio') {
    datos.direccion = pedido.direccion;
    datos.colonia = pedido.colonia;
  }
  if (existente) {
    datos.pedidos = (Number(existente.pedidos) || 0) + 1;
    datos.total_acumulado = LunaPromos.round2((Number(existente.total_acumulado) || 0) + (Number(pedido.total) || 0));
    actualizarFila_(HOJAS.CLIENTES, existente._fila, datos);
  } else {
    datos.telefono = pedido.telefono;
    datos.pedidos = 1;
    datos.total_acumulado = Number(pedido.total) || 0;
    datos.primer_pedido = pedido.fecha;
    agregarFila_(HOJAS.CLIENTES, datos);
  }
}
