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
