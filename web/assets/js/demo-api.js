// Backend de DEMOSTRACIÓN: imita al Apps Script dentro del navegador para
// probar el sitio y el panel sin conexión. Todo se guarda solo en este
// navegador (localStorage). Contraseña del panel en demo: "demo".
import { todayMX, nowMX, normPhone, isEmail, store } from './util.js';

const P = window.LunaPromos;
const DB_KEY = 'luna_demo_db_v2';
const PASS_KEY = 'luna_demo_pass';
const PRIVADAS = ['email_notificacion', 'crm_webhook_url', 'email_cliente'];
const ESTADOS = ['RECIBIDO', 'CONFIRMADO', 'PREPARANDO', 'EN_CAMINO', 'LISTO_RECOGER', 'ENTREGADO', 'CANCELADO'];
const SI_NO = ['email_cliente', 'notificar_comentarios', 'pedidos_activos', 'permitir_recoger', 'pago_efectivo', 'pago_transferencia'];
const MONTOS = ['envio_costo', 'envio_gratis_desde', 'pedido_minimo'];

let basePromise;
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { throw new Error(msg); };
const texto = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (s) => P.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
const idUnico = (base, lista) => { let id = base; let n = 2; while (lista.some((x) => x.id === id)) id = `${base}-${n++}`; return id; };
const siNo = (v) => (P.truthy(v) ? 'SI' : 'NO');
const vigencia = (a, i, f, hoy) => (!a ? 'APAGADA' : i && hoy < i ? 'PROGRAMADA' : f && hoy > f ? 'VENCIDA' : 'ACTIVA');

function numOVacio(v, nombre, min, max) {
  if (v === '' || v === null || v === undefined) return null;
  const n = P.num(v);
  if (n === null || n < min || n > max) fail(`${nombre} no es válido.`);
  return n;
}

const normProd = (p) => ({
  ...p,
  precio: P.num(p.precio),
  orden: P.num(p.orden),
  visible: P.truthy(p.visible),
  disponible: p.disponible === '' || p.disponible === undefined ? true : P.truthy(p.disponible),
  destacado: P.truthy(p.destacado),
  es_alcohol: P.truthy(p.es_alcohol),
  temporada: p.temporada || '',
  imagen: p.imagen || '',
  unidad: p.unidad === 'kg' ? 'kg' : '',
  codigo: p.codigo || ''
});
const normPromo = (p) => ({ ...p, valor: P.num(p.valor), lleva: P.num(p.lleva), paga: P.num(p.paga), activa: P.truthy(p.activa) });
const normTemp = (t) => ({ ...t, activa: P.truthy(t.activa) });

async function db() {
  const guardada = store.get(DB_KEY, null);
  if (guardada) return guardada;
  basePromise ||= fetch('data/demo.json').then((r) => r.json());
  const d = JSON.parse(JSON.stringify(await basePromise));
  const nueva = {
    config: d.config,
    productos: d.productos.map(normProd),
    promociones: d.promociones.map(normPromo),
    temporadas: d.temporadas.map(normTemp),
    comentarios: d.comentarios || [],
    pedidos: [],
    clientes: []
  };
  store.set(DB_KEY, nueva);
  return nueva;
}
const guardar = (d) => store.set(DB_KEY, d);

// ---------- Público ----------

async function catalog() {
  await wait(150);
  const d = await db();
  const hoy = todayMX();
  const config = Object.fromEntries(Object.entries(d.config).filter(([k]) => !PRIVADAS.includes(k)));
  return {
    generado: new Date().toISOString(),
    hoy,
    demo: true,
    config,
    productos: d.productos.filter((p) => p.visible && p.id && p.nombre).map(({ codigo, ...p }) => p),
    promociones: d.promociones.filter((p) => P.isActive(p, hoy)),
    temporadas: d.temporadas.filter((t) => vigencia(t.activa, t.inicio, t.fin, hoy) === 'ACTIVA')
  };
}

async function cotizar(items, entrega, mayorEdad) {
  const cat = await catalog();
  const cfg = cat.config;
  const porId = Object.fromEntries(cat.productos.map((p) => [p.id, p]));
  if (!Array.isArray(items) || !items.length) fail('Tu pedido está vacío.');
  const limpios = items.map((it) => {
    const p = porId[String(it.id)];
    const pedida = Number(it.cantidad);
    // Piezas enteras de 1 a 99; granel en cuartos de kilo de ¼ a 25 kg.
    const cantidad = P.cantidadValida(p, pedida);
    if (!(cantidad > 0 && cantidad === pedida && cantidad <= (P.esGranel(p) ? P.MAX_KG : 99))) fail('Cantidad no válida.');
    if (p && !p.disponible) fail(`${p.nombre} está agotado por ahora. Quítalo de tu pedido.`);
    return { id: String(it.id), cantidad };
  });
  const c = P.quote(limpios, porId, cat.promociones, {
    today: cat.hoy, entrega, envioCosto: cfg.envio_costo, envioGratisDesde: cfg.envio_gratis_desde
  });
  if (c.faltantes.length) fail('Algunos productos ya no están disponibles. Actualiza tu carrito.');
  if (c.contieneAlcohol && mayorEdad !== true) fail('Para comprar bebidas alcohólicas confirma que eres mayor de 18 años.');
  const minimo = P.num(cfg.pedido_minimo);
  if (minimo !== null && !c.preciosPendientes && c.subtotal - c.descuento < minimo) fail(`El pedido mínimo es de $${minimo}.`);
  return c;
}

function aplicar(destino, c) {
  destino.productos = c.lines.map((l) => ({
    id: l.id, nombre: l.nombre, presentacion: l.presentacion, cantidad: l.cantidad, precio: l.precio,
    descuento: l.descuento, total: l.total, promo: l.promo ? l.promo.etiqueta : '', es_alcohol: l.es_alcohol, unidad: l.unidad
  }));
  Object.assign(destino, {
    piezas: c.piezas, subtotal: c.subtotal, descuento: c.descuento, envio: c.envio, total: c.total,
    precios_pendientes: c.preciosPendientes || c.envioPorConfirmar, contiene_alcohol: c.contieneAlcohol
  });
}

function publico(p) {
  const { nombre, telefono, email, direccion, colonia, referencias, paga_con, notas, nota_interna, ...rest } = p;
  return { ...rest, editable: p.estado === 'RECIBIDO' };
}

async function createOrder(b) {
  await wait(600);
  if (b.website) fail('Solicitud inválida.');
  const d = await db();
  const cfg = d.config;
  if (!P.truthy(cfg.pedidos_activos)) fail(cfg.mensaje_pedidos_pausados || 'Por el momento no recibimos pedidos en línea.');
  const c = {
    nombre: texto(b.nombre, 80), telefono: normPhone(b.telefono), email: texto(b.email, 120).toLowerCase(),
    entrega: b.entrega === 'recoger' ? 'recoger' : 'domicilio', direccion: texto(b.direccion), colonia: texto(b.colonia, 80),
    referencias: texto(b.referencias), pago: b.pago === 'transferencia' ? 'transferencia' : 'efectivo',
    paga_con: b.pago === 'transferencia' ? null : P.num(b.paga_con), notas: texto(b.notas, 500)
  };
  if (c.nombre.length < 2) fail('Escribe tu nombre.');
  if (!c.telefono) fail('Escribe un teléfono de 10 dígitos.');
  if (c.email && !isEmail(c.email)) fail('El correo no es válido.');
  if (c.entrega === 'domicilio') {
    if (c.direccion.length < 5 || !c.colonia) fail('Escribe tu dirección y colonia.');
    const cob = String(cfg.colonias_cobertura || '').split(',').map((s) => P.norm(s)).filter(Boolean);
    if (cob.length && !cob.includes(P.norm(c.colonia))) fail('Por ahora no entregamos en esa colonia. Puedes pasar a recoger tu pedido.');
  }
  const cot = await cotizar(b.items, c.entrega, b.mayor_edad);
  const fecha = nowMX();
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const folio = 'LL-' + Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  const pedido = {
    folio, fecha, estado: 'RECIBIDO', ...c, nota_cliente: '', nota_interna: '', actualizado: fecha,
    historial: [{ estado: 'RECIBIDO', fecha, nota: 'Pedido recibido' }]
  };
  aplicar(pedido, cot);
  d.pedidos.push(pedido);
  let cli = d.clientes.find((x) => x.telefono === c.telefono);
  if (!cli) {
    cli = { telefono: c.telefono, pedidos: 0, total_acumulado: 0, primer_pedido: fecha };
    d.clientes.push(cli);
  }
  Object.assign(cli, {
    nombre: c.nombre, email: c.email || cli.email || '', ultimo_pedido: fecha, ultimo_folio: folio,
    pedidos: cli.pedidos + 1, total_acumulado: P.round2(cli.total_acumulado + cot.total)
  });
  if (c.entrega === 'domicilio') Object.assign(cli, { direccion: c.direccion, colonia: c.colonia });
  guardar(d);
  return {
    folio, estado: 'RECIBIDO', fecha, cotizacion: cot,
    transferencia: c.pago === 'transferencia' ? cfg.transferencia_datos || '' : ''
  };
}

async function updateOrder(b) {
  await wait(500);
  const d = await db();
  const p = d.pedidos.find((x) => x.folio === String(b.folio || '').toUpperCase());
  if (!p || p.telefono !== normPhone(b.telefono)) fail('No encontramos un pedido con ese folio y teléfono.');
  if (p.estado !== 'RECIBIDO') fail('Tu pedido ya está en preparación y no se puede modificar en línea. Llámanos para agregar productos.');
  const cot = await cotizar(b.items, p.entrega, b.mayor_edad);
  aplicar(p, cot);
  if (b.notas !== undefined) p.notas = texto(b.notas, 500);
  p.actualizado = nowMX();
  p.historial.push({ estado: 'RECIBIDO', fecha: p.actualizado, nota: 'El cliente modificó su pedido' });
  guardar(d);
  return { folio: p.folio, estado: p.estado, cotizacion: cot };
}

async function track(folio, telefono) {
  await wait();
  const d = await db();
  const f = String(folio || '').trim().toUpperCase();
  const tel = normPhone(telefono);
  if (!f && !tel) fail('Escribe tu folio o tu teléfono.');
  if (f) {
    const p = d.pedidos.find((x) => x.folio === f);
    if (!p || (tel && p.telefono !== tel)) fail('No encontramos ese pedido. Revisa el folio' + (tel ? ' y el teléfono.' : '.'));
    return { pedido: publico(p) };
  }
  const lista = d.pedidos.filter((x) => x.telefono === tel).slice(-5).reverse()
    .map(({ folio: fo, fecha, estado, total, piezas, entrega }) => ({ folio: fo, fecha, estado, total, piezas, entrega }));
  if (!lista.length) fail('No encontramos pedidos con ese teléfono.');
  return { pedidos: lista };
}

async function comments() {
  await wait(150);
  const d = await db();
  const aprobados = d.comentarios.filter((c) => c.estado === 'APROBADO' && c.publicable !== false);
  const suma = aprobados.reduce((s, c) => s + Number(c.calificacion), 0);
  return {
    total: aprobados.length,
    promedio: aprobados.length ? P.round2(suma / aprobados.length) : null,
    comentarios: aprobados.slice(-30).reverse().map((c) => {
      const partes = c.nombre.trim().split(/\s+/);
      return {
        nombre: partes.length > 1 ? `${partes[0]} ${partes[1][0].toUpperCase()}.` : partes[0],
        calificacion: c.calificacion, comentario: c.comentario, fecha: c.fecha.slice(0, 10), respuesta: c.respuesta || ''
      };
    })
  };
}

async function addComment(b) {
  await wait(400);
  if (b.website) fail('Solicitud inválida.');
  const cal = Math.round(Number(b.calificacion));
  if (texto(b.nombre).length < 2) fail('Escribe tu nombre.');
  if (!(cal >= 1 && cal <= 5)) fail('Elige de 1 a 5 estrellas.');
  if (String(b.comentario || '').trim().length < 5) fail('Escribe tu comentario.');
  const d = await db();
  const c = {
    id: 'C-' + Date.now(), fecha: nowMX(), nombre: texto(b.nombre, 60), calificacion: cal,
    comentario: String(b.comentario).trim().slice(0, 800), folio: texto(b.folio, 12).toUpperCase(),
    publicable: b.publicable !== false, estado: 'PENDIENTE', respuesta: ''
  };
  d.comentarios.push(c);
  guardar(d);
  return { id: c.id };
}

// ---------- Panel ----------

let sesion = '';
const auth = (t) => { if (!t || t !== sesion) fail('SESION_EXPIRADA'); };
const password = () => store.get(PASS_KEY, 'demo');

async function login(pw) {
  await wait(400);
  if (pw !== password()) fail('Contraseña incorrecta. (En modo demostración es "demo").');
  sesion = 'demo-' + Date.now();
  try { sessionStorage.setItem('luna_demo_sesion', sesion); } catch (e) { /* sin almacenamiento */ }
  return { token: sesion, expira_en: 21600 };
}
try { sesion = sessionStorage.getItem('luna_demo_sesion') || ''; } catch (e) { sesion = ''; }

async function adminOrders(token, { estado = '', q = '' } = {}) {
  await wait(200);
  auth(token);
  const d = await db();
  const todos = d.pedidos.slice().reverse();
  const resumen = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  todos.forEach((p) => { resumen[p.estado] = (resumen[p.estado] || 0) + 1; });
  const hoy = todayMX();
  const qn = P.norm(q);
  const lista = todos.filter((p) => {
    if (estado === 'ACTIVOS' && ['ENTREGADO', 'CANCELADO'].includes(p.estado)) return false;
    if (estado && !['ACTIVOS', 'TODOS'].includes(estado) && p.estado !== estado) return false;
    return !qn || P.norm([p.folio, p.nombre, p.telefono, p.colonia, p.direccion].join(' ')).includes(qn);
  }).map((p) => ({ ...p, editable: p.estado === 'RECIBIDO' }));
  return { pedidos: lista, resumen, hoy: todos.filter((p) => p.fecha.startsWith(hoy)).length, estados: ESTADOS };
}

async function adminUpdateOrder(token, b) {
  await wait(300);
  auth(token);
  const d = await db();
  const p = d.pedidos.find((x) => x.folio === b.folio);
  if (!p) fail('Pedido no encontrado.');
  if (!ESTADOS.includes(b.estado)) fail('Estado no válido.');
  p.actualizado = nowMX();
  if (b.nota_cliente !== undefined) p.nota_cliente = texto(b.nota_cliente, 300);
  if (b.nota_interna !== undefined) p.nota_interna = texto(b.nota_interna, 500);
  if (b.estado !== p.estado) p.historial.push({ estado: b.estado, fecha: p.actualizado, nota: p.nota_cliente || '' });
  p.estado = b.estado;
  guardar(d);
  return { pedido: { ...p, editable: p.estado === 'RECIBIDO' } };
}

async function adminComments(token) {
  await wait(200);
  auth(token);
  return { comentarios: (await db()).comentarios.slice().reverse() };
}

async function adminModerateComment(token, b) {
  await wait(200);
  auth(token);
  const d = await db();
  const c = d.comentarios.find((x) => x.id === b.id);
  if (!c) fail('Comentario no encontrado.');
  c.estado = b.estado;
  if (b.respuesta !== undefined) c.respuesta = texto(b.respuesta, 400);
  guardar(d);
  return { id: c.id, estado: c.estado };
}

async function adminCatalog(token) {
  await wait(250);
  auth(token);
  const d = await db();
  const hoy = todayMX();
  return {
    hoy,
    productos: d.productos,
    promociones: d.promociones.map((p) => ({ ...p, estado: vigencia(p.activa, p.inicio, p.fin, hoy) })),
    temporadas: d.temporadas.map((t) => ({
      ...t, estado: vigencia(t.activa, t.inicio, t.fin, hoy), productos: d.productos.filter((p) => p.temporada === t.id).length
    })),
    config: d.config
  };
}

async function adminSaveProducts(token, { productos = [] }) {
  await wait(300);
  auth(token);
  const d = await db();
  if (!productos.length) fail('No hay cambios para guardar.');
  const guardados = productos.map((c) => {
    let p;
    if (c.nuevo) {
      if (texto(c.nombre).length < 2) fail('Escribe el nombre del producto.');
      p = {
        id: idUnico(slug(`${c.nombre} ${c.presentacion || ''}`), d.productos), nombre: '', categoria: '', marca: '', presentacion: '',
        precio: null, imagen: '', descripcion: '', visible: true, disponible: true, destacado: false, es_alcohol: false, temporada: '',
        orden: Math.max(0, ...d.productos.map((x) => x.orden || 0)) + 1, unidad: '', codigo: ''
      };
    } else {
      p = d.productos.find((x) => x.id === c.id);
      if (!p) fail('No encontramos ese producto. Recarga el panel.');
    }
    const n = { ...p };
    for (const k of ['nombre', 'categoria', 'marca', 'presentacion', 'descripcion']) if (c[k] !== undefined) n[k] = texto(c[k], k === 'descripcion' ? 300 : 120);
    if (c.precio !== undefined) n.precio = numOVacio(c.precio, 'El precio', 0, 1000000);
    if (c.orden !== undefined) n.orden = numOVacio(c.orden, 'El orden', -100000, 100000);
    if (c.imagen !== undefined) {
      const u = String(c.imagen || '').trim();
      if (u && !/^(https:\/\/|data:image\/)/.test(u)) fail('El enlace de la foto debe empezar con https://');
      n.imagen = u;
    }
    if (c.temporada !== undefined) {
      if (c.temporada && !d.temporadas.some((t) => t.id === c.temporada)) fail('Esa temporada ya no existe. Recarga el panel.');
      n.temporada = c.temporada || '';
    }
    for (const k of ['visible', 'disponible', 'destacado', 'es_alcohol']) if (c[k] !== undefined) n[k] = P.truthy(siNo(c[k]));
    if (c.unidad !== undefined) n.unidad = c.unidad === 'kg' ? 'kg' : '';
    if (texto(n.nombre).length < 2) fail('Escribe el nombre del producto.');
    if (!texto(n.categoria)) fail(`Elige una categoría para ${n.nombre}.`);
    if (c.nuevo) d.productos.push(n);
    else Object.assign(p, n);
    return n;
  });
  guardar(d);
  return { productos: guardados };
}

// Misma lógica que el Apps Script: por código del punto de venta, los
// existentes solo cambian precio, disponibilidad y unidad.
async function adminImportProducts(token, { productos = [], ocultar_sin_codigo: ocultar = false }) {
  await wait(400);
  auth(token);
  if (productos.length > 1500) fail('Envía el catálogo en partes de máximo 1500 productos.');
  const d = await db();
  const porCodigo = new Map(d.productos.filter((p) => p.codigo).map((p) => [String(p.codigo), p]));
  const vistos = new Set();
  const ids = new Set(d.productos.map((p) => p.id));
  let orden = Math.max(0, ...d.productos.map((x) => x.orden || 0));
  const r = { nuevos: 0, actualizados: 0, sin_cambios: 0, ocultados: 0, omitidos: 0 };
  for (const x of productos) {
    const codigo = texto(x.codigo, 40);
    const nombre = texto(x.nombre, 120);
    const precio = P.num(x.precio);
    if (!codigo || nombre.length < 2 || vistos.has(codigo) || (precio !== null && (precio < 0 || precio > 1000000))) { r.omitidos++; continue; }
    vistos.add(codigo);
    const unidad = x.unidad === 'kg' ? 'kg' : '';
    const disponible = P.truthy(siNo(x.disponible));
    const p = porCodigo.get(codigo);
    if (p) {
      const cambio = p.precio !== precio || p.disponible !== disponible || (p.unidad || '') !== unidad;
      Object.assign(p, { precio, disponible, unidad });
      r[cambio ? 'actualizados' : 'sin_cambios']++;
      continue;
    }
    let id = `pos-${slug(codigo)}`;
    for (let n = 2; ids.has(id); n++) id = `pos-${slug(codigo)}-${n}`;
    ids.add(id);
    d.productos.push({
      id, nombre, categoria: texto(x.categoria, 60) || 'Despensa', marca: texto(x.marca, 60), presentacion: texto(x.presentacion, 60),
      precio, imagen: '', descripcion: '', visible: P.truthy(siNo(x.visible)), disponible, destacado: false,
      es_alcohol: P.truthy(siNo(x.es_alcohol)), temporada: '', orden: ++orden, unidad, codigo
    });
    r.nuevos++;
  }
  if (ocultar === true) {
    d.productos.forEach((p) => { if (!p.codigo && p.visible) { p.visible = false; r.ocultados++; } });
  }
  guardar(d);
  return r;
}

async function adminDeleteProduct(token, { id }) {
  await wait(200);
  auth(token);
  const d = await db();
  d.productos = d.productos.filter((p) => p.id !== id);
  guardar(d);
  return { id };
}

async function adminSavePromo(token, { promo: c = {} }) {
  await wait(300);
  auth(token);
  const d = await db();
  const p = {
    titulo: texto(c.titulo, 100), descripcion: texto(c.descripcion, 300), tipo: String(c.tipo || '').toUpperCase(),
    valor: numOVacio(c.valor, 'El valor', 0, 1000000), lleva: numOVacio(c.lleva, '“Lleva”', 1, 100), paga: numOVacio(c.paga, '“Paga”', 0, 100),
    aplica_a: String(c.aplica_a || '').split(',').map((s) => s.trim()).filter(Boolean).join(','),
    inicio: String(c.inicio || ''), fin: String(c.fin || ''), activa: P.truthy(siNo(c.activa)), imagen: c.imagen || ''
  };
  if (p.titulo.length < 3) fail('Escribe un título para la promoción.');
  if (!P.TIPOS.includes(p.tipo)) fail('Elige el tipo de promoción.');
  if (!p.aplica_a) fail('Elige a qué productos aplica la promoción.');
  if (p.tipo === 'PORCENTAJE' && !(p.valor > 0 && p.valor <= 100)) fail('El porcentaje debe estar entre 1 y 100.');
  if (p.tipo === 'PRECIO_ESPECIAL' && p.valor === null) fail('Escribe el precio especial.');
  if (p.tipo === 'DESCUENTO_PIEZA' && !(p.valor > 0)) fail('Escribe cuántos pesos se descuentan por pieza.');
  if (p.tipo === 'NXM') {
    if (p.lleva === null || p.paga === null || p.paga >= p.lleva) fail('En “lleva y paga”, paga debe ser menor que lleva (ej. lleva 2, paga 1).');
    p.valor = null;
  } else {
    p.lleva = null;
    p.paga = null;
  }
  if (p.inicio && p.fin && p.fin < p.inicio) fail('La fecha de fin es anterior a la de inicio.');
  let r;
  if (c.id) {
    r = d.promociones.find((x) => x.id === c.id);
    if (!r) fail('Ya no existe. Recarga el panel.');
    Object.assign(r, p);
  } else {
    r = { id: idUnico(slug(p.titulo), d.promociones), ...p };
    d.promociones.push(r);
  }
  guardar(d);
  return { promo: { ...r, estado: vigencia(r.activa, r.inicio, r.fin, todayMX()) } };
}

async function adminDeletePromo(token, { id }) {
  await wait(200);
  auth(token);
  const d = await db();
  d.promociones = d.promociones.filter((p) => p.id !== id);
  guardar(d);
  return { id };
}

async function adminSaveSeason(token, { temporada: c = {}, productos }) {
  await wait(300);
  auth(token);
  const d = await db();
  const t = {
    nombre: texto(c.nombre, 100), descripcion: texto(c.descripcion, 300), inicio: String(c.inicio || ''),
    fin: String(c.fin || ''), activa: P.truthy(siNo(c.activa)), imagen: c.imagen || ''
  };
  if (t.nombre.length < 3) fail('Escribe el nombre de la temporada.');
  if (t.inicio && t.fin && t.fin < t.inicio) fail('La fecha de fin es anterior a la de inicio.');
  let r;
  if (c.id) {
    r = d.temporadas.find((x) => x.id === c.id);
    if (!r) fail('Ya no existe. Recarga el panel.');
    Object.assign(r, t);
  } else {
    r = { id: idUnico(slug(`${t.nombre} ${(t.inicio || todayMX()).slice(0, 4)}`), d.temporadas), ...t };
    d.temporadas.push(r);
  }
  if (Array.isArray(productos)) {
    d.productos.forEach((p) => {
      if (productos.includes(p.id)) p.temporada = r.id;
      else if (p.temporada === r.id) p.temporada = '';
    });
  }
  guardar(d);
  return { temporada: { ...r, estado: vigencia(r.activa, r.inicio, r.fin, todayMX()) } };
}

async function adminDeleteSeason(token, { id }) {
  await wait(200);
  auth(token);
  const d = await db();
  d.temporadas = d.temporadas.filter((t) => t.id !== id);
  d.productos.forEach((p) => { if (p.temporada === id) p.temporada = ''; });
  guardar(d);
  return { id };
}

async function adminSaveConfig(token, { config = {} }) {
  await wait(300);
  auth(token);
  const d = await db();
  for (const [k, v] of Object.entries(config)) {
    if (!(k in d.config)) fail(`Ajuste desconocido: ${k}`);
    let s = String(v ?? '').trim();
    if (SI_NO.includes(k)) s = siNo(v);
    else if (MONTOS.includes(k)) s = numOVacio(v, 'El monto', 0, 100000) ?? '';
    else if (k === 'email_notificacion' && s && !isEmail(s)) fail('El correo para avisos no es válido.');
    else if (k === 'whatsapp') {
      if (s && !normPhone(s)) fail('El WhatsApp debe tener 10 dígitos.');
      s = normPhone(s);
    } else if (k.startsWith('horario_')) {
      if (s && !/^cerrado$/i.test(s) && !/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(s)) fail('Escribe el horario así: 8:00-23:30 (o “Cerrado”).');
      s = s.replace(/\s+/g, '');
    } else if (k === 'colonias_cobertura' || k === 'telefonos') s = s.split(',').map((x) => x.trim()).filter(Boolean).join(', ');
    d.config[k] = s;
  }
  guardar(d);
  return { config: d.config };
}

async function adminClients(token, { q = '' } = {}) {
  await wait(200);
  auth(token);
  const qn = P.norm(q);
  const lista = (await db()).clientes
    .filter((c) => !qn || P.norm([c.nombre, c.telefono, c.colonia, c.email].join(' ')).includes(qn))
    .sort((a, b) => String(b.ultimo_pedido).localeCompare(String(a.ultimo_pedido)));
  return { clientes: lista, total: lista.length };
}

async function adminChangePassword(token, { actual, nueva }) {
  await wait(300);
  auth(token);
  if (actual !== password()) fail('La contraseña actual no es correcta.');
  if (String(nueva || '').length < 8) fail('La contraseña debe tener al menos 8 caracteres.');
  store.set(PASS_KEY, nueva);
  return login(nueva);
}

// En demo la foto se guarda como data: URL dentro del navegador.
async function adminUploadImage(token, { tipo, datos }) {
  await wait(400);
  auth(token);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) fail('Usa una foto JPG, PNG o WebP.');
  return { url: `data:${tipo};base64,${datos}` };
}

export function resetDemo() {
  store.remove(DB_KEY);
  store.remove(PASS_KEY);
}

export const demoApi = {
  catalog, track, comments, createOrder, updateOrder, addComment, login,
  logout: async () => { sesion = ''; return { ok: true }; },
  adminOrders, adminUpdateOrder, adminComments, adminModerateComment,
  adminCatalog, adminSaveProducts, adminImportProducts, adminDeleteProduct, adminSavePromo, adminDeletePromo,
  adminSaveSeason, adminDeleteSeason, adminSaveConfig, adminClients, adminChangePassword, adminUploadImage
};
