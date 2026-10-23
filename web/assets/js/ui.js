// Piezas de interfaz comunes: encabezado, pie, barra del carrito, tarjetas de
// producto, avisos y verificación de edad.
import { esc, money, todayMX, qs, qsa, safeUrl, negocio, estadoTienda, cantidadTexto } from './util.js';
import { cart } from './cart.js';
import { DEMO } from './api.js';
import { iconoCategoria, iconoSvg, tinte } from './icons.js';

const P = window.LunaPromos;

const NAV = [
  ['index.html', 'Inicio'],
  ['tienda.html', 'Tienda'],
  ['promociones.html', 'Promociones'],
  ['temporada.html', 'Temporada'],
  ['licores.html', 'Licores'],
  ['seguimiento.html', 'Seguir pedido'],
  ['comentarios.html', 'Opiniones']
];

let catalogo = null;
let relojTimer = null;

// Datos de la tienda vigentes (los del panel, cuando ya cargó el catálogo).
export const negocioActual = () => negocio((catalogo && catalogo.config) || {});

function footerHtml(N) {
  return `
    <div class="wrap">
      <div class="cols">
        <div>
          <h4>${esc(N.nombre)}</h4>
          <p>${esc(N.direccion)}</p>
          <a href="${esc(N.mapa)}" target="_blank" rel="noopener">Cómo llegar ↗</a>
        </div>
        <div>
          <h4>Horario</h4>
          ${N.horario.map((h) => `<p style="margin:0 0 6px">${esc(h.dias)}: ${esc(h.horas)}</p>`).join('')}
          <p class="small" style="opacity:.8">Mostrador y servicio a domicilio.</p>
        </div>
        <div>
          <h4>Contacto</h4>
          ${N.telefonos.map((t) => `<a href="tel:${esc(t.tel)}">☎ ${esc(t.texto)}</a>`).join('')}
          ${N.whatsapp ? `<a href="https://wa.me/52${esc(N.whatsapp)}" target="_blank" rel="noopener">WhatsApp ↗</a>` : ''}
          <a href="seguimiento.html">Seguir mi pedido</a>
          <a href="comentarios.html">Déjanos tu opinión</a>
        </div>
      </div>
      <div class="legal-line">
        <span>© ${new Date().getFullYear()} ${esc(N.nombre)} · ${esc(N.lema)}</span>
        <span>Sitio desarrollado por <a href="https://skodev.com" target="_blank" rel="noopener">Skodev</a></span>
      </div>
    </div>`;
}

function pintarEstado() {
  const e = estadoTienda((catalogo && catalogo.config) || {});
  qsa('[data-open-pill]').forEach((el) => {
    el.textContent = e.texto;
    el.classList.toggle('closed', !e.abierto);
    el.hidden = false;
  });
}

export function renderChrome(active) {
  const N = negocio({});
  const header = document.createElement('div');
  header.innerHTML = `
    ${DEMO ? `<div class="topbar demo" role="note">Modo demostración: precios, licores, temporada y promociones son de <b>ejemplo</b>. Los pedidos se guardan solo en este navegador.</div>` : ''}
    <div class="topbar" id="aviso" hidden></div>
    <div class="topbar" id="edit-bar" hidden></div>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="index.html" aria-label="${esc(N.nombre)}, inicio">
          <span class="moon" aria-hidden="true"></span>
          <span><small>ABARROTES</small>LA LUNA</span>
        </a>
        <span class="open-pill" data-open-pill hidden></span>
        <nav class="nav" id="nav" aria-label="Principal">
          <span class="open-pill nav-only" data-open-pill hidden></span>
          ${NAV.map(([href, label]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
        </nav>
        <a class="cart-btn" href="pedido.html" aria-label="Ver mi carrito">
          <span aria-hidden="true">🛒</span><span class="label">Carrito</span><span class="count" data-cart-count>0</span>
        </a>
        <button class="menu-btn" type="button" aria-controls="nav" aria-expanded="false" aria-label="Abrir menú"><span></span></button>
      </div>
    </header>`;
  document.body.prepend(...header.children);

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.id = 'site-footer';
  footer.innerHTML = footerHtml(N);
  document.body.append(footer);

  const wa = document.createElement('a');
  wa.className = 'wa-fab';
  wa.id = 'wa-fab';
  wa.target = '_blank';
  wa.rel = 'noopener';
  wa.hidden = true;
  wa.setAttribute('aria-label', 'Escríbenos por WhatsApp');
  wa.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>';
  if (active !== 'admin.html') document.body.append(wa);

  const bar = document.createElement('a');
  bar.className = 'cart-bar';
  bar.href = 'pedido.html';
  bar.id = 'cart-bar';
  bar.innerHTML = '<span class="sum"></span><span class="go">Ver carrito →</span>';
  if (active !== 'pedido.html' && active !== 'admin.html') document.body.append(bar);

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  toastEl.id = 'toast';
  document.body.append(toastEl);

  const btn = qs('.menu-btn');
  const nav = qs('#nav');
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });

  window.addEventListener(cart.EVENT, refreshCart);
  refreshCart();
  pintarEstado();
  clearInterval(relojTimer);
  relojTimer = setInterval(pintarEstado, 60000);
}

export function setCatalog(c) {
  catalogo = c;
  const cfg = c.config || {};
  const aviso = qs('#aviso');
  if (aviso) {
    aviso.textContent = cfg.aviso_general || '';
    aviso.hidden = !cfg.aviso_general;
  }
  const N = negocio(cfg);
  const footer = qs('#site-footer');
  if (footer) footer.innerHTML = footerHtml(N);
  const wa = qs('#wa-fab');
  if (wa) {
    wa.hidden = !N.whatsapp;
    wa.href = N.whatsapp ? `https://wa.me/52${N.whatsapp}?text=${encodeURIComponent('Hola, tengo una pregunta sobre la tienda.')}` : '#';
  }
  pintarEstado();
  refreshCart();
}

export const getCatalog = () => catalogo;

export function productsById(c = catalogo) {
  return Object.fromEntries((c ? c.productos : []).map((p) => [p.id, p]));
}

export function quoteCart(entrega) {
  if (!catalogo) return null;
  const cfg = catalogo.config || {};
  return P.quote(cart.items(), productsById(), catalogo.promociones, {
    today: todayMX(), entrega, envioCosto: cfg.envio_costo, envioGratisDesde: cfg.envio_gratis_desde
  });
}

function refreshCart() {
  const n = cart.count();
  const ed = cart.editing();
  const editBar = qs('#edit-bar');
  if (editBar) {
    editBar.hidden = !ed;
    editBar.innerHTML = ed ? `Estás agregando productos a tu pedido <b>${esc(ed.folio)}</b>. <a href="pedido.html">Revisar y guardar cambios →</a>` : '';
  }
  qsa('[data-cart-count]').forEach((el) => { el.textContent = n; });
  const bar = qs('#cart-bar');
  if (bar) {
    const q = quoteCart();
    let total = '';
    if (q && !q.preciosPendientes) total = money(q.total);
    else if (q && q.subtotal > 0) total = `${money(q.total)} + precios por confirmar`;
    else if (q) total = 'Precios por confirmar';
    bar.querySelector('.sum').innerHTML = `<strong>${n} ${n === 1 ? 'producto' : 'productos'}</strong>${esc(total)}`;
    bar.classList.toggle('show', n > 0);
    document.body.classList.toggle('has-cart-bar', n > 0);
  }
  qsa('.card[data-id]').forEach((card) => {
    const actions = card.querySelector('.actions');
    if (actions) actions.innerHTML = actionsHtml(card.dataset.id, card.dataset.available !== '0', card.dataset.name, card.dataset.unidad);
    card.classList.toggle('in-cart', cart.qty(card.dataset.id) > 0);
  });
}

// ---------- Tarjetas de producto ----------

function actionsHtml(id, available, name, unidad = '') {
  if (!available) return '<button class="btn secondary small block" disabled>Agotado</button>';
  const q = cart.qty(id);
  const kg = unidad === 'kg';
  if (!q) return `<button class="btn small block" type="button" data-add="${esc(id)}" aria-label="Agregar ${esc(name)}">${kg ? 'Agregar ½ kg' : 'Agregar'}</button>`;
  return `<div class="qty${kg ? ' kg' : ''}" role="group" aria-label="Cantidad de ${esc(name)}">
    <button type="button" data-dec="${esc(id)}" aria-label="${kg ? 'Quitar ¼ kg' : 'Quitar uno'}">−</button>
    <output aria-live="polite">${kg ? esc(cantidadTexto({ cantidad: q, unidad })) : q}</output>
    <button type="button" data-inc="${esc(id)}" aria-label="${kg ? 'Agregar ¼ kg' : 'Agregar uno'}">+</button>
  </div>`;
}

// Granel: el primer toque agrega ½ kg y cada +/− cambia ¼ kg.
const pasoDe = (p) => (P.esGranel(p) ? P.PASO_KG : 1);
const inicialDe = (p) => (P.esGranel(p) ? 0.5 : 1);

export function productCard(p, promos, today = todayMX()) {
  const { promo } = P.bestPromo(p, promos, today, 1);
  const kg = P.esGranel(p);
  const porKg = kg ? '<span class="per">/kg</span>' : '';
  let priceHtml;
  if (p.precio === null || p.precio === undefined) {
    priceHtml = '<span class="tbd">Precio por confirmar</span>';
  } else {
    const d = promo && promo.tipo !== 'NXM' ? P.lineDiscount(promo, p.precio, 1) : 0;
    priceHtml = d > 0
      ? `<strong>${money(p.precio - d)}${porKg}</strong><s>${money(p.precio)}</s>`
      : `<strong>${money(p.precio)}${porKg}</strong>`;
  }
  const img = safeUrl(p.imagen) || (DEMO && /^data:image\//.test(p.imagen || '') ? p.imagen : '');
  const icono = iconoCategoria(p.categoria, p.nombre);
  const tags = [
    promo ? `<span class="badge">${esc(P.label(promo))}</span>` : '',
    p.es_alcohol ? '<span class="badge dark">+18</span>' : '',
    !p.disponible ? '<span class="badge red">Agotado</span>' : ''
  ].join('');
  // Las etiquetas van en el cuerpo: sobre la foto en cuadrícula y arriba del
  // nombre en la lista del celular.
  return `<article class="card${p.disponible ? '' : ' out'}${img ? '' : ' noimg'}${cart.qty(p.id) ? ' in-cart' : ''}" data-id="${esc(p.id)}" data-name="${esc(p.nombre)}" data-available="${p.disponible ? 1 : 0}" data-unidad="${kg ? 'kg' : ''}">
    <div class="thumb mini" style="background:${tinte(p.categoria)}" data-icono="${icono}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : iconoSvg(icono, 56)}
    </div>
    <div class="body">
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      ${p.marca ? `<span class="brand-name">${esc(p.marca)}</span>` : ''}
      <h3>${esc(p.nombre)}</h3>
      ${p.presentacion || kg ? `<span class="pres">${esc(p.presentacion || '')}${kg ? `${p.presentacion ? ' · ' : ''}A granel, por kilo` : ''}</span>` : ''}
      ${promo ? `<span class="promo-line">${esc(promo.titulo)}</span>` : ''}
      <div class="foot">
        <div class="price">${priceHtml}</div>
        <div class="actions">${actionsHtml(p.id, p.disponible, p.nombre, kg ? 'kg' : '')}</div>
      </div>
    </div>
  </article>`;
}

// Mosaico de categorías con ícono y cuántos productos tiene.
// Con href son enlaces (portada); sin href, botones que filtran (tienda).
export function categoriaTiles(cats, { href = null } = {}) {
  return cats.map(([c, n]) => {
    const dentro = `<span class="ic" style="background:${tinte(c)}">${iconoSvg(iconoCategoria(c), 24)}</span>
      <span>${esc(c)}<small>${n.toLocaleString('es-MX')} ${n === 1 ? 'producto' : 'productos'}</small></span>`;
    return href ? `<a class="cat-tile" href="${esc(href(c))}">${dentro}</a>`
      : `<button class="cat-tile" type="button" data-cat="${esc(c)}">${dentro}</button>`;
  }).join('');
}

export function skeletons(n = 8) {
  return Array.from({ length: n }, () => '<div class="skeleton" aria-hidden="true"></div>').join('');
}

// Delegación de eventos para los botones Agregar / + / −.
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-add],[data-inc],[data-dec]');
  if (!t) return;
  const id = t.dataset.add || t.dataset.inc || t.dataset.dec;
  const p = productsById()[id];
  const cuanto = t.dataset.add ? inicialDe(p) : pasoDe(p);
  if (t.dataset.add || t.dataset.inc) {
    if (p && p.es_alcohol && !isAdult()) {
      ageGate(() => cart.add(id, cuanto));
      return;
    }
    cart.add(id, cuanto);
    if (t.dataset.add) toast(`Agregaste ${P.esGranel(p) ? '½ kg de ' : ''}${p ? p.nombre : 'el producto'} a tu pedido`);
  } else {
    cart.add(id, -cuanto);
  }
  // Las acciones se vuelven a pintar: devolver el foco al botón equivalente.
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (card) {
    const next = card.querySelector(t.dataset.dec ? '[data-dec]' : '[data-inc]') || card.querySelector('[data-add]');
    if (next) next.focus();
  }
});

// ---------- Avisos ----------

let toastTimer;
export function toast(msg, type = '') {
  const el = qs('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

// ---------- Mayoría de edad ----------

const ADULT_KEY = 'luna_mayor_edad';
export function isAdult() {
  try { return sessionStorage.getItem(ADULT_KEY) === '1'; } catch (e) { return false; }
}

export function ageGate(onOk, onNo) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-labelledby', 'age-title');
  m.innerHTML = `<div class="box">
    <span class="moon" style="margin:auto" aria-hidden="true"></span>
    <h2 id="age-title">¿Eres mayor de 18 años?</h2>
    <p class="muted">La venta de bebidas alcohólicas es exclusiva para mayores de edad. Pediremos identificación al entregar.</p>
    <div class="buttons">
      <button class="btn" type="button" data-yes>Sí, soy mayor de 18</button>
      <button class="btn secondary" type="button" data-no>No</button>
    </div>
  </div>`;
  document.body.append(m);
  const prev = document.activeElement;
  m.querySelector('[data-yes]').focus();
  const close = () => { m.remove(); if (prev) prev.focus(); };
  m.querySelector('[data-yes]').addEventListener('click', () => {
    try { sessionStorage.setItem(ADULT_KEY, '1'); } catch (e) { /* sin almacenamiento */ }
    close();
    if (onOk) onOk();
  });
  m.querySelector('[data-no]').addEventListener('click', () => { close(); if (onNo) onNo(); });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); if (onNo) onNo(); } });
}

export function errorBox(msg) {
  return `<div class="alert error" role="alert">${esc(msg)}</div>`;
}
