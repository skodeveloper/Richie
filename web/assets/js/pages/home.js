// Portada: promociones vigentes, temporada, destacados y opiniones.
import { api, loadCatalog } from '../api.js';
import { renderChrome, setCatalog, productCard, skeletons, negocioActual, categoriaTiles } from '../ui.js';
import { esc, qs, todayMX, prettyDate, parseHorario, horaTexto } from '../util.js';

const P = window.LunaPromos;
renderChrome('index.html');

const promosEl = qs('#home-promos');
const seasonEl = qs('#home-season');
const featEl = qs('#home-featured');
featEl.innerHTML = `<div class="grid">${skeletons(4)}</div>`;

// Sin destacados elegidos: uno de cada categoría (primero los que tienen
// precio y foto), mezclados con una semilla del día para que la portada cambie.
function variados(base, cuantos, semilla) {
  let h = 0;
  for (const ch of semilla) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const azar = (p) => { let x = h; for (const ch of p.id) x = (x * 33 + ch.charCodeAt(0)) >>> 0; return x; };
  const grupos = new Map();
  const conPrecio = (p) => p.precio !== null && p.precio !== undefined;
  base.forEach((p) => {
    if (!grupos.has(p.categoria)) grupos.set(p.categoria, []);
    grupos.get(p.categoria).push(p);
  });
  const filas = [...grupos.values()].sort((a, b) => b.length - a.length)
    .map((g) => g.sort((a, b) => conPrecio(b) - conPrecio(a) || !!b.imagen - !!a.imagen || azar(a) - azar(b)));
  const out = [];
  for (let i = 0; out.length < cuantos && filas.some((g) => g[i]); i++) {
    filas.forEach((g) => { if (g[i] && out.length < cuantos) out.push(g[i]); });
  }
  return out;
}

function pintarContacto() {
  const n = negocioActual();
  qs('#info-horario').innerHTML = n.horario.map((h) => `<dt>${esc(h.dias)}</dt><dd>${esc(h.horas)}</dd>`).join('');
  qs('#info-direccion').textContent = n.direccion;
  qs('#info-telefonos').innerHTML = n.telefonos.map((t) => `<a href="tel:${esc(t.tel)}">${esc(t.texto)} <span>Llamar ↗</span></a>`).join('')
    + (n.whatsapp ? `<a href="https://wa.me/52${esc(n.whatsapp)}" target="_blank" rel="noopener">WhatsApp <span>Escribir ↗</span></a>` : '');
  const [semana, domingo] = [parseHorario(n.semana), parseHorario(n.domingo)];
  qs('#strip-horario').textContent = semana && domingo && semana[1] === domingo[1]
    ? `Lunes a domingo hasta las ${horaTexto(semana[1])}` : 'Mostrador y domicilio';
}

loadCatalog((c) => {
  setCatalog(c);
  pintarContacto();
  const today = todayMX();
  const promos = c.promociones.filter((p) => P.isActive(p, today)).slice(0, 3);
  promosEl.closest('section').hidden = !promos.length;
  promosEl.innerHTML = promos.map((p) => `<article class="promo-card">
      <span class="big">${esc(P.label(p))}</span>
      <h3>${esc(p.titulo)}</h3>
      ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
      <span class="until">${p.fin ? `Hasta el ${esc(prettyDate(p.fin))}` : 'Vigente'}</span>
      <a href="promociones.html#promo-${esc(p.id)}">Ver productos →</a>
    </article>`).join('');

  const t = c.temporadas[0];
  seasonEl.hidden = !t;
  if (t) {
    seasonEl.innerHTML = `<div class="wrap"><div class="season"><div class="season-head">
      <div><p class="eyebrow">De temporada${t.fin ? ` · hasta el ${esc(prettyDate(t.fin))}` : ''}</p><h2>${esc(t.nombre)}</h2>
      ${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}</div>
      <a class="btn" href="temporada.html#${esc(t.id)}">Ver temporada →</a></div></div></div>`;
  }

  const base = c.productos.filter((p) => !p.es_alcohol && p.disponible);
  const hayDestacados = base.some((p) => p.destacado);
  const feat = hayDestacados ? base.filter((p) => p.destacado).slice(0, 10) : variados(base, 10, today);
  qs('#home-featured-title').textContent = hayDestacados ? 'Lo más pedido' : 'Recomendados de hoy';
  featEl.innerHTML = `<div class="grid">${feat.map((p) => productCard(p, c.promociones, today)).join('')}</div>`;

  // Categorías con más productos (las de licores viven en su propia página).
  const conteo = new Map();
  c.productos.filter((p) => !p.es_alcohol).forEach((p) => conteo.set(p.categoria, (conteo.get(p.categoria) || 0) + 1));
  const cats = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  qs('#home-cats').hidden = cats.length < 4;
  qs('#home-cat-tiles').innerHTML = categoriaTiles(cats.slice(0, 12), { href: (cat) => `tienda.html?cat=${encodeURIComponent(cat)}` });
}).catch(() => {
  featEl.innerHTML = '<p class="muted">No pudimos cargar los productos. <a href="tienda.html">Intenta en la tienda</a>.</p>';
});

api.comments().then((r) => {
  if (!r.comentarios.length) return;
  const el = qs('#home-reviews');
  el.closest('section').hidden = false;
  el.innerHTML = r.comentarios.slice(0, 3).map((c) => `<article class="review">
    <span class="stars" aria-label="${c.calificacion} de 5 estrellas">${'★'.repeat(c.calificacion)}${'☆'.repeat(5 - c.calificacion)}</span>
    <p>${esc(c.comentario)}</p><div class="who">${esc(c.nombre)}</div></article>`).join('');
}).catch(() => {});
