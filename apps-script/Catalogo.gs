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
