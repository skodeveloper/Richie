/*
 * Catálogo público: productos visibles, promociones vigentes, temporadas
 * activas y la configuración pública de la tienda.
 */

var CACHE_CATALOGO = 'catalogo_v1';

function obtenerCatalogo_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get(CACHE_CATALOGO);
  if (guardado) return JSON.parse(guardado);
  var data = construirCatalogo_();
  try {
    cache.put(CACHE_CATALOGO, JSON.stringify(data), 120);
  } catch (e) {
    // Catálogos de más de 100 KB no caben en caché; se sirven sin ella.
  }
  return data;
}

function limpiarCacheCatalogo_() {
  CacheService.getScriptCache().removeAll([CACHE_CATALOGO, 'comentarios_v1']);
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
    orden: LunaPromos.num(p.orden)
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
