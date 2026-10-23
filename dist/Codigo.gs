// Abarrotes La Luna · backend completo en un solo archivo.
// Pégalo entero en Extensiones → Apps Script (reemplazando Código.gs).
// ARCHIVO GENERADO por `npm run paquete` desde apps-script/ — para cambios, edita allá.

// ===================== Promos.gs =====================
/*
 * Motor de promociones y cálculo del pedido de Abarrotes La Luna.
 *
 * FUENTE ÚNICA: shared/promos.js. `npm run build` lo copia a
 * web/assets/js/promos.js (navegador) y apps-script/Promos.gs (servidor),
 * así el carrito y el servidor calculan exactamente lo mismo.
 * No edites las copias.
 *
 * Tipos de promoción (columna "tipo" de la hoja Promociones):
 *   PORCENTAJE       valor = % de descuento (ej. 15)
 *   PRECIO_ESPECIAL  valor = nuevo precio por pieza (ej. 25.50)
 *   DESCUENTO_PIEZA  valor = pesos de descuento por pieza (ej. 5)
 *   NXM              lleva = N, paga = M (2x1 → lleva 2, paga 1)
 *
 * "aplica_a" acepta, separados por coma: ids de producto, cat:Categoría,
 * marca:Marca o * (todo). Por renglón del carrito se aplica solo la mejor
 * promoción (no se acumulan).
 *
 * Productos a granel (unidad = 'kg'): la cantidad son kilos en pasos de ¼
 * (0.25, 0.5, 0.75, 1…) y el precio es por kilo.
 */
var LunaPromos = (function () {
  var TIPOS = ['PORCENTAJE', 'PRECIO_ESPECIAL', 'DESCUENTO_PIEZA', 'NXM'];

  var PASO_KG = 0.25;
  var MAX_KG = 25;

  function esGranel(p) {
    return !!p && String(p.unidad || '').toLowerCase() === 'kg';
  }

  // Cantidad válida según la unidad: piezas enteras o kilos en cuartos.
  function cantidadValida(p, cantidad) {
    var n = Number(cantidad);
    if (!isFinite(n)) return 0;
    if (esGranel(p)) return Math.min(MAX_KG, Math.round(n / PASO_KG) * PASO_KG);
    return Math.floor(n);
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function truthy(v) {
    if (v === true || v === 1) return true;
    if (typeof v !== 'string') return false;
    var s = v.trim().toUpperCase();
    return s === 'SI' || s === 'SÍ' || s === 'TRUE' || s === 'VERDADERO' || s === 'X' || s === '1';
  }

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(typeof v === 'string' ? v.replace(/[$,\s]/g, '') : v);
    return isFinite(n) ? n : null;
  }

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  }

  // today y las fechas son cadenas 'YYYY-MM-DD'; vacío = sin límite.
  function isActive(promo, today) {
    if (!promo || !truthy(promo.activa)) return false;
    if (TIPOS.indexOf(String(promo.tipo || '').toUpperCase()) < 0) return false;
    if (promo.inicio && today < promo.inicio) return false;
    if (promo.fin && today > promo.fin) return false;
    return true;
  }

  function matches(promo, product) {
    var tokens = String(promo.aplica_a || '').split(',');
    for (var i = 0; i < tokens.length; i++) {
      var t = norm(tokens[i]);
      if (!t) continue;
      if (t === '*') return true;
      if (t.indexOf('cat:') === 0) {
        if (norm(product.categoria) === t.slice(4).trim()) return true;
      } else if (t.indexOf('marca:') === 0) {
        if (norm(product.marca) === t.slice(6).trim()) return true;
      } else if (t === norm(product.id)) {
        return true;
      }
    }
    return false;
  }

  function lineDiscount(promo, precio, cantidad) {
    if (precio == null || !(cantidad > 0)) return 0;
    var valor = num(promo.valor);
    var d = 0;
    switch (String(promo.tipo || '').toUpperCase()) {
      case 'PORCENTAJE':
        if (valor > 0 && valor <= 100) d = precio * cantidad * valor / 100;
        break;
      case 'PRECIO_ESPECIAL':
        if (valor !== null && valor >= 0 && valor < precio) d = (precio - valor) * cantidad;
        break;
      case 'DESCUENTO_PIEZA':
        if (valor > 0) d = Math.min(valor, precio) * cantidad;
        break;
      case 'NXM':
        var lleva = num(promo.lleva);
        var paga = num(promo.paga);
        if (lleva > 0 && paga !== null && paga >= 0 && paga < lleva) {
          d = Math.floor(cantidad / lleva) * (lleva - paga) * precio;
        }
        break;
    }
    return round2(Math.max(0, d));
  }

  function label(promo) {
    var valor = num(promo.valor);
    switch (String(promo.tipo || '').toUpperCase()) {
      case 'PORCENTAJE': return '-' + valor + '%';
      case 'PRECIO_ESPECIAL': return 'Precio especial $' + round2(valor);
      case 'DESCUENTO_PIEZA': return '-$' + round2(valor) + ' c/u';
      case 'NXM': return num(promo.lleva) + 'x' + num(promo.paga);
    }
    return 'Promoción';
  }

  function promosFor(product, promos, today) {
    return (promos || []).filter(function (p) {
      return isActive(p, today) && matches(p, product);
    });
  }

  function bestPromo(product, promos, today, cantidad) {
    var precio = num(product.precio);
    var best = null;
    var bestD = 0;
    promosFor(product, promos, today).forEach(function (p) {
      var d = lineDiscount(p, precio, cantidad);
      if (d > bestD || (!best && d === 0)) {
        best = p;
        bestD = d;
      }
    });
    return { promo: best, descuento: bestD };
  }

  /*
   * items: [{id, cantidad}]; productsById: {id: producto};
   * opts: {today, entrega: 'domicilio'|'recoger', envioCosto, envioGratisDesde}
   */
  function quote(items, productsById, promos, opts) {
    opts = opts || {};
    var lines = [];
    var faltantes = [];
    var subtotal = 0;
    var descuento = 0;
    var piezas = 0;
    var pendientes = false;
    var alcohol = false;

    (items || []).forEach(function (it) {
      var p = productsById[it.id];
      if (!(Number(it.cantidad) > 0)) return;
      if (!p) {
        faltantes.push(String(it.id));
        return;
      }
      var cantidad = cantidadValida(p, it.cantidad);
      if (!(cantidad > 0)) return;
      var precio = num(p.precio);
      var importe = precio === null ? null : round2(precio * cantidad);
      var best = bestPromo(p, promos, opts.today, cantidad);
      var d = precio === null ? 0 : best.descuento;
      if (precio === null) pendientes = true;
      else subtotal += importe;
      descuento += d;
      piezas += esGranel(p) ? 1 : cantidad;
      if (truthy(p.es_alcohol)) alcohol = true;
      lines.push({
        id: String(p.id),
        nombre: p.nombre,
        presentacion: p.presentacion || '',
        cantidad: cantidad,
        unidad: esGranel(p) ? 'kg' : '',
        precio: precio,
        importe: importe,
        descuento: d,
        promo: best.promo ? { id: best.promo.id, titulo: best.promo.titulo, etiqueta: label(best.promo) } : null,
        total: importe === null ? null : round2(importe - d),
        es_alcohol: truthy(p.es_alcohol)
      });
    });

    subtotal = round2(subtotal);
    descuento = round2(descuento);
    var envio = 0;
    if (opts.entrega === 'domicilio') {
      var costo = num(opts.envioCosto);
      var gratisDesde = num(opts.envioGratisDesde);
      if (costo === null) envio = null;
      else if (gratisDesde !== null && !pendientes && subtotal - descuento >= gratisDesde) envio = 0;
      else envio = costo;
    }

    return {
      lines: lines,
      faltantes: faltantes,
      piezas: piezas,
      subtotal: subtotal,
      descuento: descuento,
      envio: envio,
      envioPorConfirmar: envio === null,
      total: round2(subtotal - descuento + (envio || 0)),
      preciosPendientes: pendientes,
      contieneAlcohol: alcohol
    };
  }

  return {
    TIPOS: TIPOS,
    PASO_KG: PASO_KG,
    MAX_KG: MAX_KG,
    esGranel: esGranel,
    cantidadValida: cantidadValida,
    round2: round2,
    truthy: truthy,
    num: num,
    norm: norm,
    isActive: isActive,
    matches: matches,
    lineDiscount: lineDiscount,
    label: label,
    promosFor: promosFor,
    bestPromo: bestPromo,
    quote: quote
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LunaPromos;

// ===================== Config.gs =====================
/*
 * Estructura del Google Sheet y utilidades de lectura/escritura.
 * El Sheet es el panel de control: lo que se edita ahí se refleja en la web.
 */

var TZ = 'America/Mexico_City';

var HOJAS = {
  CONFIG: 'Config',
  PRODUCTOS: 'Productos',
  PROMOCIONES: 'Promociones',
  TEMPORADAS: 'Temporadas',
  PEDIDOS: 'Pedidos',
  CLIENTES: 'Clientes',
  COMENTARIOS: 'Comentarios'
};

var COLUMNAS = {
  Config: ['clave', 'valor', 'descripcion'],
  Productos: ['id', 'nombre', 'categoria', 'marca', 'presentacion', 'precio', 'imagen', 'descripcion',
    'visible', 'disponible', 'destacado', 'es_alcohol', 'temporada', 'orden', 'unidad', 'codigo'],
  Promociones: ['id', 'titulo', 'descripcion', 'tipo', 'valor', 'lleva', 'paga', 'aplica_a',
    'inicio', 'fin', 'activa', 'imagen'],
  Temporadas: ['id', 'nombre', 'descripcion', 'inicio', 'fin', 'activa', 'imagen'],
  Pedidos: ['folio', 'fecha', 'estado', 'nombre', 'telefono', 'email', 'entrega', 'direccion', 'colonia',
    'referencias', 'pago', 'paga_con', 'notas', 'productos', 'piezas', 'subtotal', 'descuento', 'envio',
    'total', 'precios_pendientes', 'contiene_alcohol', 'nota_cliente', 'nota_interna', 'actualizado',
    'historial', 'productos_json'],
  Clientes: ['telefono', 'nombre', 'email', 'direccion', 'colonia', 'pedidos', 'total_acumulado',
    'primer_pedido', 'ultimo_pedido', 'ultimo_folio'],
  Comentarios: ['id', 'fecha', 'nombre', 'calificacion', 'comentario', 'folio', 'publicable', 'estado', 'respuesta']
};

var ESTADOS = ['RECIBIDO', 'CONFIRMADO', 'PREPARANDO', 'EN_CAMINO', 'LISTO_RECOGER', 'ENTREGADO', 'CANCELADO'];
var ESTADOS_FINALES = ['ENTREGADO', 'CANCELADO'];
var ESTADOS_COMENTARIO = ['PENDIENTE', 'APROBADO', 'OCULTO'];

// Claves de Config que nunca se envían al navegador.
var CONFIG_PRIVADA = ['email_notificacion', 'crm_webhook_url', 'email_cliente'];

class ErrorUsuario extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorUsuario';
  }
}

function libro_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function hoja_(nombre) {
  var sh = libro_().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja "' + nombre + '". Ejecuta 🌙 La Luna → Configuración inicial.');
  return sh;
}

function encabezados_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

function leerTabla_(nombre) {
  var sh = hoja_(nombre);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var filas = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row.some(function (c) { return c !== '' && c !== null; })) continue;
    var o = { _fila: i + 1 };
    headers.forEach(function (h, j) {
      if (h) o[h] = limpiarCelda_(row[j]);
    });
    filas.push(o);
  }
  return filas;
}

function limpiarCelda_(v) {
  if (v instanceof Date) {
    var hora = Utilities.formatDate(v, TZ, 'HH:mm');
    return Utilities.formatDate(v, TZ, hora === '00:00' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
  }
  if (typeof v === 'string') return v.trim();
  return v;
}

// Evita que un texto escrito por un cliente se interprete como fórmula en Sheets.
function sanitizar_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

function agregarFila_(nombre, obj) {
  var sh = hoja_(nombre);
  var fila = encabezados_(sh).map(function (h) { return sanitizar_(obj[h]); });
  sh.appendRow(fila);
}

function actualizarFila_(nombre, numFila, cambios) {
  var sh = hoja_(nombre);
  var headers = encabezados_(sh);
  Object.keys(cambios).forEach(function (k) {
    var col = headers.indexOf(k);
    if (col >= 0) sh.getRange(numFila, col + 1).setValue(sanitizar_(cambios[k]));
  });
}

function leerConfig_() {
  var cfg = {};
  leerTabla_(HOJAS.CONFIG).forEach(function (r) {
    if (r.clave) cfg[String(r.clave)] = r.valor;
  });
  return cfg;
}

function configPublica_(cfg) {
  var out = {};
  Object.keys(cfg).forEach(function (k) {
    if (CONFIG_PRIVADA.indexOf(k) < 0) out[k] = cfg[k];
  });
  return out;
}

function hoy_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function ahora_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
}

function texto_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

// "½ kg Jamón" para granel, "2 × Leche" para piezas.
var FRACCIONES_ = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };
function cantidadTexto_(l) {
  if (l.unidad !== 'kg') return l.cantidad + ' ×';
  var enteros = Math.floor(l.cantidad);
  var frac = FRACCIONES_[Math.round((l.cantidad - enteros) * 100) / 100];
  return ((enteros ? enteros + (frac ? ' ' : '') : '') + (frac === undefined ? '' : frac) || l.cantidad) + ' kg';
}

function normalizarTelefono_(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('52') === 0) d = d.slice(2);
  if (d.length === 13 && d.indexOf('521') === 0) d = d.slice(3);
  return d.length === 10 ? d : '';
}

function emailValido_(v) {
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(String(v || ''));
}

function urlSegura_(v) {
  var s = String(v || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

function parseJson_(s, defecto) {
  try {
    return s ? JSON.parse(s) : defecto;
  } catch (e) {
    return defecto;
  }
}

// Límite simple de frecuencia con CacheService (ventana fija).
function limitar_(clave, maximo, segundos, mensaje) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('rl_' + clave) || 0);
  if (n >= maximo) throw new ErrorUsuario(mensaje || 'Demasiadas solicitudes. Intenta en unos minutos.');
  cache.put('rl_' + clave, String(n + 1), segundos);
}

// ===================== Code.gs =====================
/*
 * API pública del sitio de Abarrotes La Luna (Apps Script como web app).
 *
 * GET  ?action=catalog | track | comments | ping
 * POST {action: createOrder | updateOrder | addComment | login | logout | admin*}
 *      (las acciones admin* requieren el token de sesión del panel)
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
      case 'adminCatalog': return adminCatalogo_(body);
      case 'adminSaveProducts': return adminGuardarProductos_(body);
      case 'adminDeleteProduct': return adminEliminarProducto_(body);
      case 'adminSavePromo': return adminGuardarPromo_(body);
      case 'adminDeletePromo': return adminEliminarPromo_(body);
      case 'adminSaveSeason': return adminGuardarTemporada_(body);
      case 'adminDeleteSeason': return adminEliminarTemporada_(body);
      case 'adminSaveConfig': return adminGuardarConfig_(body);
      case 'adminClients': return adminClientes_(body);
      case 'adminChangePassword': return adminCambiarContrasena_(body);
      case 'adminUploadImage': return adminSubirFoto_(body);
      case 'adminImportProducts': return adminImportarProductos_(body);
      default: throw new ErrorUsuario('Acción no válida.');
    }
  });
}

function responder_(fn) {
  var out;
  try {
    asegurarEstructura_();
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

// ===================== Admin.gs =====================
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

// ===================== Catalogo.gs =====================
/*
 * Catálogo público: productos visibles, promociones vigentes, temporadas
 * activas y la configuración pública de la tienda.
 */

var CACHE_CATALOGO = 'catalogo_v1';

function obtenerCatalogo_() {
  var guardado = cacheLeer_(CACHE_CATALOGO);
  if (guardado) return JSON.parse(guardado);
  var data = construirCatalogo_();
  try {
    cacheGuardar_(CACHE_CATALOGO, JSON.stringify(data), 300);
  } catch (e) {
    // Si la caché falla, el catálogo se sirve directo de la hoja.
  }
  return data;
}

// CacheService acepta 100 KB por clave: el catálogo grande se guarda en partes.
var PARTE_CACHE = 45000; // caracteres (con acentos, < 100 KB)

function cacheGuardar_(clave, texto, segundos) {
  var partes = {};
  var n = Math.ceil(texto.length / PARTE_CACHE);
  for (var i = 0; i < n; i++) partes[clave + '_' + i] = texto.substr(i * PARTE_CACHE, PARTE_CACHE);
  var cache = CacheService.getScriptCache();
  cache.putAll(partes, segundos);
  cache.put(clave + '_n', String(n), segundos);
}

function cacheLeer_(clave) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(clave + '_n') || 0);
  if (!n) return null;
  var claves = [];
  for (var i = 0; i < n; i++) claves.push(clave + '_' + i);
  var partes = cache.getAll(claves);
  var texto = '';
  for (var j = 0; j < n; j++) {
    if (partes[claves[j]] === undefined || partes[claves[j]] === null) return null;
    texto += partes[claves[j]];
  }
  return texto;
}

function limpiarCacheCatalogo_() {
  CacheService.getScriptCache().removeAll([CACHE_CATALOGO + '_n', 'comentarios_v1']);
}

function construirCatalogo_() {
  var hoy = hoy_();
  var cfg = leerConfig_();
  var productos = leerTabla_(HOJAS.PRODUCTOS)
    .filter(function (p) { return p.id && p.nombre && LunaPromos.truthy(p.visible); })
    .map(normalizarProducto_);
  var promociones = leerTabla_(HOJAS.PROMOCIONES)
    .map(normalizarPromo_)
    .filter(function (p) { return p.id && LunaPromos.isActive(p, hoy); });
  var temporadas = leerTabla_(HOJAS.TEMPORADAS)
    .map(normalizarTemporada_)
    .filter(function (t) { return t.id && t.activa && (!t.inicio || hoy >= t.inicio) && (!t.fin || hoy <= t.fin); });
  return {
    generado: new Date().toISOString(),
    hoy: hoy,
    config: configPublica_(cfg),
    productos: productos,
    promociones: promociones,
    temporadas: temporadas
  };
}

function normalizarProducto_(p) {
  return {
    id: String(p.id),
    nombre: texto_(p.nombre, 120),
    categoria: texto_(p.categoria, 60) || 'Otros',
    marca: texto_(p.marca, 60),
    presentacion: texto_(p.presentacion, 60),
    precio: LunaPromos.num(p.precio),
    imagen: urlSegura_(p.imagen),
    descripcion: texto_(p.descripcion, 300),
    disponible: p.disponible === '' || p.disponible === undefined ? true : LunaPromos.truthy(p.disponible),
    destacado: LunaPromos.truthy(p.destacado),
    es_alcohol: LunaPromos.truthy(p.es_alcohol),
    temporada: texto_(p.temporada, 60),
    orden: LunaPromos.num(p.orden),
    unidad: String(p.unidad || '').toLowerCase() === 'kg' ? 'kg' : ''
  };
}

function normalizarPromo_(p) {
  return {
    id: String(p.id || ''),
    titulo: texto_(p.titulo, 100),
    descripcion: texto_(p.descripcion, 300),
    tipo: String(p.tipo || '').toUpperCase().trim(),
    valor: LunaPromos.num(p.valor),
    lleva: LunaPromos.num(p.lleva),
    paga: LunaPromos.num(p.paga),
    aplica_a: String(p.aplica_a || ''),
    inicio: fecha_(p.inicio),
    fin: fecha_(p.fin),
    activa: LunaPromos.truthy(p.activa),
    imagen: urlSegura_(p.imagen)
  };
}

function normalizarTemporada_(t) {
  return {
    id: String(t.id || ''),
    nombre: texto_(t.nombre, 100),
    descripcion: texto_(t.descripcion, 300),
    inicio: fecha_(t.inicio),
    fin: fecha_(t.fin),
    activa: LunaPromos.truthy(t.activa),
    imagen: urlSegura_(t.imagen)
  };
}

// Acepta 2026-10-31 o 31/10/2026; devuelve 'YYYY-MM-DD' o '' (sin límite).
function fecha_(v) {
  var s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

// ===================== Comentarios.gs =====================
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

// ===================== Gestion.gs =====================
/*
 * Gestión desde el panel web: catálogo, promociones, temporadas, ajustes,
 * clientes, contraseña y fotos. Con esto la tienda nunca abre el Sheet;
 * la hoja queda solo como base de datos.
 */

var CAMPOS_PRODUCTO = ['nombre', 'categoria', 'marca', 'presentacion', 'precio', 'imagen', 'descripcion',
  'visible', 'disponible', 'destacado', 'es_alcohol', 'temporada', 'orden', 'unidad'];
var AJUSTES_SI_NO = ['email_cliente', 'notificar_comentarios', 'pedidos_activos', 'permitir_recoger',
  'pago_efectivo', 'pago_transferencia'];
var AJUSTES_MONTO = ['envio_costo', 'envio_gratis_desde', 'pedido_minimo'];
var TIPOS_FOTO = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function slug_(s) {
  return LunaPromos.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

function idUnico_(base, existentes) {
  var id = base;
  var n = 2;
  while (existentes[id]) id = base + '-' + n++;
  return id;
}

function siNo_(v) {
  return LunaPromos.truthy(v) ? 'SI' : 'NO';
}

function numOVacio_(v, nombre, min, max) {
  if (v === '' || v === null || v === undefined) return '';
  var n = LunaPromos.num(v);
  if (n === null || n < min || n > max) throw new ErrorUsuario(nombre + ' no es válido.');
  return n;
}

function fechaOVacia_(v, nombre) {
  var s = String(v || '').trim();
  if (!s) return '';
  var f = fecha_(s);
  if (!f) throw new ErrorUsuario('La fecha de ' + nombre + ' no es válida.');
  return f;
}

function urlOVacia_(v) {
  var s = String(v || '').trim();
  if (s && !urlSegura_(s)) throw new ErrorUsuario('El enlace de la foto debe empezar con https://');
  return s;
}

function estadoVigencia_(activa, inicio, fin, hoy) {
  if (!activa) return 'APAGADA';
  if (inicio && hoy < inicio) return 'PROGRAMADA';
  if (fin && hoy > fin) return 'VENCIDA';
  return 'ACTIVA';
}

function filaCompleta_(headers, obj) {
  return headers.map(function (h) { return sanitizar_(obj[h] === undefined ? '' : obj[h]); });
}

function conCandado_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------- Catálogo completo para el panel ----------

function productoAdmin_(r) {
  var p = normalizarProducto_(r);
  p.visible = LunaPromos.truthy(r.visible);
  p.codigo = texto_(r.codigo, 40);
  return p;
}

function adminCatalogo_(body) {
  requerirAdmin_(body);
  var hoy = hoy_();
  var productos = leerTabla_(HOJAS.PRODUCTOS).filter(function (r) { return r.id; }).map(productoAdmin_);
  var porTemporada = {};
  productos.forEach(function (p) { if (p.temporada) porTemporada[p.temporada] = (porTemporada[p.temporada] || 0) + 1; });
  return {
    hoy: hoy,
    productos: productos,
    promociones: leerTabla_(HOJAS.PROMOCIONES).filter(function (r) { return r.id; }).map(function (r) {
      var p = normalizarPromo_(r);
      p.estado = estadoVigencia_(p.activa, p.inicio, p.fin, hoy);
      return p;
    }),
    temporadas: leerTabla_(HOJAS.TEMPORADAS).filter(function (r) { return r.id; }).map(function (r) {
      var t = normalizarTemporada_(r);
      t.estado = estadoVigencia_(t.activa, t.inicio, t.fin, hoy);
      t.productos = porTemporada[t.id] || 0;
      return t;
    }),
    config: leerConfig_()
  };
}

// ---------- Productos ----------

function valorProducto_(k, v, temporadas) {
  switch (k) {
    case 'nombre': return texto_(v, 120);
    case 'categoria':
    case 'marca':
    case 'presentacion': return texto_(v, 60);
    case 'descripcion': return texto_(v, 300);
    case 'precio': return numOVacio_(v, 'El precio', 0, 1000000);
    case 'orden': return numOVacio_(v, 'El orden', -100000, 100000);
    case 'imagen': return urlOVacia_(v);
    case 'unidad': return String(v || '').toLowerCase() === 'kg' ? 'kg' : '';
    case 'temporada':
      var t = String(v || '').trim();
      if (t && !temporadas[t]) throw new ErrorUsuario('Esa temporada ya no existe. Recarga el panel.');
      return t;
    default: return siNo_(v);
  }
}

// Guarda uno o varios productos (alta con {nuevo: true}, o cambios parciales por id).
function adminGuardarProductos_(body) {
  requerirAdmin_(body);
  var lista = Array.isArray(body.productos) ? body.productos : [];
  if (!lista.length || lista.length > 300) throw new ErrorUsuario('No hay cambios para guardar.');
  var guardados = conCandado_(function () {
    var sh = hoja_(HOJAS.PRODUCTOS);
    var headers = encabezados_(sh);
    var filas = leerTabla_(HOJAS.PRODUCTOS);
    var porId = {};
    filas.forEach(function (r) { porId[String(r.id)] = r; });
    var temporadas = {};
    leerTabla_(HOJAS.TEMPORADAS).forEach(function (t) { temporadas[String(t.id)] = true; });
    var maxOrden = 0;
    filas.forEach(function (r) { maxOrden = Math.max(maxOrden, Number(r.orden) || 0); });

    return lista.map(function (cambios) {
      var actual;
      if (cambios.nuevo) {
        var nombre = texto_(cambios.nombre, 120);
        if (nombre.length < 2) throw new ErrorUsuario('Escribe el nombre del producto.');
        actual = {
          id: idUnico_(slug_(nombre + ' ' + (cambios.presentacion || '')), porId),
          visible: 'SI', disponible: 'SI', destacado: 'NO', es_alcohol: 'NO', orden: ++maxOrden
        };
      } else {
        actual = porId[String(cambios.id)];
        if (!actual) throw new ErrorUsuario('No encontramos ese producto. Recarga el panel.');
      }
      var nuevo = {};
      Object.keys(actual).forEach(function (k) { nuevo[k] = actual[k]; });
      CAMPOS_PRODUCTO.forEach(function (k) {
        if (cambios[k] !== undefined) nuevo[k] = valorProducto_(k, cambios[k], temporadas);
      });
      if (texto_(nuevo.nombre).length < 2) throw new ErrorUsuario('Escribe el nombre del producto.');
      if (!texto_(nuevo.categoria)) throw new ErrorUsuario('Elige una categoría para ' + nuevo.nombre + '.');
      if (cambios.nuevo) {
        sh.appendRow(filaCompleta_(headers, nuevo));
        nuevo._fila = sh.getLastRow();
        porId[nuevo.id] = nuevo;
      } else {
        sh.getRange(actual._fila, 1, 1, headers.length).setValues([filaCompleta_(headers, nuevo)]);
      }
      return productoAdmin_(nuevo);
    });
  });
  limpiarCacheCatalogo_();
  return { productos: guardados };
}

function eliminarPorId_(nombreHoja, id) {
  var filas = leerTabla_(nombreHoja);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id) === String(id)) {
      hoja_(nombreHoja).deleteRow(filas[i]._fila);
      return true;
    }
  }
  throw new ErrorUsuario('Ya no existe. Recarga el panel.');
}

function adminEliminarProducto_(body) {
  requerirAdmin_(body);
  conCandado_(function () { eliminarPorId_(HOJAS.PRODUCTOS, body.id); });
  limpiarCacheCatalogo_();
  return { id: body.id };
}

// ---------- Importación desde el punto de venta ----------

// Upsert por código. Nuevos: se crean completos. Existentes: solo cambian
// precio, existencia (disponible) y unidad; lo que la tienda editó en el
// panel (nombre, categoría, foto, visible, destacado…) se respeta.
function adminImportarProductos_(body) {
  requerirAdmin_(body);
  var lista = Array.isArray(body.productos) ? body.productos : [];
  if (lista.length > 1500) throw new ErrorUsuario('Envía el catálogo en partes de máximo 1500 productos.');
  var resultado = conCandado_(function () {
    var sh = hoja_(HOJAS.PRODUCTOS);
    var headers = encabezados_(sh);
    var col = {};
    headers.forEach(function (h, i) { col[h] = i; });
    if (col.codigo === undefined) throw new Error('Falta la columna codigo');
    var valores = sh.getDataRange().getValues();
    var porCodigo = {};
    var ids = {};
    var maxOrden = 0;
    for (var i = 1; i < valores.length; i++) {
      var cod = String(valores[i][col.codigo] === null ? '' : valores[i][col.codigo]).trim();
      if (cod) porCodigo[cod] = i;
      ids[String(valores[i][col.id])] = true;
      maxOrden = Math.max(maxOrden, Number(valores[i][col.orden]) || 0);
    }
    var nuevas = [];
    var r = { nuevos: 0, actualizados: 0, sin_cambios: 0, ocultados: 0, omitidos: 0 };
    var hayCambios = false;

    lista.forEach(function (x) {
      var codigo = texto_(x && x.codigo, 40);
      var nombre = texto_(x && x.nombre, 120);
      var precio = LunaPromos.num(x && x.precio);
      if (!codigo || nombre.length < 2 || (precio !== null && (precio < 0 || precio > 1000000))) { r.omitidos++; return; }
      var unidad = x.unidad === 'kg' ? 'kg' : '';
      var disponible = siNo_(x.disponible);
      var fila = porCodigo[codigo];
      if (fila === -1) { r.omitidos++; return; } // repetido dentro del mismo archivo
      if (fila !== undefined) {
        var row = valores[fila];
        var cambio = false;
        [['precio', precio === null ? '' : precio], ['disponible', disponible], ['unidad', unidad]].forEach(function (par) {
          if (String(row[col[par[0]]]) !== String(par[1])) {
            row[col[par[0]]] = par[1];
            cambio = true;
          }
        });
        if (cambio) { r.actualizados++; hayCambios = true; } else { r.sin_cambios++; }
        porCodigo[codigo] = -1;
        return;
      }
      var nuevo = {
        id: idUnico_('pos-' + slug_(codigo), ids), nombre: nombre, categoria: texto_(x.categoria, 60) || 'Despensa',
        marca: texto_(x.marca, 60), presentacion: texto_(x.presentacion, 60), precio: precio === null ? '' : precio,
        imagen: '', descripcion: '', visible: siNo_(x.visible), disponible: disponible, destacado: 'NO',
        es_alcohol: siNo_(x.es_alcohol), temporada: '', orden: ++maxOrden, unidad: unidad, codigo: codigo
      };
      ids[nuevo.id] = true;
      porCodigo[codigo] = -1;
      nuevas.push(filaCompleta_(headers, nuevo));
      r.nuevos++;
    });

    // Primera importación: el catálogo anterior (sin código) deja de mostrarse.
    if (body.ocultar_sin_codigo === true) {
      for (var j = 1; j < valores.length; j++) {
        var sinCodigo = !String(valores[j][col.codigo] === null ? '' : valores[j][col.codigo]).trim();
        if (sinCodigo && LunaPromos.truthy(valores[j][col.visible])) {
          valores[j][col.visible] = 'NO';
          r.ocultados++;
          hayCambios = true;
        }
      }
    }
    if (hayCambios && valores.length > 1) {
      sh.getRange(2, 1, valores.length - 1, headers.length)
        .setValues(valores.slice(1).map(function (fila) { return fila.map(sanitizar_); }));
    }
    if (nuevas.length) {
      var ini = sh.getLastRow() + 1;
      var faltan = ini + nuevas.length - 1 - sh.getMaxRows();
      if (faltan > 0) sh.insertRowsAfter(sh.getMaxRows(), faltan);
      // Los códigos van como texto: "0012" no debe volverse 12 en las filas nuevas.
      sh.getRange(ini, col.codigo + 1, nuevas.length, 1).setNumberFormat('@');
      sh.getRange(ini, 1, nuevas.length, headers.length).setValues(nuevas);
    }
    return r;
  });
  limpiarCacheCatalogo_();
  return resultado;
}

// ---------- Promociones y temporadas ----------

// Alta (sin id) o edición (con id) de un registro con columna "id".
function guardarRegistro_(nombreHoja, id, datos, baseId) {
  var reg = conCandado_(function () {
    var sh = hoja_(nombreHoja);
    var headers = encabezados_(sh);
    var porId = {};
    leerTabla_(nombreHoja).forEach(function (r) { porId[String(r.id)] = r; });
    var r = {};
    if (id) {
      var actual = porId[String(id)];
      if (!actual) throw new ErrorUsuario('Ya no existe. Recarga el panel.');
      Object.keys(actual).forEach(function (k) { r[k] = actual[k]; });
      Object.keys(datos).forEach(function (k) { r[k] = datos[k]; });
      sh.getRange(actual._fila, 1, 1, headers.length).setValues([filaCompleta_(headers, r)]);
    } else {
      r.id = idUnico_(slug_(baseId), porId);
      Object.keys(datos).forEach(function (k) { r[k] = datos[k]; });
      sh.appendRow(filaCompleta_(headers, r));
    }
    return r;
  });
  limpiarCacheCatalogo_();
  return reg;
}

function adminGuardarPromo_(body) {
  requerirAdmin_(body);
  var c = body.promo || {};
  var p = {
    titulo: texto_(c.titulo, 100),
    descripcion: texto_(c.descripcion, 300),
    tipo: String(c.tipo || '').toUpperCase().trim(),
    valor: numOVacio_(c.valor, 'El valor', 0, 1000000),
    lleva: numOVacio_(c.lleva, '“Lleva”', 1, 100),
    paga: numOVacio_(c.paga, '“Paga”', 0, 100),
    aplica_a: String(c.aplica_a || '').split(',').map(function (s) { return s.trim(); }).filter(String).join(','),
    inicio: fechaOVacia_(c.inicio, 'inicio'),
    fin: fechaOVacia_(c.fin, 'fin'),
    activa: siNo_(c.activa),
    imagen: urlOVacia_(c.imagen)
  };
  if (p.titulo.length < 3) throw new ErrorUsuario('Escribe un título para la promoción.');
  if (LunaPromos.TIPOS.indexOf(p.tipo) < 0) throw new ErrorUsuario('Elige el tipo de promoción.');
  if (!p.aplica_a) throw new ErrorUsuario('Elige a qué productos aplica la promoción.');
  if (p.tipo === 'PORCENTAJE' && !(p.valor > 0 && p.valor <= 100)) throw new ErrorUsuario('El porcentaje debe estar entre 1 y 100.');
  if (p.tipo === 'PRECIO_ESPECIAL' && p.valor === '') throw new ErrorUsuario('Escribe el precio especial.');
  if (p.tipo === 'DESCUENTO_PIEZA' && !(p.valor > 0)) throw new ErrorUsuario('Escribe cuántos pesos se descuentan por pieza.');
  if (p.tipo === 'NXM') {
    if (p.lleva === '' || p.paga === '' || p.paga >= p.lleva || p.lleva % 1 || p.paga % 1) {
      throw new ErrorUsuario('En “lleva y paga”, paga debe ser menor que lleva (ej. lleva 2, paga 1).');
    }
    p.valor = '';
  } else {
    p.lleva = '';
    p.paga = '';
  }
  if (p.inicio && p.fin && p.fin < p.inicio) throw new ErrorUsuario('La fecha de fin es anterior a la de inicio.');
  var r = guardarRegistro_(HOJAS.PROMOCIONES, c.id, p, p.titulo);
  var n = normalizarPromo_(r);
  n.estado = estadoVigencia_(n.activa, n.inicio, n.fin, hoy_());
  return { promo: n };
}

function adminEliminarPromo_(body) {
  requerirAdmin_(body);
  conCandado_(function () { eliminarPorId_(HOJAS.PROMOCIONES, body.id); });
  limpiarCacheCatalogo_();
  return { id: body.id };
}

// Guarda la temporada y, si llega la lista, qué productos le pertenecen.
function adminGuardarTemporada_(body) {
  requerirAdmin_(body);
  var c = body.temporada || {};
  var t = {
    nombre: texto_(c.nombre, 100),
    descripcion: texto_(c.descripcion, 300),
    inicio: fechaOVacia_(c.inicio, 'inicio'),
    fin: fechaOVacia_(c.fin, 'fin'),
    activa: siNo_(c.activa),
    imagen: urlOVacia_(c.imagen)
  };
  if (t.nombre.length < 3) throw new ErrorUsuario('Escribe el nombre de la temporada.');
  if (t.inicio && t.fin && t.fin < t.inicio) throw new ErrorUsuario('La fecha de fin es anterior a la de inicio.');
  var r = guardarRegistro_(HOJAS.TEMPORADAS, c.id, t, t.nombre + ' ' + (t.inicio || hoy_()).slice(0, 4));
  if (Array.isArray(body.productos)) asignarTemporada_(r.id, body.productos);
  var n = normalizarTemporada_(r);
  n.estado = estadoVigencia_(n.activa, n.inicio, n.fin, hoy_());
  return { temporada: n };
}

function asignarTemporada_(idTemporada, ids) {
  var quiere = {};
  ids.forEach(function (id) { quiere[String(id)] = true; });
  conCandado_(function () {
    var sh = hoja_(HOJAS.PRODUCTOS);
    var headers = encabezados_(sh);
    leerTabla_(HOJAS.PRODUCTOS).forEach(function (r) {
      var tiene = String(r.temporada || '') === idTemporada;
      var debe = !!quiere[String(r.id)];
      if (tiene === debe) return;
      r.temporada = debe ? idTemporada : '';
      sh.getRange(r._fila, 1, 1, headers.length).setValues([filaCompleta_(headers, r)]);
    });
  });
  limpiarCacheCatalogo_();
}

function adminEliminarTemporada_(body) {
  requerirAdmin_(body);
  conCandado_(function () { eliminarPorId_(HOJAS.TEMPORADAS, body.id); });
  asignarTemporada_(String(body.id), []);
  return { id: body.id };
}

// ---------- Ajustes ----------

function validarAjuste_(k, v) {
  if (AJUSTES_SI_NO.indexOf(k) >= 0) return siNo_(v);
  if (AJUSTES_MONTO.indexOf(k) >= 0) return numOVacio_(v, 'El monto', 0, 100000);
  var s = String(v == null ? '' : v).trim();
  switch (k) {
    case 'email_notificacion':
      if (s && !emailValido_(s)) throw new ErrorUsuario('El correo para avisos no es válido.');
      return s;
    case 'sitio_url':
    case 'crm_webhook_url':
      if (s && !urlSegura_(s)) throw new ErrorUsuario('La dirección debe empezar con https://');
      return s;
    case 'whatsapp':
      if (s && !normalizarTelefono_(s)) throw new ErrorUsuario('El WhatsApp debe tener 10 dígitos.');
      return normalizarTelefono_(s);
    case 'horario_semana':
    case 'horario_domingo':
      if (s && !/^cerrado$/i.test(s) && !/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(s)) {
        throw new ErrorUsuario('Escribe el horario así: 8:00-23:30 (o “Cerrado”).');
      }
      return s.replace(/\s+/g, '');
    case 'colonias_cobertura':
      return s.split(',').map(function (x) { return x.trim(); }).filter(String).join(', ').slice(0, 3000);
    case 'telefonos':
      return s.split(',').map(function (x) { return x.trim(); }).filter(String).join(', ').slice(0, 200);
    case 'transferencia_datos':
    case 'aviso_alcohol':
      return String(v == null ? '' : v).trim().slice(0, 600);
    default:
      return s.slice(0, 300);
  }
}

function adminGuardarConfig_(body) {
  requerirAdmin_(body);
  var cambios = body.config || {};
  var defs = {};
  CONFIG_INICIAL.forEach(function (c) { defs[c[0]] = c; });
  var limpios = {};
  Object.keys(cambios).forEach(function (k) {
    if (!defs[k]) throw new ErrorUsuario('Ajuste desconocido: ' + k);
    limpios[k] = validarAjuste_(k, cambios[k]);
  });
  conCandado_(function () {
    var sh = hoja_(HOJAS.CONFIG);
    var porClave = {};
    leerTabla_(HOJAS.CONFIG).forEach(function (r) { porClave[String(r.clave)] = r; });
    Object.keys(limpios).forEach(function (k) {
      if (porClave[k]) sh.getRange(porClave[k]._fila, 2).setValue(sanitizar_(limpios[k]));
      else sh.appendRow([k, sanitizar_(limpios[k]), defs[k][2]]);
    });
  });
  limpiarCacheCatalogo_();
  return { config: leerConfig_() };
}

// ---------- Clientes (CRM) ----------

function adminClientes_(body) {
  requerirAdmin_(body);
  var q = LunaPromos.norm(body.q || '');
  var lista = leerTabla_(HOJAS.CLIENTES).map(function (r) {
    return {
      telefono: normalizarTelefono_(r.telefono) || String(r.telefono),
      nombre: r.nombre || '', email: r.email || '', direccion: r.direccion || '', colonia: r.colonia || '',
      pedidos: Number(r.pedidos) || 0, total_acumulado: Number(r.total_acumulado) || 0,
      primer_pedido: r.primer_pedido || '', ultimo_pedido: r.ultimo_pedido || '', ultimo_folio: r.ultimo_folio || ''
    };
  }).filter(function (c) {
    return !q || LunaPromos.norm([c.nombre, c.telefono, c.colonia, c.email].join(' ')).indexOf(q) >= 0;
  }).sort(function (a, b) { return String(b.ultimo_pedido).localeCompare(String(a.ultimo_pedido)); });
  return { clientes: lista.slice(0, 500), total: lista.length };
}

// ---------- Contraseña ----------

function adminCambiarContrasena_(body) {
  requerirAdmin_(body);
  var props = PropertiesService.getScriptProperties();
  if (hashear_(String(body.actual || ''), props.getProperty('ADMIN_SAL')) !== props.getProperty('ADMIN_HASH')) {
    throw new ErrorUsuario('La contraseña actual no es correcta.');
  }
  guardarContrasena_(String(body.nueva || ''));
  return iniciarSesion_({ password: String(body.nueva) });
}

// ---------- Fotos (se guardan en Google Drive, públicas solo para ver) ----------

function carpetaFotos_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOTOS_CARPETA');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // La carpeta se borró: se crea otra.
    }
  }
  var carpeta = DriveApp.createFolder('La Luna · Fotos del sitio');
  props.setProperty('FOTOS_CARPETA', carpeta.getId());
  return carpeta;
}

function adminSubirFoto_(body) {
  requerirAdmin_(body);
  var tipo = String(body.tipo || '');
  if (!TIPOS_FOTO[tipo]) throw new ErrorUsuario('Usa una foto JPG, PNG o WebP.');
  var bytes = Utilities.base64Decode(String(body.datos || ''));
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new ErrorUsuario('La foto debe pesar menos de 3 MB.');
  limitar_('fotos', 200, 3600, 'Subiste muchas fotos seguidas. Espera un momento.');
  var nombre = slug_(body.nombre || 'foto') + '-' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + TIPOS_FOTO[tipo];
  var archivo = carpetaFotos_().createFile(Utilities.newBlob(bytes, tipo, nombre));
  try {
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    throw new ErrorUsuario('Google no permitió publicar la foto. Pega un enlace https:// en su lugar.');
  }
  return { url: 'https://lh3.googleusercontent.com/d/' + archivo.getId(), id: archivo.getId() };
}

// ===================== Notificaciones.gs =====================
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
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #e3e3d7">' + esc_(cantidadTexto_(l)) + ' ' + esc_(l.nombre) +
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

// ===================== Pedidos.gs =====================
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
    var p = porId[String(it && it.id)];
    var pedida = Number(it && it.cantidad);
    // Piezas enteras de 1 a 99; granel en cuartos de kilo de ¼ a 25 kg.
    var cantidad = LunaPromos.cantidadValida(p, pedida);
    var maximo = LunaPromos.esGranel(p) ? LunaPromos.MAX_KG : MAX_CANTIDAD;
    if (!(cantidad > 0 && cantidad === pedida && cantidad <= maximo)) throw new ErrorUsuario('Cantidad no válida.');
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
    return cantidadTexto_(l) + ' ' + l.nombre + (l.presentacion ? ' (' + l.presentacion + ')' : '') +
      (l.promo ? ' [' + l.promo.etiqueta + ']' : '');
  }).join('\n');
  destino.productos_json = JSON.stringify(c.lines.map(function (l) {
    return {
      id: l.id, nombre: l.nombre, presentacion: l.presentacion, cantidad: l.cantidad, unidad: l.unidad, precio: l.precio,
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

// ===================== Setup.gs =====================
/*
 * Menú del Sheet, configuración inicial y disparadores simples.
 */

var CONFIG_INICIAL = [
  ['tienda_nombre', 'Abarrotes La Luna', 'Nombre que aparece en correos.'],
  ['sitio_url', 'https://abarroteslaluna.com.mx', 'Dirección del sitio (para enlaces en correos).'],
  ['email_notificacion', 'skodev.ia@gmail.com', 'Correo que recibe el aviso de cada pedido nuevo.'],
  ['email_cliente', 'SI', 'SI = enviar confirmación y cambios de estado al cliente si dejó correo.'],
  ['notificar_comentarios', 'SI', 'SI = avisar por correo cuando llega un comentario.'],
  ['pedidos_activos', 'SI', 'NO = pausa los pedidos en línea (vacaciones, inventario, etc.).'],
  ['mensaje_pedidos_pausados', 'Por el momento no recibimos pedidos en línea. Llámanos por teléfono.', 'Texto cuando los pedidos están pausados.'],
  ['envio_costo', '', 'Costo de envío a domicilio. Vacío = "se confirma por teléfono".'],
  ['envio_gratis_desde', '', 'Monto desde el cual el envío es gratis. Vacío = no aplica.'],
  ['pedido_minimo', '', 'Monto mínimo del pedido. Vacío = sin mínimo.'],
  ['colonias_cobertura', '', 'Colonias con entrega, separadas por coma. Vacío = cualquier colonia (se confirma).'],
  ['permitir_recoger', 'SI', 'SI = el cliente puede pasar a recoger a la tienda.'],
  ['pago_efectivo', 'SI', 'Acepta efectivo contra entrega.'],
  ['pago_transferencia', 'SI', 'Acepta transferencia.'],
  ['transferencia_datos', '', 'Banco, titular y CLABE. Se muestran al cliente al terminar su pedido.'],
  ['aviso_general', '', 'Mensaje que aparece arriba de todo el sitio (ej. "Hoy cerramos a las 20:00").'],
  ['telefonos', '55 5517 0726, 55 5739 3213', 'Teléfonos de la tienda, separados por coma.'],
  ['whatsapp', '', 'WhatsApp a 10 dígitos para el botón flotante del sitio. Vacío = no se muestra.'],
  ['direccion', 'Estela 60, Col. Guadalupe Tepeyac, Alcaldía Gustavo A. Madero, CDMX', 'Dirección de la tienda.'],
  ['horario_semana', '8:00-23:30', 'Horario de lunes a sábado (HH:MM-HH:MM o Cerrado).'],
  ['horario_domingo', '9:00-23:30', 'Horario de domingo (HH:MM-HH:MM o Cerrado).'],
  ['aviso_alcohol', 'La venta de bebidas alcohólicas es exclusiva para mayores de 18 años. Se pedirá identificación al entregar. Sujeto a horarios y disposiciones de ley seca.', 'Texto legal en la sección de licores.'],
  ['crm_webhook_url', '', 'Opcional: URL https de Zapier/Make/HubSpot para enviar cada pedido a un CRM externo.']
];

var PROMOS_EJEMPLO = [
  ['promo-ejemplo-2x1', 'EJEMPLO · 2x1 en Danonino', 'Llévate 2 y paga 1.', 'NXM', '', 2, 1, 'danonino-maxi,danonino-lunch', '', '', 'NO', ''],
  ['promo-ejemplo-lala', 'EJEMPLO · 10% en leche Lala', 'Descuento en toda la leche.', 'PORCENTAJE', 10, '', '', 'cat:Leche', '', '', 'NO', '']
];

var TEMPORADAS_EJEMPLO = [
  ['muertos-2026', 'Día de Muertos', 'Todo para tu ofrenda: pan de muerto, velas, chocolate y más.', '2026-10-20', '2026-11-02', 'NO', ''],
  ['posadas-2026', 'Posadas y fiestas', 'Ponche, piñatas, colación y botanas para tus posadas.', '2026-12-01', '2026-12-24', 'NO', '']
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌙 La Luna')
    .addItem('1. Configuración inicial', 'configuracionInicial')
    .addItem('2. Definir contraseña del panel', 'definirContrasenaPanel')
    .addSeparator()
    .addItem('Publicar cambios ya (limpiar caché)', 'limpiarCache')
    .addToUi();
}

// Disparador simple: al editar el catálogo, la web lo ve en segundos.
// En la hoja Pedidos, cambiar "estado" a mano también queda en el historial.
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    var nombre = sh.getName();
    if ([HOJAS.PRODUCTOS, HOJAS.PROMOCIONES, HOJAS.TEMPORADAS, HOJAS.CONFIG, HOJAS.COMENTARIOS].indexOf(nombre) >= 0) {
      limpiarCacheCatalogo_();
      return;
    }
    if (nombre === HOJAS.PEDIDOS && e.range.getRow() > 1 && e.range.getNumRows() === 1 && e.range.getNumColumns() === 1) {
      var headers = encabezados_(sh);
      if (headers[e.range.getColumn() - 1] !== 'estado') return;
      var estado = String(e.value || '').toUpperCase();
      if (ESTADOS.indexOf(estado) < 0) return;
      var colHist = headers.indexOf('historial') + 1;
      var colAct = headers.indexOf('actualizado') + 1;
      var fecha = ahora_();
      var celda = sh.getRange(e.range.getRow(), colHist);
      var historial = parseJson_(celda.getValue(), []);
      historial.push({ estado: estado, fecha: fecha, nota: '' });
      celda.setValue(JSON.stringify(historial));
      sh.getRange(e.range.getRow(), colAct).setValue(fecha);
    }
  } catch (err) {
    console.error(err);
  }
}

// Ejecútala una vez desde el editor (▶ Ejecutar) después de actualizar el código:
// Google pide autorizar los permisos nuevos (Drive para las fotos del panel).
function autorizarPermisos() {
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
  SpreadsheetApp.getActive();
  asegurarEstructura_();
  console.log('Permisos listos. Ahora: Implementar → Administrar implementaciones → Nueva versión.');
}

function limpiarCache() {
  limpiarCacheCatalogo_();
  SpreadsheetApp.getActive().toast('Listo: el sitio ya muestra los cambios.', '🌙 La Luna', 4);
}

var VERSION_ESTRUCTURA = '3';

// Se llama en cada petición: si el código es más nuevo que la hoja, la
// actualiza sola (hojas, columnas y ajustes nuevos). Nadie abre el Sheet.
function asegurarEstructura_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ESTRUCTURA') === VERSION_ESTRUCTURA) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (props.getProperty('ESTRUCTURA') === VERSION_ESTRUCTURA) return;
    prepararLibro_(libro_());
    props.setProperty('ESTRUCTURA', VERSION_ESTRUCTURA);
  } finally {
    lock.releaseLock();
  }
}

function configuracionInicial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  prepararLibro_(ss);
  PropertiesService.getScriptProperties().setProperty('ESTRUCTURA', VERSION_ESTRUCTURA);
  SpreadsheetApp.getUi().alert('🌙 Listo. Se crearon las hojas y el catálogo inicial.\n\n' +
    'Siguiente paso: menú 🌙 La Luna → 2. Definir contraseña del panel.');
}

function prepararLibro_(ss) {
  Object.keys(COLUMNAS).forEach(function (nombre) { asegurarHoja_(ss, nombre, COLUMNAS[nombre]); });

  var config = ss.getSheetByName(HOJAS.CONFIG);
  if (config.getLastRow() > 1) {
    var existentes = {};
    config.getRange(2, 1, config.getLastRow() - 1, 1).getValues().forEach(function (r) { existentes[String(r[0])] = true; });
    CONFIG_INICIAL.forEach(function (c) { if (!existentes[c[0]]) config.appendRow(c); });
  } else {
    sembrar_(config, CONFIG_INICIAL);
  }
  sembrar_(ss.getSheetByName(HOJAS.PRODUCTOS), SEED_PRODUCTOS.map(function (p) {
    return COLUMNAS.Productos.map(function (k) { return p[k] === undefined ? '' : p[k]; });
  }));
  sembrar_(ss.getSheetByName(HOJAS.PROMOCIONES), PROMOS_EJEMPLO);
  sembrar_(ss.getSheetByName(HOJAS.TEMPORADAS), TEMPORADAS_EJEMPLO);

  var siNo = SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build();
  validarColumnas_(ss.getSheetByName(HOJAS.PRODUCTOS), ['visible', 'disponible', 'destacado', 'es_alcohol'], siNo);
  validarColumnas_(ss.getSheetByName(HOJAS.PROMOCIONES), ['activa'], siNo);
  validarColumnas_(ss.getSheetByName(HOJAS.TEMPORADAS), ['activa'], siNo);
  validarColumnas_(ss.getSheetByName(HOJAS.PROMOCIONES), ['tipo'],
    SpreadsheetApp.newDataValidation().requireValueInList(LunaPromos.TIPOS, true).build());
  validarColumnas_(ss.getSheetByName(HOJAS.PEDIDOS), ['estado'],
    SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build());
  validarColumnas_(ss.getSheetByName(HOJAS.COMENTARIOS), ['estado'],
    SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS_COMENTARIO, true).build());

  // Texto plano para que los teléfonos y folios no se conviertan en números.
  formatoTexto_(ss.getSheetByName(HOJAS.PEDIDOS), ['folio', 'telefono', 'fecha', 'actualizado']);
  formatoTexto_(ss.getSheetByName(HOJAS.CLIENTES), ['telefono', 'primer_pedido', 'ultimo_pedido']);
  formatoTexto_(ss.getSheetByName(HOJAS.COMENTARIOS), ['fecha']);
  formatoTexto_(ss.getSheetByName(HOJAS.PROMOCIONES), ['inicio', 'fin']);
  formatoTexto_(ss.getSheetByName(HOJAS.TEMPORADAS), ['inicio', 'fin']);
  formatoTexto_(config, ['valor']);
  formatoTexto_(ss.getSheetByName(HOJAS.PRODUCTOS), ['codigo']);

  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  limpiarCacheCatalogo_();
}

function definirContrasenaPanel() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Contraseña del panel', 'Escribe la nueva contraseña (mínimo 8 caracteres). ' +
    'Cerrará las sesiones abiertas.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    guardarContrasena_(r.getResponseText());
    ui.alert('Contraseña guardada.');
  } catch (e) {
    ui.alert(e.message);
  }
}

function asegurarHoja_(ss, nombre, columnas) {
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  var actuales = sh.getLastColumn() ? encabezados_(sh) : [];
  var faltan = columnas.filter(function (c) { return actuales.indexOf(c) < 0; });
  if (faltan.length) {
    sh.getRange(1, actuales.filter(String).length + 1, 1, faltan.length).setValues([faltan]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#163e35').setFontColor('#f7f4e9');
  return sh;
}

function sembrar_(sh, filas) {
  if (sh.getLastRow() > 1 || !filas.length) return;
  sh.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
}

function validarColumnas_(sh, columnas, regla) {
  var headers = encabezados_(sh);
  columnas.forEach(function (c) {
    var col = headers.indexOf(c) + 1;
    if (col > 0) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(regla);
  });
}

function formatoTexto_(sh, columnas) {
  var headers = encabezados_(sh);
  columnas.forEach(function (c) {
    var col = headers.indexOf(c) + 1;
    if (col > 0) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  });
}

// ===================== Seed.gs =====================
// Catálogo inicial que se carga en la hoja Productos con "Configuración inicial".
var SEED_PRODUCTOS = [
 {
  "id": "benson-violet-cajetilla-20-pzas",
  "nombre": "Benson Violet",
  "categoria": "Cigarros",
  "marca": "Benson",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 1
 },
 {
  "id": "benson-dorados-cajetilla-20-pzas",
  "nombre": "Benson Dorados",
  "categoria": "Cigarros",
  "marca": "Benson",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 2
 },
 {
  "id": "benson-gold-pearl-cajetilla-20-pzas",
  "nombre": "Benson Gold Pearl",
  "categoria": "Cigarros",
  "marca": "Benson",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 3
 },
 {
  "id": "benson-jade-cajetilla-20-pzas",
  "nombre": "Benson Jade",
  "categoria": "Cigarros",
  "marca": "Benson",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 4
 },
 {
  "id": "benson-menthol-cajetilla-14-pzas",
  "nombre": "Benson Menthol",
  "categoria": "Cigarros",
  "marca": "Benson",
  "presentacion": "Cajetilla 14 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 5
 },
 {
  "id": "benson-menthol-cajetilla-20-pzas",
  "nombre": "Benson Menthol",
  "categoria": "Cigarros",
  "marca": "Benson",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 6
 },
 {
  "id": "benson-menthol-light-cajetilla-20-pzas",
  "nombre": "Benson Menthol Light",
  "categoria": "Cigarros",
  "marca": "Benson",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 7
 },
 {
  "id": "camel-100-capsula-cajetilla-20-pzas",
  "nombre": "Camel 100 Cápsula",
  "categoria": "Cigarros",
  "marca": "Camel",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 8
 },
 {
  "id": "camel-cajetilla-20-pzas",
  "nombre": "Camel",
  "categoria": "Cigarros",
  "marca": "Camel",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 9
 },
 {
  "id": "camel-brown-cajetilla-20-pzas",
  "nombre": "Camel Brown",
  "categoria": "Cigarros",
  "marca": "Camel",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 10
 },
 {
  "id": "camel-brown-cajetilla-25-pzas",
  "nombre": "Camel Brown",
  "categoria": "Cigarros",
  "marca": "Camel",
  "presentacion": "Cajetilla 25 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 11
 },
 {
  "id": "camel-tropical-cajetilla-20-pzas",
  "nombre": "Camel Tropical",
  "categoria": "Cigarros",
  "marca": "Camel",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 12
 },
 {
  "id": "chesterfield-cajetilla-15-pzas",
  "nombre": "Chesterfield",
  "categoria": "Cigarros",
  "marca": "Chesterfield",
  "presentacion": "Cajetilla 15 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 13
 },
 {
  "id": "delicados-s-f-cajetilla-18-pzas",
  "nombre": "Delicados S/F",
  "categoria": "Cigarros",
  "marca": "Delicados",
  "presentacion": "Cajetilla 18 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 14
 },
 {
  "id": "faros-cajetilla-20-pzas",
  "nombre": "Faros",
  "categoria": "Cigarros",
  "marca": "Faros",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 15
 },
 {
  "id": "faros-cajetilla-25-pzas",
  "nombre": "Faros",
  "categoria": "Cigarros",
  "marca": "Faros",
  "presentacion": "Cajetilla 25 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 16
 },
 {
  "id": "link-azul-cajetilla-20-pzas",
  "nombre": "Link Azul",
  "categoria": "Cigarros",
  "marca": "Link",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 17
 },
 {
  "id": "link-blanco-cajetilla-20-pzas",
  "nombre": "Link Blanco",
  "categoria": "Cigarros",
  "marca": "Link",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 18
 },
 {
  "id": "link-negro-cajetilla-20-pzas",
  "nombre": "Link Negro",
  "categoria": "Cigarros",
  "marca": "Link",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 19
 },
 {
  "id": "link-rojo-cajetilla-20-pzas",
  "nombre": "Link Rojo",
  "categoria": "Cigarros",
  "marca": "Link",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 20
 },
 {
  "id": "lucky-strike-click-azul-cajetilla-20-pzas",
  "nombre": "Lucky Strike Click Azul",
  "categoria": "Cigarros",
  "marca": "Lucky",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 21
 },
 {
  "id": "lucky-strike-enigma-cajetilla-20-pzas",
  "nombre": "Lucky Strike Enigma",
  "categoria": "Cigarros",
  "marca": "Lucky",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 22
 },
 {
  "id": "lucky-strike-suave-cajetilla-20-pzas",
  "nombre": "Lucky Strike Suave",
  "categoria": "Cigarros",
  "marca": "Lucky",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 23
 },
 {
  "id": "marlboro-blanco-cajetilla-20-pzas",
  "nombre": "Marlboro Blanco",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 24
 },
 {
  "id": "marlboro-blossom-cajetilla-20-pzas",
  "nombre": "Marlboro Blossom",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 25
 },
 {
  "id": "marlboro-crafted-blossom-cajetilla-20-pzas",
  "nombre": "Marlboro Crafted Blossom",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 26
 },
 {
  "id": "marlboro-crafted-ice-mix-cajetilla-20-pzas",
  "nombre": "Marlboro Crafted Ice Mix",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 27
 },
 {
  "id": "marlboro-crafted-ruby-cajetilla-20-pzas",
  "nombre": "Marlboro Crafted Ruby",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 28
 },
 {
  "id": "marlboro-crafted-summer-cajetilla-20-pzas",
  "nombre": "Marlboro Crafted Summer",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 29
 },
 {
  "id": "marlboro-crafted-cajetilla-25-pzas",
  "nombre": "Marlboro Crafted",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 25 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 30
 },
 {
  "id": "marlboro-gold-100-cajetilla-20-pzas",
  "nombre": "Marlboro Gold 100",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 31
 },
 {
  "id": "marlboro-gold-cajetilla-14-pzas",
  "nombre": "Marlboro Gold",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 14 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 32
 },
 {
  "id": "marlboro-ice-cajetilla-20-pzas",
  "nombre": "Marlboro Ice",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 33
 },
 {
  "id": "marlboro-kretek-cajetilla-20-pzas",
  "nombre": "Marlboro Kretek",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 34
 },
 {
  "id": "marlboro-rojos-cajetilla-20-pzas",
  "nombre": "Marlboro Rojos",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 35
 },
 {
  "id": "marlboro-rubi-cajetilla-20-pzas",
  "nombre": "Marlboro Rubí",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 36
 },
 {
  "id": "marlboro-velvet-cajetilla-20-pzas",
  "nombre": "Marlboro Velvet",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 37
 },
 {
  "id": "marlboro-vista-arctic-cajetilla-20-pzas",
  "nombre": "Marlboro Vista Arctic",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 38
 },
 {
  "id": "marlboro-vista-caribbean-cajetilla-20-pzas",
  "nombre": "Marlboro Vista Caribbean",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 39
 },
 {
  "id": "marlboro-vista-forest-cajetilla-20-pzas",
  "nombre": "Marlboro Vista Forest",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 40
 },
 {
  "id": "marlboro-vista-garden-cajetilla-20-pzas",
  "nombre": "Marlboro Vista Garden",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 41
 },
 {
  "id": "marlboro-vista-summer-cajetilla-20-pzas",
  "nombre": "Marlboro Vista Summer",
  "categoria": "Cigarros",
  "marca": "Marlboro",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 42
 },
 {
  "id": "montana-retro-cajetilla-20-pzas",
  "nombre": "Montana Retro",
  "categoria": "Cigarros",
  "marca": "Montana",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 43
 },
 {
  "id": "montana-retro-cajetilla-25-pzas",
  "nombre": "Montana Retro",
  "categoria": "Cigarros",
  "marca": "Montana",
  "presentacion": "Cajetilla 25 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 44
 },
 {
  "id": "montana-shot-cajetilla-15-pzas",
  "nombre": "Montana Shot",
  "categoria": "Cigarros",
  "marca": "Montana",
  "presentacion": "Cajetilla 15 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 45
 },
 {
  "id": "montana-shots-cajetilla-14-pzas",
  "nombre": "Montana Shots",
  "categoria": "Cigarros",
  "marca": "Montana",
  "presentacion": "Cajetilla 14 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 46
 },
 {
  "id": "montana-shots-cajetilla-20-pzas",
  "nombre": "Montana Shots",
  "categoria": "Cigarros",
  "marca": "Montana",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 47
 },
 {
  "id": "montana-shots-cajetilla-25-pzas",
  "nombre": "Montana Shots",
  "categoria": "Cigarros",
  "marca": "Montana",
  "presentacion": "Cajetilla 25 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 48
 },
 {
  "id": "pall-mall-alaska-cajetilla-15-pzas",
  "nombre": "Pall Mall Alaska",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 15 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 49
 },
 {
  "id": "pall-mall-alaska-cajetilla-20-pzas",
  "nombre": "Pall Mall Alaska",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 50
 },
 {
  "id": "pall-mall-bora-cajetilla-20-pzas",
  "nombre": "Pall Mall Bora",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 51
 },
 {
  "id": "pall-mall-hawaii-cajetilla-20-pzas",
  "nombre": "Pall Mall Hawaii",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 52
 },
 {
  "id": "pall-mall-honolulu-cajetilla-20-pzas",
  "nombre": "Pall Mall Honolulu",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 53
 },
 {
  "id": "pall-mall-iceland-cajetilla-20-pzas",
  "nombre": "Pall Mall Iceland",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 54
 },
 {
  "id": "pall-mall-london-cajetilla-20-pzas",
  "nombre": "Pall Mall London",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 55
 },
 {
  "id": "pall-mall-manila-cajetilla-20-pzas",
  "nombre": "Pall Mall Manila",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 56
 },
 {
  "id": "pall-mall-miami-cajetilla-20-pzas",
  "nombre": "Pall Mall Miami",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 57
 },
 {
  "id": "pall-mall-new-york-cajetilla-20-pzas",
  "nombre": "Pall Mall New York",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 58
 },
 {
  "id": "pall-mall-osaka-cajetilla-20-pzas",
  "nombre": "Pall Mall Osaka",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 59
 },
 {
  "id": "pall-mall-pepino-cajetilla-15-pzas",
  "nombre": "Pall Mall Pepino",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 15 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 60
 },
 {
  "id": "pall-mall-pepino-cajetilla-20-pzas",
  "nombre": "Pall Mall Pepino",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 61
 },
 {
  "id": "pall-mall-rojo-cajetilla-15-pzas",
  "nombre": "Pall Mall Rojo",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 15 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 62
 },
 {
  "id": "pall-mall-tokio-cajetilla-20-pzas",
  "nombre": "Pall Mall Tokio",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 63
 },
 {
  "id": "pall-mall-white-cajetilla-15-pzas",
  "nombre": "Pall Mall White",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 15 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 64
 },
 {
  "id": "pall-mall-xl-blanco-cajetilla-20-pzas",
  "nombre": "Pall Mall XL Blanco",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 65
 },
 {
  "id": "pall-mall-xl-rojo-cajetilla-20-pzas",
  "nombre": "Pall Mall XL Rojo",
  "categoria": "Cigarros",
  "marca": "Pall",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 66
 },
 {
  "id": "winston-max-fresh-cajetilla-20-pzas",
  "nombre": "Winston Max Fresh",
  "categoria": "Cigarros",
  "marca": "Winston",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 67
 },
 {
  "id": "winston-oasis-mix-cajetilla-20-pzas",
  "nombre": "Winston Oasis Mix",
  "categoria": "Cigarros",
  "marca": "Winston",
  "presentacion": "Cajetilla 20 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 68
 },
 {
  "id": "winston-red-cajetilla-25-pzas",
  "nombre": "Winston Red",
  "categoria": "Cigarros",
  "marca": "Winston",
  "presentacion": "Cajetilla 25 pzas",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "NO",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 69
 },
 {
  "id": "salchicha-1-kg",
  "nombre": "Salchicha",
  "categoria": "Salchichas y carnes frías",
  "marca": "",
  "presentacion": "1 kg",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 70
 },
 {
  "id": "salchicha-s-r",
  "nombre": "Salchicha S.R.",
  "categoria": "Salchichas y carnes frías",
  "marca": "",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 71
 },
 {
  "id": "salchicha-fud-pavo",
  "nombre": "Salchicha FUD Pavo",
  "categoria": "Salchichas y carnes frías",
  "marca": "FUD",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 72
 },
 {
  "id": "salchicha-fud-viena",
  "nombre": "Salchicha FUD Viena",
  "categoria": "Salchichas y carnes frías",
  "marca": "FUD",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 73
 },
 {
  "id": "philadelphia-mediano",
  "nombre": "Philadelphia Mediano",
  "categoria": "Cremas y quesos",
  "marca": "Philadelphia",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 74
 },
 {
  "id": "philadelphia-grande",
  "nombre": "Philadelphia Grande",
  "categoria": "Cremas y quesos",
  "marca": "Philadelphia",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 75
 },
 {
  "id": "philadelphia-rebanado",
  "nombre": "Philadelphia Rebanado",
  "categoria": "Cremas y quesos",
  "marca": "Philadelphia",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 76
 },
 {
  "id": "queso-amarillo",
  "nombre": "Queso Amarillo",
  "categoria": "Cremas y quesos",
  "marca": "",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 77
 },
 {
  "id": "queso-manchego",
  "nombre": "Queso Manchego",
  "categoria": "Cremas y quesos",
  "marca": "",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 78
 },
 {
  "id": "dedos-de-queso",
  "nombre": "Dedos de Queso",
  "categoria": "Congelados",
  "marca": "",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 79
 },
 {
  "id": "pizza-hawaiana",
  "nombre": "Pizza Hawaiana",
  "categoria": "Congelados",
  "marca": "",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 80
 },
 {
  "id": "pizza-pepperoni",
  "nombre": "Pizza Pepperoni",
  "categoria": "Congelados",
  "marca": "",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 81
 },
 {
  "id": "crema-yoplait-440-g",
  "nombre": "Crema Yoplait",
  "categoria": "Cremas y quesos",
  "marca": "Yoplait",
  "presentacion": "440 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 82
 },
 {
  "id": "yoplait-natural-900-g",
  "nombre": "Yoplait Natural",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "900 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 83
 },
 {
  "id": "yoplait-fresa-900-g",
  "nombre": "Yoplait Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "900 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 84
 },
 {
  "id": "yoplait-durazno-900-g",
  "nombre": "Yoplait Durazno",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "900 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 85
 },
 {
  "id": "griego-natural-750-g",
  "nombre": "Griego Natural",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "750 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 86
 },
 {
  "id": "griego-natural-s-azucar-750-g",
  "nombre": "Griego Natural S/Azúcar",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "750 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 87
 },
 {
  "id": "yoplait-natural-450-g",
  "nombre": "Yoplait Natural",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "450 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 88
 },
 {
  "id": "yoplait-cereal-450-g",
  "nombre": "Yoplait Cereal",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "450 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 89
 },
 {
  "id": "yoplait-durazno-450-g",
  "nombre": "Yoplait Durazno",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "450 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 90
 },
 {
  "id": "yoplait-fresa-450-g",
  "nombre": "Yoplait Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "450 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 91
 },
 {
  "id": "manzana-vaso",
  "nombre": "Manzana Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 92
 },
 {
  "id": "fresa-vaso",
  "nombre": "Fresa Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 93
 },
 {
  "id": "durazno-vaso",
  "nombre": "Durazno Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 94
 },
 {
  "id": "cereales-vaso",
  "nombre": "Cereales Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 95
 },
 {
  "id": "natural-vaso",
  "nombre": "Natural Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 96
 },
 {
  "id": "natural-p-beber",
  "nombre": "Natural p/Beber",
  "categoria": "Bebidas lácteas",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 97
 },
 {
  "id": "griego-natural-vaso",
  "nombre": "Griego Natural Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 98
 },
 {
  "id": "griego-fresa-vaso",
  "nombre": "Griego Fresa Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 99
 },
 {
  "id": "griego-moras-vaso",
  "nombre": "Griego Moras Vaso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 100
 },
 {
  "id": "griego-natural-s-azucar",
  "nombre": "Griego Natural S/Azúcar",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 101
 },
 {
  "id": "placer-fresa",
  "nombre": "Placer Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 102
 },
 {
  "id": "placer-coco",
  "nombre": "Placer Coco",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 103
 },
 {
  "id": "placer-oreo",
  "nombre": "Placer Oreo",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 104
 },
 {
  "id": "flan-casero",
  "nombre": "Flan Casero",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 105
 },
 {
  "id": "disfruta-fresa",
  "nombre": "Disfruta Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 106
 },
 {
  "id": "disfruta-mora",
  "nombre": "Disfruta Mora",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 107
 },
 {
  "id": "disfruta-mango",
  "nombre": "Disfruta Mango",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 108
 },
 {
  "id": "disfruta-durazno",
  "nombre": "Disfruta Durazno",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 109
 },
 {
  "id": "pay-de-queso",
  "nombre": "Pay de Queso",
  "categoria": "Yogurt y postres",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 110
 },
 {
  "id": "disfruta-licuado",
  "nombre": "Disfruta Licuado",
  "categoria": "Bebidas lácteas",
  "marca": "Yoplait",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 111
 },
 {
  "id": "danup-fresa-220-g",
  "nombre": "Danup Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "220 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 112
 },
 {
  "id": "danup-pina-220-g",
  "nombre": "Danup Piña",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "220 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 113
 },
 {
  "id": "danup-fresa-450-g",
  "nombre": "Danup Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "450 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 114
 },
 {
  "id": "danup-pina-450-g",
  "nombre": "Danup Piña",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "450 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 115
 },
 {
  "id": "activia-ciruela",
  "nombre": "Activia Ciruela",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 116
 },
 {
  "id": "activia-fresa",
  "nombre": "Activia Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 117
 },
 {
  "id": "dan-fresa-220-g",
  "nombre": "Dan Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "220 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 118
 },
 {
  "id": "dan-durazno-220-g",
  "nombre": "Dan Durazno",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "220 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 119
 },
 {
  "id": "dan-manzana-220-g",
  "nombre": "Dan Manzana",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "220 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 120
 },
 {
  "id": "benegastro-240-g",
  "nombre": "Benegastro",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "240 g",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 121
 },
 {
  "id": "dany-pina",
  "nombre": "Dany Piña",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 122
 },
 {
  "id": "dany-fresa",
  "nombre": "Dany Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 123
 },
 {
  "id": "dany-limon",
  "nombre": "Dany Limón",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 124
 },
 {
  "id": "dany-uva",
  "nombre": "Dany Uva",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 125
 },
 {
  "id": "dany-mandarina",
  "nombre": "Dany Mandarina",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 126
 },
 {
  "id": "natilla-chocolate",
  "nombre": "Natilla Chocolate",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 127
 },
 {
  "id": "natilla-vainilla",
  "nombre": "Natilla Vainilla",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 128
 },
 {
  "id": "flan-vainilla",
  "nombre": "Flan Vainilla",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 129
 },
 {
  "id": "mix-hershey-s",
  "nombre": "Mix Hershey's",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 130
 },
 {
  "id": "mix-lunetas",
  "nombre": "Mix Lunetas",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 131
 },
 {
  "id": "oikos-fresa",
  "nombre": "Oikos Fresa",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 132
 },
 {
  "id": "danonino-maxi",
  "nombre": "Danonino Maxi",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 133
 },
 {
  "id": "danonino-lunch",
  "nombre": "Danonino Lunch",
  "categoria": "Yogurt y postres",
  "marca": "Danone",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 134
 },
 {
  "id": "leche-fresca",
  "nombre": "Leche Fresca",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 135
 },
 {
  "id": "lala-entera",
  "nombre": "Lala Entera",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 136
 },
 {
  "id": "lala-light",
  "nombre": "Lala Light",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 137
 },
 {
  "id": "lala-deslactosada",
  "nombre": "Lala Deslactosada",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 138
 },
 {
  "id": "lala-deslactosada-light",
  "nombre": "Lala Deslactosada Light",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 139
 },
 {
  "id": "lala-semi",
  "nombre": "Lala Semi",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 140
 },
 {
  "id": "nutrileche",
  "nombre": "Nutrileche",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 141
 },
 {
  "id": "nutri-deslactosada",
  "nombre": "Nutri Deslactosada",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 142
 },
 {
  "id": "yomi-chocolate-1-l",
  "nombre": "Yomi Chocolate",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "1 L",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 143
 },
 {
  "id": "yomi-chocolate-1-4-l",
  "nombre": "Yomi Chocolate",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "1/4 L",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 144
 },
 {
  "id": "arroz-con-leche",
  "nombre": "Arroz con Leche",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 145
 },
 {
  "id": "bio4",
  "nombre": "Bio4",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 146
 },
 {
  "id": "gastroprotec",
  "nombre": "Gastroprotec",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 147
 },
 {
  "id": "crema-1-4-l",
  "nombre": "Crema",
  "categoria": "Cremas y quesos",
  "marca": "Lala",
  "presentacion": "1/4 L",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 148
 },
 {
  "id": "crema-1-2-l",
  "nombre": "Crema",
  "categoria": "Cremas y quesos",
  "marca": "Lala",
  "presentacion": "1/2 L",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 149
 },
 {
  "id": "crema-900-ml",
  "nombre": "Crema",
  "categoria": "Cremas y quesos",
  "marca": "Lala",
  "presentacion": "900 ml",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 150
 },
 {
  "id": "panela-volcanes",
  "nombre": "Panela Volcanes",
  "categoria": "Cremas y quesos",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 151
 },
 {
  "id": "cottage-volcanes",
  "nombre": "Cottage Volcanes",
  "categoria": "Cremas y quesos",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 152
 },
 {
  "id": "cafe-con-leche-1-l",
  "nombre": "Café con Leche",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "1 L",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 153
 },
 {
  "id": "cafe-con-leche-330-ml",
  "nombre": "Café con Leche",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "330 ml",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 154
 },
 {
  "id": "yoghurt-con-granola",
  "nombre": "Yoghurt con Granola",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 155
 },
 {
  "id": "lala-1-2-galon",
  "nombre": "Lala 1/2 Galón",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 156
 },
 {
  "id": "lala-100-plata",
  "nombre": "Lala 100 Plata",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 157
 },
 {
  "id": "lala-100-dorada",
  "nombre": "Lala 100 Dorada",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 158
 },
 {
  "id": "lala-100-azul-cielo",
  "nombre": "Lala 100 Azul Cielo",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 159
 },
 {
  "id": "lala-100-azul-rey",
  "nombre": "Lala 100 Azul Rey",
  "categoria": "Leche",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 160
 },
 {
  "id": "griego-natural",
  "nombre": "Griego Natural",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 161
 },
 {
  "id": "griego-frutos-rojos",
  "nombre": "Griego Frutos Rojos",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 162
 },
 {
  "id": "griego-mora",
  "nombre": "Griego Mora",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 163
 },
 {
  "id": "lala-100-vainilla",
  "nombre": "Lala 100 Vainilla",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 164
 },
 {
  "id": "lala-100-cacao",
  "nombre": "Lala 100 Cacao",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 165
 },
 {
  "id": "lala-100-fresa",
  "nombre": "Lala 100 Fresa",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 166
 },
 {
  "id": "gelart-s-a",
  "nombre": "Gelart S/A",
  "categoria": "Yogurt y postres",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 167
 },
 {
  "id": "licuado-nuez",
  "nombre": "Licuado Nuez",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 168
 },
 {
  "id": "licuado-fresa",
  "nombre": "Licuado Fresa",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 169
 },
 {
  "id": "licuado-pay",
  "nombre": "Licuado Pay",
  "categoria": "Bebidas lácteas",
  "marca": "Lala",
  "presentacion": "",
  "precio": "",
  "imagen": "",
  "descripcion": "",
  "visible": "SI",
  "disponible": "SI",
  "destacado": "NO",
  "es_alcohol": "NO",
  "temporada": "",
  "orden": 170
 }
];
