// Páginas de catálogo: tienda, promociones, temporada y licores.
// La vista se elige con <body data-view="...">.
import { loadCatalog } from '../api.js';
import { renderChrome, setCatalog, productCard, skeletons, ageGate, isAdult, errorBox, categoriaTiles, negocioActual } from '../ui.js';
import { esc, qs, todayMX, prettyDate } from '../util.js';
import { buscar } from '../buscar.js';
import { iconoSvg } from '../icons.js';

const P = window.LunaPromos;
const view = document.body.dataset.view;
renderChrome(`${view}.html`);

const root = qs('#catalog');
root.innerHTML = `<div class="grid">${skeletons()}</div>`;

const params = new URLSearchParams(location.search);
const state = { cat: params.get('cat') || '', q: params.get('q') || '' };

// Agotados al final; luego el orden de la tienda.
const byOrder = (a, b) => (b.disponible - a.disponible) || (a.orden ?? 9999) - (b.orden ?? 9999) || a.nombre.localeCompare(b.nombre, 'es');

// Con miles de productos se pinta por partes: "Ver más" agrega la siguiente.
const PAGINA = 48;
const paginas = new Map();
let nGrid = 0;
// Al llegar datos frescos se repinta: se conservan los productos que ya se
// mostraron con "Ver más" para que la lista no se encoja de golpe.
let conservar = 0;
function grid(list, promos, paso = PAGINA) {
  const id = `g${++nGrid}`;
  const primero = Math.min(Math.max(paso, conservar), list.length);
  conservar = 0;
  paginas.set(id, { list, promos, paso, mostrados: primero });
  return `<div class="grid" data-g="${id}">${list.slice(0, primero).map((p) => productCard(p, promos)).join('')}</div>${botonMas(id)}`;
}
function botonMas(id) {
  const g = paginas.get(id);
  const resto = g.list.length - g.mostrados;
  return resto > 0 ? `<div class="more-wrap" data-more="${id}"><button class="btn secondary" type="button" data-mas="${id}">Ver más productos <span class="muted">(${resto.toLocaleString('es-MX')})</span></button></div>` : '';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mas]');
  const g = b && paginas.get(b.dataset.mas);
  if (!g) return;
  const el = document.querySelector(`.grid[data-g="${b.dataset.mas}"]`);
  const desde = g.mostrados;
  g.mostrados = Math.min(g.list.length, desde + g.paso);
  el.insertAdjacentHTML('beforeend', g.list.slice(desde, g.mostrados).map((p) => productCard(p, g.promos)).join(''));
  b.closest('.more-wrap').outerHTML = botonMas(b.dataset.mas);
  // Lleva el foco al primer producto nuevo para quien navega con teclado.
  const nuevo = el.children[desde] && el.children[desde].querySelector('a, button');
  if (nuevo) nuevo.focus({ preventScroll: true });
});

const n = (x) => x.toLocaleString('es-MX');
const productosTxt = (k) => `${n(k)} ${k === 1 ? 'producto' : 'productos'}`;

// Sin resultados: invitar a preguntar por WhatsApp con el texto ya escrito.
function sinResultados(q) {
  const wa = negocioActual().whatsapp;
  const pregunta = q ? `Hola, ¿tienen ${q}?` : 'Hola, busco un producto';
  return empty(q ? `No encontramos “${esc(q)}”` : 'Sin productos aquí',
    'Prueba con otra palabra (por ejemplo, la marca) o pregúntanos: seguro lo tenemos en mostrador.',
    wa ? `<a class="btn ask" href="https://wa.me/52${esc(wa)}?text=${encodeURIComponent(pregunta)}" target="_blank" rel="noopener">Preguntar por WhatsApp</a>` : '');
}

function empty(title, text, cta = '<a class="btn" href="tienda.html">Ver la tienda</a>') {
  return `<div class="empty"><h3>${title}</h3><p class="muted">${text}</p>${cta}</div>`;
}

function syncUrl() {
  const u = new URLSearchParams();
  if (state.cat) u.set('cat', state.cat);
  if (state.q) u.set('q', state.q);
  history.replaceState(null, '', location.pathname + (u.toString() ? `?${u}` : ''));
}

function renderFiltered(c, productos, { allLabel = 'Todo', extraChips = '', extraTiles = '', placeholder = 'Buscar: leche, yogurt, queso…', aviso = '' } = {}) {
  const conteo = new Map();
  productos.forEach((p) => conteo.set(p.categoria, (conteo.get(p.categoria) || 0) + 1));
  const cats = [...conteo.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  const destacados = productos.some((p) => p.destacado);
  // Con muchas categorías, la entrada a la tienda es un mosaico para explorar.
  const mosaico = cats.length > 6;
  if (state.cat && state.cat !== '__destacados' && !cats.includes(state.cat)) state.cat = '';
  const cuenta = (value) => (value === '' ? productos.length : value === '__destacados'
    ? productos.filter((p) => p.destacado).length : conteo.get(value) || 0);
  const chip = (value, label) => `<button class="chip" type="button" data-cat="${esc(value)}" aria-pressed="${state.cat === value}">${esc(label)}<span class="n">${n(cuenta(value))}</span></button>`;

  root.innerHTML = `${aviso}
    <div class="toolbar">
      <label class="search">
        <span aria-hidden="true">🔎</span>
        <span class="sr-only">Buscar productos</span>
        <input type="search" id="q" placeholder="${esc(placeholder)}" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="chips scroll" role="toolbar" aria-label="Categorías">
        ${chip('', allLabel)}
        ${destacados ? chip('__destacados', '★ Destacados') : ''}
        ${cats.map((x) => chip(x, x)).join('')}
        ${extraChips}
      </div>
    </div>
    <div id="browse"></div>
    <div class="results-head"><p class="muted small" id="count" aria-live="polite"></p></div>
    <div id="results"></div>`;

  const chips = root.querySelector('.chips');
  const marcarChip = () => {
    root.querySelectorAll('.chips .chip[data-cat]').forEach((x) => {
      const activo = x.dataset.cat === state.cat;
      x.setAttribute('aria-pressed', String(activo));
      // El chip elegido queda a la vista dentro del carrusel.
      if (activo) chips.scrollTo({ left: x.offsetLeft - chips.clientWidth / 2 + x.clientWidth / 2, behavior: 'smooth' });
    });
  };

  const paint = () => {
    paginas.clear();
    const filtrados = productos.filter((p) => {
      if (state.cat === '__destacados') return p.destacado;
      return !state.cat || p.categoria === state.cat;
    });
    const list = buscar(filtrados, state.q, byOrder);
    const explorar = mosaico && !state.cat && !state.q;
    qs('#browse').innerHTML = explorar ? `<section class="browse" aria-labelledby="h-cats">
        <div class="browse-head"><h2 id="h-cats">Explora por categoría</h2></div>
        <div class="cat-tiles">${categoriaTiles(cats.map((x) => [x, conteo.get(x)]).filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]))}${extraTiles}</div>
      </section>
      <div class="browse-head"><h2>Todos los productos</h2></div>` : '';
    const donde = state.cat === '__destacados' ? ' destacados' : state.cat ? ` en ${state.cat}` : '';
    qs('#count').innerHTML = state.q
      ? `${productosTxt(list.length)} para “${esc(state.q)}”${esc(donde)}`
      : `${productosTxt(list.length)}${esc(donde)}`;
    qs('#results').innerHTML = list.length ? grid(list, c.promociones) : sinResultados(state.q);
    syncUrl();
  };

  const subirAResultados = () => {
    const y = root.getBoundingClientRect().top + window.scrollY - 72;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' });
  };

  root.onclick = (e) => {
    const b = e.target.closest('.chip[data-cat], .cat-tile[data-cat]');
    if (!b) return;
    state.cat = b.dataset.cat;
    if (state.q) { state.q = ''; qs('#q').value = ''; }
    marcarChip();
    paint();
    subirAResultados();
  };
  let timer;
  qs('#q').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = e.target.value.trim();
      // Al buscar se busca en toda la tienda, no solo en la categoría elegida.
      if (state.q && state.cat) {
        state.cat = '';
        marcarChip();
      }
      paint();
    }, 150);
  };
  // "Buscar" en el teclado del celular: cierra el teclado para ver resultados.
  qs('#q').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
  paint();
  if (state.cat) marcarChip();
}

function renderTienda(c) {
  const productos = c.productos.filter((p) => !p.es_alcohol);
  const hayLicores = c.productos.some((p) => p.es_alcohol);
  const licores = c.productos.filter((p) => p.es_alcohol).length;
  renderFiltered(c, productos, {
    extraChips: hayLicores ? '<a class="chip" href="licores.html">🍷 Licores</a>' : '',
    extraTiles: hayLicores ? `<a class="cat-tile" href="licores.html"><span class="ic" style="background:#ece3cf">${iconoSvg('licor', 24)}</span>
      <span>Licores +18<small>${n(licores)} productos</small></span></a>` : ''
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
          ${grid(list, c.promociones, 24)}
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
  renderFiltered(c, productos, { allLabel: 'Todos', placeholder: 'Buscar: tequila, cerveza, vino…', aviso: legal });
}

const RENDER = { tienda: renderTienda, promociones: renderPromos, temporada: renderTemporada, licores: renderLicores };

function start() {
  let last = '';
  loadCatalog((c) => {
    setCatalog(c);
    // La segunda llamada trae datos frescos: solo repintar si cambió algo.
    const sig = JSON.stringify([c.productos, c.promociones, c.temporadas, c.config]);
    if (sig === last) return;
    const vista = [...paginas.values()][0];
    if (last && vista) conservar = vista.mostrados;
    last = sig;
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
