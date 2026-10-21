// Páginas de catálogo: tienda, promociones, temporada y licores.
// La vista se elige con <body data-view="...">.
import { loadCatalog } from '../api.js';
import { renderChrome, setCatalog, productCard, skeletons, ageGate, isAdult, errorBox } from '../ui.js';
import { esc, qs, todayMX, prettyDate } from '../util.js';

const P = window.LunaPromos;
const view = document.body.dataset.view;
renderChrome(`${view}.html`);

const root = qs('#catalog');
root.innerHTML = `<div class="grid">${skeletons()}</div>`;

const params = new URLSearchParams(location.search);
const state = { cat: params.get('cat') || '', q: params.get('q') || '' };

const byOrder = (a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || a.nombre.localeCompare(b.nombre, 'es');
const grid = (list, promos) => `<div class="grid">${list.map((p) => productCard(p, promos)).join('')}</div>`;

function empty(title, text, cta = '<a class="btn" href="tienda.html">Ver la tienda</a>') {
  return `<div class="empty"><h3>${title}</h3><p class="muted">${text}</p>${cta}</div>`;
}

function syncUrl() {
  const u = new URLSearchParams();
  if (state.cat) u.set('cat', state.cat);
  if (state.q) u.set('q', state.q);
  history.replaceState(null, '', location.pathname + (u.toString() ? `?${u}` : ''));
}

function renderFiltered(c, productos, { allLabel = 'Todo', extraChips = '' } = {}) {
  const cats = [...new Set(productos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es'));
  const destacados = productos.some((p) => p.destacado);
  if (state.cat && state.cat !== '__destacados' && !cats.includes(state.cat)) state.cat = '';
  const cuenta = (value) => (value === '' ? productos.length : value === '__destacados'
    ? productos.filter((p) => p.destacado).length : productos.filter((p) => p.categoria === value).length);
  const chip = (value, label) => `<button class="chip" type="button" data-cat="${esc(value)}" aria-pressed="${state.cat === value}">${esc(label)}<span class="n">${cuenta(value)}</span></button>`;

  root.innerHTML = `
    <div class="toolbar">
      <label class="search">
        <span aria-hidden="true">🔎</span>
        <span class="sr-only">Buscar productos</span>
        <input type="search" id="q" placeholder="Buscar: leche, yogurt, queso…" value="${esc(state.q)}" autocomplete="off">
      </label>
      <div class="chips scroll" role="toolbar" aria-label="Categorías">
        ${chip('', allLabel)}
        ${destacados ? chip('__destacados', '★ Destacados') : ''}
        ${cats.map((x) => chip(x, x)).join('')}
        ${extraChips}
      </div>
    </div>
    <p class="muted small" id="count" aria-live="polite"></p>
    <div id="results"></div>`;

  const paint = () => {
    const q = P.norm(state.q);
    const list = productos.filter((p) => {
      if (state.cat === '__destacados' && !p.destacado) return false;
      if (state.cat && state.cat !== '__destacados' && p.categoria !== state.cat) return false;
      return !q || P.norm(`${p.nombre} ${p.marca} ${p.categoria} ${p.presentacion}`).includes(q);
    }).sort(byOrder);
    qs('#count').textContent = `${list.length} ${list.length === 1 ? 'producto' : 'productos'}`;
    qs('#results').innerHTML = list.length
      ? grid(list, c.promociones)
      : empty('Sin resultados', 'No encontramos productos con ese filtro. Si no lo ves, pregúntanos por teléfono: seguro lo tenemos en tienda.', '');
    syncUrl();
  };

  root.onclick = (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b || !b.matches('.chip')) return;
    state.cat = b.dataset.cat;
    root.querySelectorAll('.chips .chip[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    paint();
  };
  let timer;
  qs('#q').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = e.target.value.trim();
      // Al buscar se busca en toda la tienda, no solo en la categoría elegida.
      if (state.q && state.cat) {
        state.cat = '';
        root.querySelectorAll('.chips .chip[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cat === '')));
      }
      paint();
    }, 150);
  };
  paint();
}

function renderTienda(c) {
  const productos = c.productos.filter((p) => !p.es_alcohol);
  const hayLicores = c.productos.some((p) => p.es_alcohol);
  renderFiltered(c, productos, {
    extraChips: hayLicores ? '<a class="chip" href="licores.html">🍷 Licores</a>' : ''
  });
}

function renderPromos(c) {
  const today = todayMX();
  const promos = c.promociones.filter((p) => P.isActive(p, today));
  if (!promos.length) {
    root.innerHTML = empty('Pronto tendremos promociones', 'Estamos preparando ofertas para ti. Mientras, arma tu pedido con lo de siempre.');
    return;
  }
  const visibles = c.productos.filter((p) => !p.es_alcohol || isAdult());
  root.innerHTML = `<div class="promo-grid">${promos.map((p) => `
      <article class="promo-card">
        <span class="big">${esc(P.label(p))}</span>
        <h3>${esc(p.titulo)}</h3>
        ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
        <span class="until">${p.fin ? `Válida hasta el ${esc(prettyDate(p.fin))}` : 'Vigente'}</span>
        <a href="#promo-${esc(p.id)}">Ver productos ↓</a>
      </article>`).join('')}</div>
    ${promos.map((p) => {
      const list = visibles.filter((x) => P.matches(p, x)).sort(byOrder);
      return list.length ? `<section class="section tight" id="promo-${esc(p.id)}">
          <div class="section-head"><div><p class="eyebrow">${esc(P.label(p))}</p><h2>${esc(p.titulo)}</h2></div></div>
          ${grid(list, c.promociones)}
        </section>` : '';
    }).join('')}
    <p class="muted small">Las promociones se aplican automáticamente en tu pedido. Por producto se aplica la mejor promoción disponible; no son acumulables. Sujetas a disponibilidad.</p>`;
}

function renderTemporada(c) {
  if (!c.temporadas.length) {
    root.innerHTML = empty('Pronto: productos de temporada', 'Aquí verás lo especial de cada fecha: Día de Muertos, posadas, Navidad, Cuaresma y más.');
    return;
  }
  root.innerHTML = c.temporadas.map((t) => {
    const list = c.productos.filter((p) => p.temporada === t.id).sort(byOrder);
    return `<section class="season" id="${esc(t.id)}">
      <div class="season-head">
        <div>
          <p class="eyebrow">De temporada${t.fin ? ` · hasta el ${esc(prettyDate(t.fin))}` : ''}</p>
          <h2>${esc(t.nombre)}</h2>
          ${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}
        </div>
      </div>
      ${list.length ? grid(list, c.promociones) : '<p class="wrap muted" style="padding-bottom:24px">Muy pronto agregaremos los productos de esta temporada.</p>'}
    </section>`;
  }).join('');
}

function renderLicores(c) {
  const aviso = (c.config && c.config.aviso_alcohol) || 'Venta exclusiva para mayores de 18 años.';
  const productos = c.productos.filter((p) => p.es_alcohol);
  const legal = `<div class="legal" role="note"><strong>+18</strong> · ${esc(aviso)}</div>`;
  if (!productos.length) {
    root.innerHTML = legal + empty('Lista de licores en preparación', 'Muy pronto podrás ver aquí cervezas, vinos y destilados. Pregúntanos por teléfono por lo que buscas.');
    return;
  }
  root.insertAdjacentHTML('beforebegin', legal);
  renderFiltered(c, productos, { allLabel: 'Todos' });
}

const RENDER = { tienda: renderTienda, promociones: renderPromos, temporada: renderTemporada, licores: renderLicores };

function start() {
  let last = '';
  loadCatalog((c) => {
    setCatalog(c);
    // La segunda llamada trae datos frescos: solo repintar si cambió algo.
    const sig = JSON.stringify([c.productos, c.promociones, c.temporadas, c.config]);
    if (sig === last) return;
    last = sig;
    document.querySelectorAll('.legal').forEach((el) => el.remove());
    root.onclick = null;
    RENDER[view](c);
  }).catch((e) => {
    root.innerHTML = errorBox(`No pudimos cargar el catálogo. ${e.message}`);
  });
}

if (view === 'licores' && !isAdult()) {
  ageGate(start, () => { location.href = 'index.html'; });
} else {
  start();
}
