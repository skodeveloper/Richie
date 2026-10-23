// Sección Opiniones: publicar, ocultar y responder comentarios de clientes.
import { esc, prettyDate } from '../util.js';
import { toast } from './ui.js';

let main;
let ctx;
let lista = [];
let filtro = 'PENDIENTE';

const ESTADOS = [['PENDIENTE', 'Por revisar'], ['APROBADO', 'Publicadas'], ['OCULTO', 'Ocultas'], ['TODOS', 'Todas']];

function pintar() {
  const cuenta = (e) => (e === 'TODOS' ? lista.length : lista.filter((c) => (c.estado || 'PENDIENTE') === e).length);
  main.querySelector('#ofil').innerHTML = ESTADOS.map(([e, l]) => `<button type="button" data-f="${e}" aria-pressed="${filtro === e}">${l} <b>${cuenta(e)}</b></button>`).join('');
  ctx.setBadge('opiniones', cuenta('PENDIENTE'));
  const vis = lista.filter((c) => filtro === 'TODOS' || (c.estado || 'PENDIENTE') === filtro);
  main.querySelector('#olist').innerHTML = vis.length ? vis.map((c) => `
    <article class="adm-card" data-id="${esc(c.id)}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="stars" aria-label="${Number(c.calificacion) || 0} de 5 estrellas">${'★'.repeat(Number(c.calificacion) || 0)}${'☆'.repeat(5 - (Number(c.calificacion) || 0))}</span>
        <span class="pill ${c.estado === 'APROBADO' ? 'ok' : c.estado === 'OCULTO' ? 'mute' : 'warn'}">${c.estado === 'APROBADO' ? 'Publicada' : c.estado === 'OCULTO' ? 'Oculta' : 'Por revisar'}</span>
      </div>
      <p style="margin:10px 0;line-height:1.6">${esc(c.comentario)}</p>
      <p class="small muted" style="margin:0 0 12px">${esc(c.nombre)} · ${esc(prettyDate(c.fecha))}${c.folio ? ` · pedido ${esc(c.folio)}` : ''}${c.publicable ? '' : ' · <b>Pidió que sea privado</b>'}</p>
      <div class="field"><label for="r-${esc(c.id)}">Tu respuesta pública (opcional)</label>
        <input id="r-${esc(c.id)}" name="respuesta" maxlength="400" value="${esc(c.respuesta || '')}" placeholder="Ej. ¡Gracias por tu preferencia!"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${c.publicable ? `<button class="btn small" type="button" data-mod="APROBADO">${c.estado === 'APROBADO' ? 'Guardar respuesta' : 'Publicar'}</button>` : ''}
        ${c.estado !== 'OCULTO' ? '<button class="btn small secondary" type="button" data-mod="OCULTO">Ocultar</button>' : ''}
      </div>
    </article>`).join('')
    : `<div class="adm-empty"><h3>${filtro === 'PENDIENTE' ? 'Nada por revisar' : 'Sin opiniones aquí'}</h3><p>Las opiniones nuevas llegan como “Por revisar”. Nada se publica sin tu aprobación.</p></div>`;
}

async function onClick(e) {
  const f = e.target.closest('[data-f]');
  if (f) { filtro = f.dataset.f; pintar(); return; }
  const m = e.target.closest('[data-mod]');
  if (!m) return;
  const card = m.closest('[data-id]');
  m.disabled = true;
  try {
    await ctx.api('adminModerateComment', { id: card.dataset.id, estado: m.dataset.mod, respuesta: card.querySelector('[name=respuesta]').value });
    const c = lista.find((x) => x.id === card.dataset.id);
    c.estado = m.dataset.mod;
    c.respuesta = card.querySelector('[name=respuesta]').value;
    toast(m.dataset.mod === 'APROBADO' ? 'Opinión publicada' : 'Opinión oculta');
    pintar();
  } catch (err) {
    m.disabled = false;
    toast(err.message, 'error');
  }
}

export async function render(el, c) {
  main = el;
  ctx = c;
  const r = await ctx.api('adminComments');
  lista = r.comentarios;
  if (!lista.some((x) => (x.estado || 'PENDIENTE') === 'PENDIENTE') && filtro === 'PENDIENTE' && lista.length) filtro = 'TODOS';
  main.innerHTML = '<div class="seg" id="ofil" role="toolbar" aria-label="Filtros"></div><div id="olist"></div>';
  pintar();
  main.addEventListener('click', onClick);
}

export function salir() {
  if (main) main.removeEventListener('click', onClick);
  main = null;
}
