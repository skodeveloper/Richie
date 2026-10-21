// Panel de la tienda: sesión, menú, navegación y aviso de pedidos nuevos.
// Cada sección vive en su propio módulo (pedidos.js, productos.js, ...).
import { api, DEMO } from '../api.js';
import { esc } from '../util.js';
import { icon, toast } from './ui.js';
import * as pedidos from './pedidos.js';
import * as productos from './productos.js';
import * as promociones from './promociones.js';
import * as temporadas from './temporadas.js';
import * as opiniones from './opiniones.js';
import * as clientes from './clientes.js';
import * as ajustes from './ajustes.js';

const VISTAS = { pedidos, productos, promociones, temporadas, opiniones, clientes, ajustes };
const TITULOS = {
  pedidos: 'Pedidos', productos: 'Productos', promociones: 'Promociones', temporadas: 'Temporadas',
  opiniones: 'Opiniones', clientes: 'Clientes', ajustes: 'Ajustes'
};
const TOKEN_KEY = 'luna_admin_token';
const app = document.getElementById('app');
const tituloBase = document.title;

let token = '';
let vista = null;
let pollTimer = null;
let conocidos = null;
let catalogoPromise = null;
const badges = { pedidos: 0, opiniones: 0 };

try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { token = ''; }

function guardarToken(t) {
  token = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* sin almacenamiento */ }
}

// ---------- Contexto que reciben las secciones ----------

const ctx = {
  demo: DEMO,
  async api(metodo, datos) {
    try {
      return await api[metodo](token, datos);
    } catch (e) {
      if (e.message === 'SESION_EXPIRADA') {
        salir('Tu sesión expiró. Vuelve a entrar.');
        throw new Error('Tu sesión expiró.');
      }
      throw e;
    }
  },
  catalogo(forzar = false) {
    if (forzar || !catalogoPromise) {
      catalogoPromise = ctx.api('adminCatalog').catch((e) => { catalogoPromise = null; throw e; });
    }
    return catalogoPromise;
  },
  ir(nombre, params = {}) {
    const q = new URLSearchParams(params).toString();
    location.hash = `#${nombre}${q ? `?${q}` : ''}`;
  },
  setBadge(nombre, n) {
    badges[nombre] = n;
    document.querySelectorAll(`[data-badge="${nombre}"]`).forEach((el) => {
      el.textContent = n;
      el.hidden = !n;
    });
    if (nombre === 'pedidos') document.title = n ? `(${n}) ${tituloBase}` : tituloBase;
  },
  actualizarEstadoTienda
};

// ---------- Acceso ----------

function salir(msg = '') {
  clearInterval(pollTimer);
  if (vista && vista.salir) vista.salir();
  vista = null;
  conocidos = null;
  catalogoPromise = null;
  if (token) api.logout(token).catch(() => {});
  guardarToken('');
  renderLogin(msg);
}

function renderLogin(msg = '') {
  document.body.style.overflow = '';
  app.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px;background:var(--green)">
    <form class="adm-card" id="login" style="width:100%;max-width:400px;padding:30px" novalidate>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><span class="moon" aria-hidden="true"></span>
        <div><small class="eyebrow" style="margin:0">Abarrotes La Luna</small><h1 style="font-size:28px">Panel de la tienda</h1></div></div>
      ${DEMO ? '<div class="hint-box">Modo demostración: la contraseña es <b>demo</b>.</div>' : ''}
      <div id="login-msg" aria-live="polite">${msg ? `<div class="alert error">${esc(msg)}</div>` : ''}</div>
      <div class="field"><label for="pw">Contraseña</label>
        <input id="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn block" type="submit">Entrar</button>
      <p class="small muted" style="margin:16px 0 0;text-align:center"><a href="index.html">← Volver al sitio</a></p>
    </form></div>`;
  const f = document.getElementById('login');
  const pw = document.getElementById('pw');
  pw.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const r = await api.login(pw.value);
      guardarToken(r.token);
      renderShell();
    } catch (err) {
      document.getElementById('login-msg').innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'Entrar';
      pw.select();
    }
  });
}

// ---------- Estructura ----------

function navBtn(nombre, conBadge = true) {
  return `<button type="button" data-ir="${nombre}">${icon(nombre)}<span>${TITULOS[nombre]}</span>
    ${conBadge && badges[nombre] !== undefined ? `<span class="count" data-badge="${nombre}" hidden>0</span>` : ''}</button>`;
}

function renderShell() {
  app.innerHTML = `<div class="adm">
    <aside class="adm-side" id="side" aria-label="Secciones">
      <div class="adm-brand"><span class="moon" aria-hidden="true"></span><span><small>ABARROTES</small>La Luna · Panel</span></div>
      <nav class="adm-nav">${Object.keys(VISTAS).map((n) => navBtn(n)).join('')}</nav>
      <div class="adm-side-foot">
        ${DEMO ? '<span class="small">Modo demostración</span>' : ''}
        <a href="index.html" target="_blank" rel="noopener">${icon('sitio')}<span>Ver mi sitio</span></a>
        <button type="button" data-salir>${icon('salir')}<span>Salir</span></button>
      </div>
    </aside>
    <div class="adm-main">
      <header class="adm-top"><div class="in">
        <button class="adm-menu" type="button" aria-label="Menú" aria-controls="side" aria-expanded="false" data-menu>☰</button>
        <h1 id="adm-title" tabindex="-1">Pedidos</h1>
        <button class="pill" type="button" id="estado-tienda" data-ir="ajustes" style="border:0;cursor:pointer" hidden></button>
      </div></header>
      <main class="adm-body" id="adm-main"></main>
    </div>
    <nav class="adm-bottom" aria-label="Secciones principales">
      ${['pedidos', 'productos', 'promociones', 'opiniones'].map((n) => `<button type="button" data-ir="${n}">${icon(n)}<span>${TITULOS[n]}</span>
        ${badges[n] !== undefined ? `<span class="count" data-badge="${n}" hidden>0</span>` : ''}</button>`).join('')}
      <button type="button" data-menu>${icon('mas')}<span>Más</span></button>
    </nav>
  </div>`;
  Object.entries(badges).forEach(([k, v]) => ctx.setBadge(k, v));
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  route();
  iniciarPoll();
  actualizarEstadoTienda();
  ctx.api('adminComments').then((r) => ctx.setBadge('opiniones', r.comentarios.filter((c) => c.estado === 'PENDIENTE').length)).catch(() => {});
}

async function actualizarEstadoTienda() {
  const el = document.getElementById('estado-tienda');
  if (!el) return;
  try {
    const c = await ctx.catalogo();
    const activos = c.config.pedidos_activos === '' || /^s/i.test(String(c.config.pedidos_activos));
    el.className = `pill ${activos ? 'ok' : 'off'}`;
    el.textContent = activos ? 'Recibiendo pedidos' : 'Pedidos pausados';
    el.title = 'Cambiar en Ajustes';
    el.hidden = false;
  } catch (e) { /* se reintenta al navegar */ }
}

function cerrarMenu() {
  const side = document.getElementById('side');
  if (!side) return;
  side.classList.remove('open');
  document.querySelectorAll('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

async function route() {
  const [nombre, query] = (location.hash.slice(1) || 'pedidos').split('?');
  const actual = VISTAS[nombre] ? nombre : 'pedidos';
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (vista && vista.salir) vista.salir();
  vista = VISTAS[actual];
  cerrarMenu();
  document.querySelectorAll('[data-ir]').forEach((b) => {
    if (b.id === 'estado-tienda') return;
    if (b.dataset.ir === actual) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const titulo = document.getElementById('adm-title');
  titulo.textContent = TITULOS[actual];
  // Contenedor nuevo en cada sección: así no se acumulan escuchas de eventos.
  const viejo = document.getElementById('adm-main');
  const main = viejo.cloneNode(false);
  viejo.replaceWith(main);
  main.innerHTML = '<div class="adm-loading">Cargando…</div>';
  window.scrollTo(0, 0);
  try {
    await vista.render(main, ctx, params);
  } catch (e) {
    if (!token) return;
    main.innerHTML = `<div class="alert error">${esc(e.message)}</div>
      <button class="btn secondary" type="button" data-reintentar>Reintentar</button>`;
    main.querySelector('[data-reintentar]').addEventListener('click', route);
  }
}

// ---------- Pedidos nuevos ----------

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, a.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + 0.15);
      o.start(a.currentTime + t);
      o.stop(a.currentTime + t + 0.16);
    });
  } catch (e) { /* sin audio */ }
}

async function revisarPedidos() {
  try {
    const r = await ctx.api('adminOrders', { estado: 'ACTIVOS' });
    const folios = r.pedidos.map((p) => p.folio);
    const nuevos = conocidos ? folios.filter((f) => !conocidos.has(f)) : [];
    conocidos = new Set([...(conocidos || []), ...folios]);
    ctx.setBadge('pedidos', r.resumen.RECIBIDO || 0);
    if (nuevos.length) {
      toast(`🛒 ${nuevos.length === 1 ? 'Llegó un pedido nuevo' : `Llegaron ${nuevos.length} pedidos nuevos`}`);
      beep();
      if (vista && vista.onNuevos) vista.onNuevos(nuevos);
    }
  } catch (e) { /* sin conexión: se reintenta */ }
}

function iniciarPoll() {
  clearInterval(pollTimer);
  revisarPedidos();
  pollTimer = setInterval(() => { if (!document.hidden) revisarPedidos(); }, 30000);
}

// ---------- Eventos globales ----------

app.addEventListener('click', (e) => {
  const ir = e.target.closest('[data-ir]');
  if (ir) {
    ctx.ir(ir.dataset.ir);
    return;
  }
  if (e.target.closest('[data-menu]')) {
    const side = document.getElementById('side');
    const abierto = side.classList.toggle('open');
    document.querySelectorAll('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', String(abierto)));
    return;
  }
  if (e.target.closest('[data-salir]')) {
    salir();
    return;
  }
  const side = document.getElementById('side');
  if (side && side.classList.contains('open') && !e.target.closest('#side')) cerrarMenu();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && token) revisarPedidos(); });

if (token) renderShell();
else renderLogin();
