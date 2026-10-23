// Seguimiento del pedido por folio y/o teléfono, con línea de tiempo.
import { api, loadCatalog } from '../api.js';
import { cart } from '../cart.js';
import { renderChrome, setCatalog, errorBox, toast, negocioActual, productsById } from '../ui.js';
import { esc, money, importe, cantidadTexto, qs, normPhone, prettyDate, ESTADOS, flujoEstados, store } from '../util.js';

renderChrome('seguimiento.html');
loadCatalog(setCatalog).catch(() => {});

const form = qs('#track-form');
const out = qs('#track-result');
const recientes = qs('#recent');
const params = new URLSearchParams(location.search);
let timer = null;
let actual = null; // {folio, telefono}

form.folio.value = params.get('folio') || '';
form.telefono.value = params.get('telefono') || '';

function misPedidos() {
  return store.get('luna_mis_pedidos', []);
}

function telefonoConocido(folio) {
  const m = misPedidos().find((x) => x.folio === folio);
  return normPhone(form.telefono.value) || (m && m.telefono) || '';
}

function renderRecientes() {
  const lista = misPedidos();
  recientes.innerHTML = lista.length ? `<h3 style="margin:28px 0 12px">Pedidos hechos desde este dispositivo</h3>
    <div class="order-list">${lista.map((p) => `<a class="order-item" href="?folio=${encodeURIComponent(p.folio)}&telefono=${encodeURIComponent(p.telefono)}">
      <span><strong>${esc(p.folio)}</strong><br><span class="small muted">${esc(prettyDate(p.fecha))}</span></span><span aria-hidden="true">→</span></a>`).join('')}</div>` : '';
}

function timelineHtml(p) {
  const hist = p.historial || [];
  const fechaDe = (estado) => {
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].estado === estado) return hist[i];
    return null;
  };
  if (p.estado === 'CANCELADO') {
    const h = fechaDe('CANCELADO');
    return `<ol class="timeline"><li class="current"><span class="dot">✕</span><strong>Pedido cancelado</strong>
      <span>${h ? esc(prettyDate(h.fecha)) : ''}${h && h.nota ? ` · ${esc(h.nota)}` : ''}</span></li></ol>`;
  }
  const flujo = flujoEstados(p.entrega);
  const idx = flujo.indexOf(p.estado);
  return `<ol class="timeline">${flujo.map((e, i) => {
    const cls = i < idx || p.estado === 'ENTREGADO' ? 'done' : i === idx ? 'current' : 'pending';
    const h = i <= idx ? fechaDe(e) : null;
    return `<li class="${cls}"><span class="dot" aria-hidden="true">${cls === 'done' ? '✓' : i + 1}</span>
      <strong>${esc(ESTADOS[e].nombre)}</strong>
      <span>${cls === 'pending' ? esc(ESTADOS[e].desc) : `${h ? esc(prettyDate(h.fecha)) : ''}${h && h.nota ? ` · ${esc(h.nota)}` : cls === 'current' ? ` · ${esc(ESTADOS[e].desc)}` : ''}`}</span></li>`;
  }).join('')}</ol>`;
}

function pedidoHtml(p) {
  const tel = telefonoConocido(p.folio);
  const pend = p.precios_pendientes;
  const sinPrecio = (p.productos || []).some((l) => l.total === null || l.total === undefined);
  return `<div class="checkout" style="margin-top:28px">
    <div class="panel">
      <p class="eyebrow">Folio</p>
      <h2>${esc(p.folio)}</h2>
      <p class="muted small">Pedido del ${esc(prettyDate(p.fecha))} · ${p.entrega === 'recoger' ? 'Paso a recoger' : 'A domicilio'} · Pago ${p.pago === 'transferencia' ? 'por transferencia' : 'en efectivo'}</p>
      ${p.nota_cliente ? `<div class="alert info"><strong>Mensaje de la tienda:</strong> ${esc(p.nota_cliente)}</div>` : ''}
      ${timelineHtml(p)}
      ${p.editable ? `<div class="alert ok">¿Se te olvidó algo? Puedes agregar productos mientras no confirmemos tu pedido.
        <div style="margin-top:10px"><button class="btn small" type="button" data-edit>Agregar productos</button></div></div>` : ''}
      ${['ENTREGADO', 'CANCELADO'].includes(p.estado) ? `<div class="reorder"><button class="btn small secondary" type="button" data-reorder>🔁 Volver a pedir lo mismo</button></div>` : ''}
      <p class="small muted">${['ENTREGADO', 'CANCELADO'].includes(p.estado) ? '' : 'Se actualiza solo cada minuto. '}¿Dudas? Llámanos al ${(() => { const t = negocioActual().telefonos[0]; return t ? `<a href="tel:${esc(t.tel)}">${esc(t.texto)}</a>` : 'teléfono de la tienda'; })()}.</p>
    </div>
    <aside class="panel">
      <h3>Tu pedido</h3>
      ${(p.productos || []).map((l) => `<div class="line"><div><div class="name">${esc(cantidadTexto(l))} ${esc(l.nombre)}</div>
        <div class="meta">${esc(l.presentacion || '')}${l.promo ? ` · <b style="color:#8a5a00">${esc(l.promo)}</b>` : ''}</div></div>
        <div class="right"><strong>${l.total === null ? 'Por confirmar' : money(l.total)}</strong></div></div>`).join('')}
      <dl class="totals" style="margin-top:14px">
        <dt>Subtotal</dt><dd>${importe(p.subtotal, sinPrecio)}</dd>
        ${Number(p.descuento) ? `<dt>Promociones</dt><dd class="save">−${money(p.descuento)}</dd>` : ''}
        <dt>Envío</dt><dd>${p.entrega === 'recoger' ? '—' : money(p.envio)}</dd>
        <dt class="total">Total${pend ? ' estimado' : ''}</dt><dd class="total">${importe(p.total, sinPrecio)}</dd>
      </dl>
      ${pend ? '<p class="small muted">El total final se confirma por teléfono.</p>' : ''}
    </aside>
  </div>
  <input type="hidden" id="tel-conocido" value="${esc(tel)}">`;
}

async function buscar(folio, telefono, silencioso = false) {
  clearTimeout(timer);
  if (!silencioso) out.innerHTML = '<p class="muted" style="margin-top:20px">Buscando…</p>';
  try {
    const r = await api.track(folio, telefono);
    if (r.pedido) {
      actual = { folio: r.pedido.folio, telefono, pedido: r.pedido };
      out.innerHTML = pedidoHtml(r.pedido);
      if (!['ENTREGADO', 'CANCELADO'].includes(r.pedido.estado)) {
        timer = setTimeout(() => { if (!document.hidden) buscar(folio, telefono, true); }, 60000);
      }
    } else {
      actual = null;
      out.innerHTML = `<h3 style="margin:28px 0 12px">Pedidos con ese teléfono</h3><div class="order-list">${r.pedidos.map((p) => `
        <a class="order-item" href="?folio=${encodeURIComponent(p.folio)}&telefono=${encodeURIComponent(telefono)}">
          <span><strong>${esc(p.folio)}</strong> <span class="st ${esc(p.estado)}">${esc((ESTADOS[p.estado] || {}).nombre || p.estado)}</span><br>
          <span class="small muted">${esc(prettyDate(p.fecha))} · ${p.piezas} piezas · ${importe(p.total, !Number(p.total))}</span></span><span aria-hidden="true">→</span></a>`).join('')}</div>`;
    }
  } catch (e) {
    if (!silencioso) out.innerHTML = `<div style="margin-top:20px">${errorBox(e.message)}</div>`;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const folio = form.folio.value.trim().toUpperCase();
  const tel = normPhone(form.telefono.value);
  if (!folio && !tel) {
    out.innerHTML = `<div style="margin-top:20px">${errorBox('Escribe tu folio o tu teléfono de 10 dígitos.')}</div>`;
    return;
  }
  history.replaceState(null, '', `?${new URLSearchParams({ ...(folio && { folio }), ...(tel && { telefono: tel }) })}`);
  buscar(folio, tel);
});

out.addEventListener('click', (e) => {
  if (e.target.closest('[data-reorder]') && actual) {
    const disponibles = productsById();
    const items = actual.pedido.productos.filter((l) => disponibles[l.id] && disponibles[l.id].disponible);
    if (!items.length) {
      toast('Esos productos ya no están disponibles', 'error');
      return;
    }
    if (cart.count() && !confirm('Tienes productos en tu carrito. ¿Agregamos también los de este pedido?')) return;
    if (cart.editing()) cart.clear();
    items.forEach((l) => cart.set(l.id, cart.qty(l.id) + l.cantidad));
    const faltan = actual.pedido.productos.length - items.length;
    toast(faltan ? `Agregamos ${items.length} productos (${faltan} ya no están disponibles)` : 'Listo: agregamos tu pedido anterior al carrito');
    setTimeout(() => { location.href = 'pedido.html'; }, 900);
    return;
  }
  if (!e.target.closest('[data-edit]') || !actual) return;
  let tel = qs('#tel-conocido').value;
  if (!tel) {
    tel = normPhone(prompt('Para modificar tu pedido escribe el teléfono con el que lo hiciste:') || '');
    if (!tel) {
      toast('Necesitamos el teléfono del pedido', 'error');
      return;
    }
  }
  if (cart.count() && !cart.editing() && !confirm('Tienes productos en tu carrito. Se reemplazarán por los de este pedido para que puedas modificarlo. ¿Continuar?')) return;
  cart.startEdit(actual.folio, tel, actual.pedido.productos.map((l) => ({ id: l.id, cantidad: l.cantidad })));
  location.href = 'tienda.html';
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && actual && !['ENTREGADO', 'CANCELADO'].includes(actual.pedido.estado)) {
    buscar(actual.folio, actual.telefono, true);
  }
});

renderRecientes();
if (form.folio.value || form.telefono.value) buscar(form.folio.value.trim().toUpperCase(), normPhone(form.telefono.value));
