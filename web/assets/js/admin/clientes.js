// Sección Clientes: el CRM de la tienda (se llena solo con cada pedido).
import { esc, money, prettyDate } from '../util.js';
import { debounce } from './ui.js';

let main;
let ctx;

function pintar(r) {
  const c = r.clientes;
  const recurrentes = c.filter((x) => x.pedidos > 1).length;
  const pedidos = c.reduce((a, x) => a + x.pedidos, 0);
  const total = c.reduce((a, x) => a + x.total_acumulado, 0);
  main.querySelector('#ckpi').innerHTML = `
    <div class="kpi"><strong>${r.total}</strong><span>Clientes</span></div>
    <div class="kpi"><strong>${recurrentes}</strong><span>Compraron 2+ veces</span></div>
    <div class="kpi"><strong>${pedidos}</strong><span>Pedidos en total</span></div>
    <div class="kpi"><strong>${pedidos ? money(total / pedidos) : '—'}</strong><span>Ticket promedio</span></div>`;
  main.querySelector('#clist').innerHTML = c.length ? `<table class="ctable">
    <thead><tr><th>Cliente</th><th>Colonia</th><th class="num">Pedidos</th><th class="num">Total</th><th>Último pedido</th><th></th></tr></thead>
    <tbody>${c.map((x) => `<tr>
      <td><strong>${esc(x.nombre)}</strong><br><span class="small muted">${esc(x.telefono)}${x.email ? ` · ${esc(x.email)}` : ''}</span></td>
      <td>${esc(x.colonia || '—')}</td>
      <td class="num">${x.pedidos}${x.pedidos > 1 ? ' <span class="pill ok plain" style="padding:2px 7px">frecuente</span>' : ''}</td>
      <td class="num">${money(x.total_acumulado)}</td>
      <td>${esc(prettyDate(x.ultimo_pedido))}<br><span class="small muted">${esc(x.ultimo_folio)}</span></td>
      <td><div class="acts">
        <a class="btn small secondary" href="tel:+52${esc(x.telefono)}">Llamar</a>
        <a class="btn small secondary" href="https://wa.me/52${esc(x.telefono)}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn small secondary" type="button" data-ver="${esc(x.telefono)}">Pedidos</button>
      </div></td></tr>`).join('')}</tbody></table>`
    : '<div class="adm-empty"><h3>Aún no hay clientes</h3><p>Cada persona que haga un pedido se agrega aquí automáticamente, con su historial.</p></div>';
}

async function cargar(q = '') {
  try {
    pintar(await ctx.api('adminClients', { q }));
  } catch (e) {
    main.querySelector('#clist').innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
  }
}

function onClick(e) {
  const v = e.target.closest('[data-ver]');
  if (v) ctx.ir('pedidos', { q: v.dataset.ver });
}

export async function render(el, c) {
  main = el;
  ctx = c;
  main.innerHTML = `<div class="kpi-row" id="ckpi"></div>
    <label class="search" style="margin-bottom:14px;max-width:none;background:#fff"><span aria-hidden="true">🔎</span><span class="sr-only">Buscar clientes</span>
      <input type="search" id="cq" placeholder="Buscar por nombre, teléfono, colonia o correo"></label>
    <div id="clist"><div class="adm-loading">Cargando…</div></div>`;
  main.querySelector('#cq').addEventListener('input', debounce((e) => cargar(e.target.value.trim()), 300));
  main.addEventListener('click', onClick);
  await cargar();
}

export function salir() {
  if (main) main.removeEventListener('click', onClick);
  main = null;
}
