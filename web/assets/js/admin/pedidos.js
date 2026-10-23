// Sección Pedidos: lista en vivo, cambio de estado, mensajes y ticket para imprimir.
import { esc, money, importe, cantidadTexto, prettyDate, ESTADOS, flujoEstados } from '../util.js';
import { toast, debounce } from './ui.js';

let main;
let ctx;
let filtro = { estado: 'ACTIVOS', q: '' };
let filtroDeEnlace = false;
const abiertos = new Set();
let editando = false;

function siguiente(p) {
  const flujo = flujoEstados(p.entrega);
  const i = flujo.indexOf(p.estado);
  return i >= 0 && i < flujo.length - 1 ? flujo[i + 1] : null;
}

function tarjeta(p) {
  const tel = esc(p.telefono);
  const sinPrecio = (p.productos || []).some((l) => l.total === null || l.total === undefined);
  const sig = siguiente(p);
  const dir = `${p.direccion}, ${p.colonia}, Ciudad de México`;
  const nombreEstado = ESTADOS[p.estado] ? ESTADOS[p.estado].nombre : p.estado;
  return `<details class="order-card${p.estado === 'RECIBIDO' ? ' is-new' : ''}" data-folio="${esc(p.folio)}" ${abiertos.has(p.folio) ? 'open' : ''}>
    <summary>
      <span class="folio-s">${esc(p.folio)}</span>
      <span class="who"><strong>${esc(p.nombre)}</strong> · ${importe(p.total, sinPrecio)} · ${p.piezas} pzas
        ${p.entrega === 'recoger' ? ' · <b>Recoge en tienda</b>' : ` · ${esc(p.colonia)}`}${p.contiene_alcohol ? ' · <b>+18</b>' : ''}</span>
      <span class="st ${esc(p.estado)}">${esc(nombreEstado)}</span>
      <span class="when">${esc(prettyDate(p.fecha))}${p.actualizado && p.actualizado !== p.fecha ? ` · actualizado ${esc(prettyDate(p.actualizado))}` : ''}</span>
    </summary>
    <div class="inner">
      <div>
        <ul>${(p.productos || []).map((l) => `<li>${esc(cantidadTexto(l))} ${esc(l.nombre)}${l.presentacion ? ` (${esc(l.presentacion)})` : ''}
          ${l.promo ? ` <b style="color:#8a5a00">${esc(l.promo)}</b>` : ''} — ${l.total === null ? '<i>sin precio</i>' : money(l.total)}</li>`).join('')}</ul>
        <dl class="totals" style="margin-top:12px;max-width:320px">
          <dt>Subtotal</dt><dd>${importe(p.subtotal, sinPrecio)}</dd>
          ${Number(p.descuento) ? `<dt>Promociones</dt><dd>−${money(p.descuento)}</dd>` : ''}
          <dt>Envío</dt><dd>${p.entrega === 'recoger' ? '—' : money(p.envio)}</dd>
          <dt class="total">Total</dt><dd class="total">${importe(p.total, sinPrecio)}</dd>
        </dl>
        ${p.precios_pendientes ? '<p class="small muted">* Hay importes por confirmar con el cliente.</p>' : ''}
        <button class="btn small secondary print-btn" type="button" data-print>🖨 Imprimir ticket</button>
      </div>
      <div>
        <p style="margin-top:0"><strong>${esc(p.nombre)}</strong><br>☎ ${tel}${p.email ? `<br>✉ ${esc(p.email)}` : ''}</p>
        <div class="contact-links">
          <a class="btn small" href="tel:+52${tel}">Llamar</a>
          <a class="btn small secondary" href="https://wa.me/52${tel}?text=${encodeURIComponent(`Hola ${p.nombre}, te escribimos de Abarrotes La Luna sobre tu pedido ${p.folio}.`)}" target="_blank" rel="noopener">WhatsApp</a>
          ${p.entrega === 'domicilio' ? `<a class="btn small secondary" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}" target="_blank" rel="noopener">Mapa</a>` : ''}
        </div>
        <p class="small">${p.entrega === 'recoger' ? '<b>Pasa a recoger a la tienda</b>' : `<b>Entrega:</b> ${esc(p.direccion)}, ${esc(p.colonia)}${p.referencias ? `<br><b>Referencias:</b> ${esc(p.referencias)}` : ''}`}
          <br><b>Pago:</b> ${p.pago === 'transferencia' ? 'Transferencia' : 'Efectivo'}${p.paga_con ? ` · paga con ${money(p.paga_con)}` : ''}
          ${p.notas ? `<br><b>Notas del cliente:</b> ${esc(p.notas)}` : ''}</p>
        <form class="estado-form" data-folio="${esc(p.folio)}">
          <div class="field"><label for="st-${esc(p.folio)}">Estado</label>
            <select id="st-${esc(p.folio)}" name="estado">${Object.keys(ESTADOS).map((e) => `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${ESTADOS[e].nombre}</option>`).join('')}</select></div>
          <div class="field"><label for="nc-${esc(p.folio)}">Mensaje para el cliente <span class="muted small">(lo ve en su seguimiento)</span></label>
            <input id="nc-${esc(p.folio)}" name="nota_cliente" maxlength="300" value="${esc(p.nota_cliente || '')}" placeholder="Ej. No hubo Lala Light, enviamos Deslactosada"></div>
          <div class="field"><label for="ni-${esc(p.folio)}">Nota interna <span class="muted small">(solo la ve la tienda)</span></label>
            <input id="ni-${esc(p.folio)}" name="nota_interna" maxlength="500" value="${esc(p.nota_interna || '')}" placeholder="Ej. Cobrar bolsa"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${sig ? `<button class="btn small gold" type="button" data-next="${sig}">Marcar: ${esc(ESTADOS[sig].nombre)} →</button>` : ''}
            <button class="btn small secondary" type="submit">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  </details>`;
}

async function cargar() {
  const lista = main.querySelector('#plista');
  let r;
  try {
    r = await ctx.api('adminOrders', filtro);
  } catch (e) {
    lista.innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
    return;
  }
  ctx.setBadge('pedidos', r.resumen.RECIBIDO || 0);
  const activos = Object.entries(r.resumen).filter(([e]) => !['ENTREGADO', 'CANCELADO'].includes(e)).reduce((a, [, n]) => a + n, 0);
  const total = Object.values(r.resumen).reduce((a, b) => a + b, 0);
  const kpi = (estado, label, n) => `<button class="kpi" type="button" data-estado="${estado}" aria-pressed="${filtro.estado === estado}"><strong>${n}</strong><span>${label}</span></button>`;
  main.querySelector('#kpis').innerHTML = [
    kpi('ACTIVOS', 'Por atender', activos),
    kpi('RECIBIDO', 'Nuevos', r.resumen.RECIBIDO || 0),
    ...['CONFIRMADO', 'PREPARANDO', 'EN_CAMINO', 'LISTO_RECOGER', 'ENTREGADO', 'CANCELADO'].map((e) => kpi(e, ESTADOS[e].nombre, r.resumen[e] || 0)),
    kpi('TODOS', `Todos · hoy ${r.hoy}`, total)
  ].join('');
  lista.innerHTML = r.pedidos.length
    ? r.pedidos.map(tarjeta).join('')
    : `<div class="adm-empty"><h3>${total ? 'No hay pedidos con este filtro' : 'Aún no hay pedidos'}</h3>
       <p>Cuando un cliente haga un pedido aparecerá aquí y sonará un aviso. Deja esta pantalla abierta.</p></div>`;
}

async function guardar(folio, cambios) {
  try {
    const r = await ctx.api('adminUpdateOrder', { folio, ...cambios });
    toast(`${folio}: ${ESTADOS[r.pedido.estado].nombre}`);
    editando = false;
    await cargar();
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function render(el, c, params) {
  main = el;
  ctx = c;
  // Desde Clientes se llega filtrando por teléfono; al volver desde el menú se limpia.
  if (params.q !== undefined) {
    filtro = { estado: 'TODOS', q: params.q };
    filtroDeEnlace = true;
  } else if (filtroDeEnlace) {
    filtro = { estado: 'ACTIVOS', q: '' };
    filtroDeEnlace = false;
  }
  main.innerHTML = `
    <div class="kpis" id="kpis"></div>
    <label class="search" style="margin-bottom:16px;max-width:none;background:#fff"><span aria-hidden="true">🔎</span><span class="sr-only">Buscar pedidos</span>
      <input type="search" id="pq" placeholder="Buscar por folio, nombre, teléfono o colonia" value="${esc(filtro.q)}"></label>
    <div id="plista"><div class="adm-loading">Cargando pedidos…</div></div>`;
  main.addEventListener('click', onClick);
  main.addEventListener('submit', onSubmit);
  main.addEventListener('toggle', onToggle, true);
  main.addEventListener('focusin', onFocus);
  main.addEventListener('focusout', onBlur);
  main.querySelector('#pq').addEventListener('input', debounce((e) => { filtro.q = e.target.value.trim(); cargar(); }, 350));
  await cargar();
}

export function salir() {
  if (!main) return;
  main.removeEventListener('click', onClick);
  main.removeEventListener('submit', onSubmit);
  main.removeEventListener('toggle', onToggle, true);
  main.removeEventListener('focusin', onFocus);
  main.removeEventListener('focusout', onBlur);
  main = null;
}

// Llegó un pedido: refrescar salvo que estén escribiendo una nota.
export function onNuevos() {
  if (main && !editando) cargar();
}

function onClick(e) {
  const k = e.target.closest('[data-estado]');
  if (k) {
    filtro.estado = k.dataset.estado;
    cargar();
    return;
  }
  const n = e.target.closest('[data-next]');
  if (n) {
    const f = n.closest('form');
    guardar(f.dataset.folio, { estado: n.dataset.next, nota_cliente: f.nota_cliente.value, nota_interna: f.nota_interna.value });
    return;
  }
  const pr = e.target.closest('[data-print]');
  if (pr) {
    const card = pr.closest('.order-card');
    card.classList.add('printing');
    window.print();
    setTimeout(() => card.classList.remove('printing'), 500);
  }
}

function onSubmit(e) {
  const f = e.target.closest('.estado-form');
  if (!f) return;
  e.preventDefault();
  guardar(f.dataset.folio, { estado: f.estado.value, nota_cliente: f.nota_cliente.value, nota_interna: f.nota_interna.value });
}

function onToggle(e) {
  const d = e.target;
  if (!d.matches || !d.matches('details[data-folio]')) return;
  if (d.open) abiertos.add(d.dataset.folio);
  else abiertos.delete(d.dataset.folio);
}

function onFocus(e) { if (e.target.closest('.estado-form')) editando = true; }
function onBlur(e) { if (e.target.closest('.estado-form')) editando = false; }
