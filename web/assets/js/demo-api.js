// Backend de DEMOSTRACIÓN: imita al Apps Script dentro del navegador para
// poder probar el sitio sin conexión. Los pedidos y comentarios se guardan
// solo en este navegador. Contraseña del panel en demo: "demo".
import { todayMX, nowMX, normPhone, isEmail, store } from './util.js';

const P = window.LunaPromos;
const KEY_PEDIDOS = 'luna_demo_pedidos';
const KEY_COMENTARIOS = 'luna_demo_comentarios';
const ESTADOS = ['RECIBIDO', 'CONFIRMADO', 'PREPARANDO', 'EN_CAMINO', 'LISTO_RECOGER', 'ENTREGADO', 'CANCELADO'];

let dataPromise;
const data = () => (dataPromise ||= fetch('data/demo.json').then((r) => r.json()));
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { throw new Error(msg); };
const texto = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function catalog() {
  await wait(150);
  const d = await data();
  const hoy = todayMX();
  return {
    generado: new Date().toISOString(),
    hoy,
    demo: true,
    config: d.config,
    productos: d.productos.filter((p) => P.truthy(p.visible)).map((p) => ({
      ...p,
      precio: P.num(p.precio),
      disponible: p.disponible === '' ? true : P.truthy(p.disponible),
      destacado: P.truthy(p.destacado),
      es_alcohol: P.truthy(p.es_alcohol)
    })),
    promociones: d.promociones.filter((p) => P.isActive(p, hoy)),
    temporadas: d.temporadas.filter((t) => P.truthy(t.activa) && (!t.inicio || hoy >= t.inicio) && (!t.fin || hoy <= t.fin))
  };
}

async function cotizar(items, entrega, mayorEdad) {
  const cat = await catalog();
  const porId = Object.fromEntries(cat.productos.map((p) => [p.id, p]));
  if (!Array.isArray(items) || !items.length) fail('Tu pedido está vacío.');
  const limpios = items.map((it) => {
    const cantidad = Math.floor(Number(it.cantidad));
    if (!(cantidad >= 1 && cantidad <= 99)) fail('Cantidad no válida.');
    return { id: String(it.id), cantidad };
  });
  const c = P.quote(limpios, porId, cat.promociones, {
    today: cat.hoy, entrega, envioCosto: cat.config.envio_costo, envioGratisDesde: cat.config.envio_gratis_desde
  });
  if (c.faltantes.length) fail('Algunos productos ya no están disponibles. Actualiza tu carrito.');
  if (c.contieneAlcohol && mayorEdad !== true) fail('Para comprar bebidas alcohólicas confirma que eres mayor de 18 años.');
  return c;
}

function aplicar(destino, c) {
  destino.productos = c.lines.map((l) => ({
    id: l.id, nombre: l.nombre, presentacion: l.presentacion, cantidad: l.cantidad, precio: l.precio,
    descuento: l.descuento, total: l.total, promo: l.promo ? l.promo.etiqueta : '', es_alcohol: l.es_alcohol
  }));
  Object.assign(destino, {
    piezas: c.piezas, subtotal: c.subtotal, descuento: c.descuento, envio: c.envio, total: c.total,
    precios_pendientes: c.preciosPendientes || c.envioPorConfirmar, contiene_alcohol: c.contieneAlcohol
  });
}

const pedidos = () => store.get(KEY_PEDIDOS, []);
const guardar = (lista) => store.set(KEY_PEDIDOS, lista);

function publico(p) {
  const { nombre, telefono, email, direccion, colonia, referencias, paga_con, notas, nota_interna, ...rest } = p;
  return { ...rest, editable: p.estado === 'RECIBIDO' };
}

async function createOrder(b) {
  await wait(600);
  if (b.website) fail('Solicitud inválida.');
  const c = {
    nombre: texto(b.nombre, 80), telefono: normPhone(b.telefono), email: texto(b.email, 120).toLowerCase(),
    entrega: b.entrega === 'recoger' ? 'recoger' : 'domicilio', direccion: texto(b.direccion), colonia: texto(b.colonia, 80),
    referencias: texto(b.referencias), pago: b.pago === 'transferencia' ? 'transferencia' : 'efectivo',
    paga_con: b.pago === 'transferencia' ? null : P.num(b.paga_con), notas: texto(b.notas, 500)
  };
  if (c.nombre.length < 2) fail('Escribe tu nombre.');
  if (!c.telefono) fail('Escribe un teléfono de 10 dígitos.');
  if (c.email && !isEmail(c.email)) fail('El correo no es válido.');
  if (c.entrega === 'domicilio' && (c.direccion.length < 5 || !c.colonia)) fail('Escribe tu dirección y colonia.');
  const cot = await cotizar(b.items, c.entrega, b.mayor_edad);
  const fecha = nowMX();
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const folio = 'LL-' + Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  const pedido = {
    folio, fecha, estado: 'RECIBIDO', ...c, nota_cliente: '', nota_interna: '', actualizado: fecha,
    historial: [{ estado: 'RECIBIDO', fecha, nota: 'Pedido recibido' }]
  };
  aplicar(pedido, cot);
  guardar([...pedidos(), pedido]);
  const cat = await catalog();
  return {
    folio, estado: 'RECIBIDO', fecha, cotizacion: cot,
    transferencia: c.pago === 'transferencia' ? cat.config.transferencia_datos || '' : ''
  };
}

async function updateOrder(b) {
  await wait(500);
  const lista = pedidos();
  const p = lista.find((x) => x.folio === String(b.folio || '').toUpperCase());
  if (!p || p.telefono !== normPhone(b.telefono)) fail('No encontramos un pedido con ese folio y teléfono.');
  if (p.estado !== 'RECIBIDO') fail('Tu pedido ya está en preparación y no se puede modificar en línea. Llámanos para agregar productos.');
  const cot = await cotizar(b.items, p.entrega, b.mayor_edad);
  aplicar(p, cot);
  if (b.notas !== undefined) p.notas = texto(b.notas, 500);
  p.actualizado = nowMX();
  p.historial.push({ estado: 'RECIBIDO', fecha: p.actualizado, nota: 'El cliente modificó su pedido' });
  guardar(lista);
  return { folio: p.folio, estado: p.estado, cotizacion: cot };
}

async function track(folio, telefono) {
  await wait();
  const f = String(folio || '').trim().toUpperCase();
  const tel = normPhone(telefono);
  if (!f && !tel) fail('Escribe tu folio o tu teléfono.');
  if (f) {
    const p = pedidos().find((x) => x.folio === f);
    if (!p || (tel && p.telefono !== tel)) fail('No encontramos ese pedido. Revisa el folio' + (tel ? ' y el teléfono.' : '.'));
    return { pedido: publico(p) };
  }
  const lista = pedidos().filter((x) => x.telefono === tel).slice(-5).reverse()
    .map(({ folio: fo, fecha, estado, total, piezas, entrega }) => ({ folio: fo, fecha, estado, total, piezas, entrega }));
  if (!lista.length) fail('No encontramos pedidos con ese teléfono.');
  return { pedidos: lista };
}

async function comments() {
  await wait(150);
  const d = await data();
  const aprobados = [...d.comentarios, ...store.get(KEY_COMENTARIOS, [])]
    .filter((c) => c.estado === 'APROBADO' && c.publicable !== false);
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
  const c = {
    id: 'C-' + Date.now(), fecha: nowMX(), nombre: texto(b.nombre, 60), calificacion: cal,
    comentario: String(b.comentario).trim().slice(0, 800), folio: texto(b.folio, 12).toUpperCase(),
    publicable: b.publicable !== false, estado: 'PENDIENTE', respuesta: ''
  };
  store.set(KEY_COMENTARIOS, [...store.get(KEY_COMENTARIOS, []), c]);
  return { id: c.id };
}

const TOKEN = 'demo-token';
const auth = (t) => { if (t !== TOKEN) fail('SESION_EXPIRADA'); };

async function login(password) {
  await wait(400);
  if (password !== 'demo') fail('Contraseña incorrecta. (En modo demostración es "demo").');
  return { token: TOKEN, expira_en: 21600 };
}

async function adminOrders(token, { estado = '', q = '' } = {}) {
  await wait(200);
  auth(token);
  const todos = pedidos().slice().reverse();
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
  const lista = pedidos();
  const p = lista.find((x) => x.folio === b.folio);
  if (!p) fail('Pedido no encontrado.');
  if (!ESTADOS.includes(b.estado)) fail('Estado no válido.');
  p.actualizado = nowMX();
  if (b.nota_cliente !== undefined) p.nota_cliente = texto(b.nota_cliente, 300);
  if (b.nota_interna !== undefined) p.nota_interna = texto(b.nota_interna, 500);
  if (b.estado !== p.estado) p.historial.push({ estado: b.estado, fecha: p.actualizado, nota: p.nota_cliente || '' });
  p.estado = b.estado;
  guardar(lista);
  return { pedido: { ...p, editable: p.estado === 'RECIBIDO' } };
}

async function adminComments(token) {
  await wait(200);
  auth(token);
  return { comentarios: store.get(KEY_COMENTARIOS, []).slice().reverse() };
}

async function adminModerateComment(token, b) {
  await wait(200);
  auth(token);
  const lista = store.get(KEY_COMENTARIOS, []);
  const c = lista.find((x) => x.id === b.id);
  if (!c) fail('Comentario no encontrado.');
  c.estado = b.estado;
  if (b.respuesta !== undefined) c.respuesta = texto(b.respuesta, 400);
  store.set(KEY_COMENTARIOS, lista);
  return { id: c.id, estado: c.estado };
}

export const demoApi = {
  catalog, track, comments, createOrder, updateOrder, addComment, login,
  logout: async () => ({ ok: true }), adminOrders, adminUpdateOrder, adminComments, adminModerateComment
};
