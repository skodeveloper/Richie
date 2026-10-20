// Panel de la tienda: pedidos (cambiar estado, notas, contacto) y comentarios.
import { api, DEMO } from '../api.js';
import { renderChrome, toast, errorBox } from '../ui.js';
import { esc, money, qs, prettyDate, ESTADOS, flujoEstados } from '../util.js';

renderChrome('admin.html');

const TOKEN_KEY = 'luna_admin_token';
const root = qs('#admin');
let token = '';
let filtro = { estado: 'ACTIVOS', q: '' };
let tab = 'pedidos';
let conocidos = null;
let abiertos = new Set();
let timer = null;
const tituloBase = document.title;

try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { token = ''; }

function salir(msg) {
  token = '';
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* sin almacenamiento */ }
  clearTimeout(timer);
  renderLogin(msg);
}

async function llamar(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.message === 'SESION_EXPIRADA') {
      salir('Tu sesión expiró. Vuelve a entrar.');
      return null;
    }
    throw e;
  }
}

function renderLogin(msg = '') {
  root.innerHTML = `<div class="panel" style="max-width:420px;margin:40px auto">
    <h2 style="margin-bottom:6px">Panel de pedidos</h2>
    <p class="muted">Solo para el equipo de La Luna.${DEMO ? ' En modo demostración la contraseña es <b>demo</b>.' : ''}</p>
    <div id="login-msg">${msg ? errorBox(msg) : ''}</div>
    <form id="login" novalidate>
      <div class="field"><label for="pw">Contraseña</label>
        <input id="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn block" type="submit">Entrar</button>
    </form>
  </div>`;
  const f = qs('#login');
  qs('#pw').focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api.login(qs('#pw').value);
      token = r.token;
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch (err) { /* sin almacenamiento */ }
      renderShell();
    } catch (err) {
      qs('#login-msg').innerHTML = errorBox(err.message);
      btn.disabled = false;
    }
  });
}

function renderShell() {
  root.innerHTML = `
    <div class="admin-top">
      <div class="tabs" role="tablist">
        <button role="tab" type="button" data-tab="pedidos" aria-selected="${tab === 'pedidos'}">Pedidos</button>
        <button role="tab" type="button" data-tab="comentarios" aria-selected="${tab === 'comentarios'}">Comentarios</button>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn secondary small" type="button" data-refresh>Actualizar</button>
        <button class="btn secondary small" type="button" data-logout>Salir</button>
      </div>
    </div>
    <div id="view"></div>`;
  cargar();
}

async function cargar() {
  clearTimeout(timer);
  if (tab === 'pedidos') await cargarPedidos();
  else await cargarComentarios();
  if (token) timer = setTimeout(cargar, 30000);
}

// ---------- Pedidos ----------

function siguiente(p) {
  const flujo = flujoEstados(p.entrega);
  const i = flujo.indexOf(p.estado);
  return i >= 0 && i < flujo.length - 1 ? flujo[i + 1] : null;
}

function pedidoHtml(p, nuevo) {
  const tel = esc(p.telefono);
  const sig = siguiente(p);
  const dir = `${p.direccion}, ${p.colonia}, Ciudad de México`;
  return `<details class="order-card${nuevo ? ' is-new' : ''}" data-folio="${esc(p.folio)}" ${abiertos.has(p.folio) ? 'open' : ''}>
    <summary>
      <span class="folio-s">${esc(p.folio)}</span>
      <span class="who"><strong>${esc(p.nombre)}</strong> · ${money(p.total)}${p.precios_pendientes ? '*' : ''} · ${p.piezas} pzas
        ${p.entrega === 'recoger' ? ' · <b>Recoge</b>' : ` · ${esc(p.colonia)}`}${p.contiene_alcohol ? ' · <b>+18</b>' : ''}</span>
      <span class="st ${esc(p.estado)}">${esc(ESTADOS[p.estado] ? ESTADOS[p.estado].nombre : p.estado)}</span>
      <span class="when">${esc(prettyDate(p.fecha))}${p.actualizado && p.actualizado !== p.fecha ? ` · act. ${esc(prettyDate(p.actualizado))}` : ''}</span>
    </summary>
    <div class="inner">
      <div>
        <ul>${(p.productos || []).map((l) => `<li>${l.cantidad} × ${esc(l.nombre)}${l.presentacion ? ` (${esc(l.presentacion)})` : ''}
          ${l.promo ? ` <b style="color:#8a5a00">${esc(l.promo)}</b>` : ''} — ${l.total === null ? '<i>sin precio</i>' : money(l.total)}</li>`).join('')}</ul>
        <dl class="totals" style="margin-top:12px;max-width:320px">
          <dt>Subtotal</dt><dd>${money(p.subtotal)}</dd>
          ${Number(p.descuento) ? `<dt>Promociones</dt><dd>−${money(p.descuento)}</dd>` : ''}
          <dt>Envío</dt><dd>${p.entrega === 'recoger' ? '—' : money(p.envio)}</dd>
          <dt class="total">Total</dt><dd class="total">${money(p.total)}</dd>
        </dl>
        ${p.precios_pendientes ? '<p class="small muted">* Hay importes por confirmar con el cliente.</p>' : ''}
      </div>
      <div>
        <p style="margin-top:0"><strong>${esc(p.nombre)}</strong><br>☎ ${tel}${p.email ? `<br>✉ ${esc(p.email)}` : ''}</p>
        <div class="contact-links">
          <a class="btn small" href="tel:+52${tel}">Llamar</a>
          <a class="btn small secondary" href="https://wa.me/52${tel}?text=${encodeURIComponent(`Hola ${p.nombre}, te escribimos de Abarrotes La Luna sobre tu pedido ${p.folio}.`)}" target="_blank" rel="noopener">WhatsApp</a>
          ${p.entrega === 'domicilio' ? `<a class="btn small secondary" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}" target="_blank" rel="noopener">Mapa</a>` : ''}
        </div>
        <p class="small">${p.entrega === 'recoger' ? '<b>Pasa a recoger</b>' : `<b>Entrega:</b> ${esc(p.direccion)}, ${esc(p.colonia)}${p.referencias ? `<br><b>Ref.:</b> ${esc(p.referencias)}` : ''}`}
          <br><b>Pago:</b> ${esc(p.pago)}${p.paga_con ? ` · paga con ${money(p.paga_con)}` : ''}
          ${p.notas ? `<br><b>Notas:</b> ${esc(p.notas)}` : ''}</p>
        <form class="estado-form" data-folio="${esc(p.folio)}">
          <div class="field"><label>Estado</label>
            <select name="estado">${Object.keys(ESTADOS).map((e) => `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${ESTADOS[e].nombre}</option>`).join('')}</select></div>
          <div class="field"><label>Mensaje para el cliente (se ve en el seguimiento)</label>
            <input name="nota_cliente" maxlength="300" value="${esc(p.nota_cliente || '')}" placeholder="Ej. No hubo Lala Light, enviamos Deslactosada"></div>
          <div class="field"><label>Nota interna</label>
            <input name="nota_interna" maxlength="500" value="${esc(p.nota_interna || '')}" placeholder="Solo la ve la tienda"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn small" type="submit">Guardar</button>
            ${sig ? `<button class="btn small gold" type="button" data-next="${sig}">Marcar: ${esc(ESTADOS[sig].nombre)}</button>` : ''}
          </div>
        </form>
      </div>
    </div>
  </details>`;
}

async function cargarPedidos() {
  const view = qs('#view');
  if (!view) return;
  let r;
  try {
    r = await llamar(() => api.adminOrders(token, filtro));
  } catch (e) {
    view.innerHTML = errorBox(e.message);
    return;
  }
  if (!r) return;
  const folios = new Set(r.pedidos.map((p) => p.folio));
  const nuevos = conocidos ? [...folios].filter((f) => !conocidos.has(f)) : [];
  if (conocidos && nuevos.length) {
    toast(`🛒 ${nuevos.length} pedido(s) nuevo(s)`);
    beep();
  }
  conocidos = new Set([...(conocidos || []), ...folios]);
  const recibidos = r.resumen.RECIBIDO || 0;
  document.title = recibidos ? `(${recibidos}) ${tituloBase}` : tituloBase;

  const activos = Object.entries(r.resumen).filter(([e]) => !['ENTREGADO', 'CANCELADO'].includes(e)).reduce((a, [, n]) => a + n, 0);
  const kpi = (estado, label, n) => `<button class="kpi" type="button" data-estado="${estado}" aria-pressed="${filtro.estado === estado}"><strong>${n}</strong><span>${label}</span></button>`;
  view.innerHTML = `
    <div class="kpis">
      ${kpi('ACTIVOS', 'Activos', activos)}
      ${kpi('RECIBIDO', 'Nuevos', recibidos)}
      ${['CONFIRMADO', 'PREPARANDO', 'EN_CAMINO', 'LISTO_RECOGER', 'ENTREGADO', 'CANCELADO'].map((e) => kpi(e, ESTADOS[e].nombre, r.resumen[e] || 0)).join('')}
      ${kpi('TODOS', `Todos · hoy ${r.hoy}`, Object.values(r.resumen).reduce((a, b) => a + b, 0))}
    </div>
    <label class="search" style="margin-bottom:16px"><span aria-hidden="true">🔎</span><span class="sr-only">Buscar pedidos</span>
      <input type="search" id="admin-q" placeholder="Folio, nombre, teléfono o colonia" value="${esc(filtro.q)}"></label>
    ${r.pedidos.length ? r.pedidos.map((p) => pedidoHtml(p, nuevos.includes(p.folio) || p.estado === 'RECIBIDO')).join('')
      : '<div class="empty"><h3>No hay pedidos aquí</h3><p class="muted">Cuando llegue uno lo verás en esta lista (se actualiza cada 30 segundos).</p></div>'}`;
}

async function guardarEstado(folio, cambios) {
  try {
    const r = await llamar(() => api.adminUpdateOrder(token, { folio, ...cambios }));
    if (!r) return;
    toast(`${folio}: ${ESTADOS[r.pedido.estado].nombre}`);
    cargar();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch (e) { /* sin audio */ }
}

// ---------- Comentarios ----------

async function cargarComentarios() {
  const view = qs('#view');
  if (!view) return;
  let r;
  try {
    r = await llamar(() => api.adminComments(token));
  } catch (e) {
    view.innerHTML = errorBox(e.message);
    return;
  }
  if (!r) return;
  view.innerHTML = r.comentarios.length ? r.comentarios.map((c) => `
    <article class="review" style="margin-bottom:12px" data-id="${esc(c.id)}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <span class="stars">${'★'.repeat(Number(c.calificacion) || 0)}</span>
        <span class="st ${c.estado === 'APROBADO' ? 'ENTREGADO' : c.estado === 'OCULTO' ? 'CANCELADO' : 'RECIBIDO'}">${esc(c.estado)}</span>
      </div>
      <p>${esc(c.comentario)}</p>
      <div class="who">${esc(c.nombre)} · ${esc(prettyDate(c.fecha))}${c.folio ? ` · ${esc(c.folio)}` : ''}${c.publicable ? '' : ' · <b>Privado (no publicar)</b>'}</div>
      <div class="field" style="margin-top:12px"><label>Respuesta pública (opcional)</label><input name="respuesta" maxlength="400" value="${esc(c.respuesta || '')}"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${c.publicable ? '<button class="btn small" type="button" data-mod="APROBADO">Publicar</button>' : ''}
        <button class="btn small secondary" type="button" data-mod="OCULTO">Ocultar</button>
        <button class="btn small secondary" type="button" data-mod="PENDIENTE">Pendiente</button>
      </div>
    </article>`).join('') : '<div class="empty"><h3>Sin comentarios todavía</h3></div>';
}

// ---------- Eventos ----------

root.addEventListener('click', async (e) => {
  const t = e.target;
  const tb = t.closest('[data-tab]');
  if (tb) {
    tab = tb.dataset.tab;
    renderShell();
    return;
  }
  if (t.closest('[data-logout]')) {
    api.logout(token).catch(() => {});
    salir();
    return;
  }
  if (t.closest('[data-refresh]')) {
    cargar();
    return;
  }
  const k = t.closest('[data-estado]');
  if (k) {
    filtro.estado = k.dataset.estado;
    cargar();
    return;
  }
  const n = t.closest('[data-next]');
  if (n) {
    const form = n.closest('form');
    guardarEstado(form.dataset.folio, { estado: n.dataset.next, nota_cliente: form.nota_cliente.value, nota_interna: form.nota_interna.value });
    return;
  }
  const m = t.closest('[data-mod]');
  if (m) {
    const card = m.closest('[data-id]');
    try {
      const r = await llamar(() => api.adminModerateComment(token, { id: card.dataset.id, estado: m.dataset.mod, respuesta: card.querySelector('[name=respuesta]').value }));
      if (r) { toast('Comentario actualizado'); cargar(); }
    } catch (err) {
      toast(err.message, 'error');
    }
  }
});

root.addEventListener('submit', (e) => {
  const form = e.target.closest('.estado-form');
  if (!form) return;
  e.preventDefault();
  guardarEstado(form.dataset.folio, { estado: form.estado.value, nota_cliente: form.nota_cliente.value, nota_interna: form.nota_interna.value });
});

root.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d.matches || !d.matches('details[data-folio]')) return;
  if (d.open) abiertos.add(d.dataset.folio);
  else abiertos.delete(d.dataset.folio);
}, true);

let qTimer;
root.addEventListener('input', (e) => {
  if (e.target.id !== 'admin-q') return;
  clearTimeout(qTimer);
  qTimer = setTimeout(async () => {
    filtro.q = e.target.value.trim();
    await cargar();
    const q = qs('#admin-q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }, 400);
});

// No refrescar mientras se edita un formulario para no borrar lo escrito.
root.addEventListener('focusin', (e) => {
  if (e.target.closest('.estado-form, .review')) clearTimeout(timer);
});
root.addEventListener('focusout', (e) => {
  if (e.target.closest('.estado-form, .review') && token) {
    clearTimeout(timer);
    timer = setTimeout(cargar, 30000);
  }
});

if (token) renderShell();
else renderLogin();
