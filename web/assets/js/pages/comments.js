// Opiniones: formulario y comentarios aprobados por la tienda.
import { api, loadCatalog } from '../api.js';
import { renderChrome, setCatalog, errorBox } from '../ui.js';
import { esc, qs, prettyDate } from '../util.js';

renderChrome('comentarios.html');
loadCatalog(setCatalog).catch(() => {});

const form = qs('#comment-form');
const msg = qs('#comment-msg');
const list = qs('#reviews');

export const starsHtml = (n) => `<span class="stars" aria-label="${n} de 5 estrellas">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

export function reviewHtml(c) {
  return `<article class="review">
    ${starsHtml(c.calificacion)}
    <p>${esc(c.comentario)}</p>
    <div class="who">${esc(c.nombre)} · ${esc(prettyDate(c.fecha))}</div>
    ${c.respuesta ? `<div class="reply"><strong>La Luna responde:</strong> ${esc(c.respuesta)}</div>` : ''}
  </article>`;
}

async function cargar() {
  try {
    const r = await api.comments();
    qs('#rating').innerHTML = r.total
      ? `<span class="rating-big">${String(r.promedio).replace('.', ',')}</span> ${starsHtml(Math.round(r.promedio))}
         <span class="muted small">${r.total} ${r.total === 1 ? 'opinión' : 'opiniones'}</span>`
      : '';
    list.innerHTML = r.comentarios.length
      ? r.comentarios.map(reviewHtml).join('')
      : '<div class="empty"><h3>Sé el primero en opinar</h3><p class="muted">Tus comentarios nos ayudan a atenderte mejor.</p></div>';
  } catch (e) {
    list.innerHTML = errorBox(e.message);
  }
}

form.folio.value = new URLSearchParams(location.search).get('folio') || '';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const datos = {
    nombre: String(fd.get('nombre') || '').trim(),
    calificacion: Number(fd.get('calificacion') || 0),
    comentario: String(fd.get('comentario') || '').trim(),
    folio: String(fd.get('folio') || '').trim(),
    publicable: fd.get('publicable') === 'on',
    website: String(fd.get('website') || '')
  };
  if (datos.nombre.length < 2) { msg.innerHTML = errorBox('Escribe tu nombre.'); form.nombre.focus(); return; }
  if (!datos.calificacion) { msg.innerHTML = errorBox('Elige de 1 a 5 estrellas.'); return; }
  if (datos.comentario.length < 5) { msg.innerHTML = errorBox('Escribe tu comentario.'); form.comentario.focus(); return; }
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    await api.addComment(datos);
    form.reset();
    msg.innerHTML = `<div class="alert ok" role="status">¡Gracias! Recibimos tu comentario.${datos.publicable ? ' Lo publicaremos después de revisarlo.' : ''}</div>`;
  } catch (ex) {
    msg.innerHTML = errorBox(ex.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar comentario';
  }
});

cargar();
