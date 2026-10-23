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
