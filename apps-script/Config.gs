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
