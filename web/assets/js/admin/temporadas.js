// Sección Temporadas: fechas especiales con sus productos.
import { esc } from '../util.js';
import { toast, drawer, confirmar, switchHtml, vigenciaPill, fechaCorta } from './ui.js';
import { selectorProductos, leerSeleccion } from './selector.js';

let main;
let ctx;
let cat;

function tarjeta(t) {
  const n = cat.productos.filter((p) => p.temporada === t.id).length;
  return `<article class="pcard" data-id="${esc(t.id)}">
    <div class="top"><h3>${esc(t.nombre)}</h3>${vigenciaPill(t.estado)}</div>
    ${t.descripcion ? `<p class="meta" style="margin:0">${esc(t.descripcion)}</p>` : ''}
    <div class="meta">${t.inicio || t.fin ? `${t.inicio ? `Del ${esc(fechaCorta(t.inicio))}` : 'Desde hoy'} ${t.fin ? `al ${esc(fechaCorta(t.fin))}` : 'sin fecha de fin'}` : 'Sin fechas'}<br>
      <b>${n}</b> ${n === 1 ? 'producto' : 'productos'}</div>
    <div class="foot">${switchHtml('activa', t.activa, '<span class="small">Activa</span>', { attrs: 'data-activa' })}
      <button class="btn small secondary" type="button" data-edit>Editar</button></div>
  </article>`;
}

function pintar() {
  const orden = { ACTIVA: 0, PROGRAMADA: 1, APAGADA: 2, VENCIDA: 3 };
  const lista = cat.temporadas.slice().sort((a, b) => orden[a.estado] - orden[b.estado] || String(a.inicio).localeCompare(String(b.inicio)));
  main.querySelector('#tlist').innerHTML = lista.length
    ? `<div class="cards-grid">${lista.map(tarjeta).join('')}</div>`
    : '<div class="adm-empty"><h3>Aún no tienes temporadas</h3><p>Crea una para Día de Muertos, posadas, Navidad, Cuaresma… y elige sus productos.</p></div>';
}

function guardarLocal(t, ids) {
  const i = cat.temporadas.findIndex((x) => x.id === t.id);
  if (i >= 0) cat.temporadas[i] = t;
  else cat.temporadas.push(t);
  if (ids) {
    cat.productos.forEach((p) => {
      if (ids.includes(p.id)) p.temporada = t.id;
      else if (p.temporada === t.id) p.temporada = '';
    });
  }
}

const payload = (t) => ({ id: t.id, nombre: t.nombre, descripcion: t.descripcion, inicio: t.inicio || '', fin: t.fin || '', activa: t.activa, imagen: t.imagen || '' });

function editor(t) {
  const nueva = !t;
  const d = t || { nombre: '', descripcion: '', inicio: '', fin: '', activa: true };
  const ids = t ? cat.productos.filter((p) => p.temporada === t.id).map((p) => p.id) : [];
  const nombreDe = Object.fromEntries(cat.temporadas.map((x) => [x.id, x.nombre]));
  const body = `<form id="tform" novalidate>
    <div class="fgroup"><h3>Temporada</h3>
      <div class="field"><label for="t-nom">Nombre *</label><input id="t-nom" name="nombre" value="${esc(d.nombre)}" maxlength="100" placeholder="Ej. Navidad"></div>
      <div class="field"><label for="t-desc">Descripción (se ve en el sitio)</label><input id="t-desc" name="descripcion" value="${esc(d.descripcion)}" maxlength="300" placeholder="Ej. Todo para tu cena navideña"></div>
      <div class="row2">
        <div class="field"><label for="t-ini">Desde</label><input id="t-ini" type="date" name="inicio" value="${esc(d.inicio)}"></div>
        <div class="field"><label for="t-fin">Hasta</label><input id="t-fin" type="date" name="fin" value="${esc(d.fin)}"></div>
      </div>
      <div class="toggles">${switchHtml('activa', d.activa, 'Temporada activa', { hint: 'Se muestra en el sitio solo entre esas fechas.' })}</div>
    </div>
    <div class="fgroup"><h3>Productos de la temporada</h3>
      <p class="small muted" style="margin-top:0">Un producto solo puede estar en una temporada. Si eliges uno que ya está en otra, se cambia a esta.</p>
      ${selectorProductos(cat.productos, ids, { otraMarca: (p) => (p.temporada && (!t || p.temporada !== t.id) ? `en ${nombreDe[p.temporada] || 'otra'}` : p.categoria) })}
      <p class="small muted" style="margin-bottom:0">¿Falta un producto (pan de muerto, piñatas…)? Agrégalo primero en <b>Productos</b>.</p>
    </div>
  </form>`;
  const dr = drawer({
    title: nueva ? 'Nueva temporada' : 'Editar temporada',
    body,
    actions: [
      ...(nueva ? [] : [{ label: 'Eliminar', kind: 'secondary', onClick: eliminar }]),
      'spacer',
      { label: 'Cancelar', kind: 'secondary' },
      { label: nueva ? 'Crear temporada' : 'Guardar', busy: 'Guardando…', onClick: guardar }
    ]
  });
  const form = dr.el.querySelector('#tform');

  async function guardar() {
    const f = new FormData(form);
    const datos = { id: t ? t.id : undefined, nombre: String(f.get('nombre') || '').trim(), descripcion: f.get('descripcion'),
      inicio: f.get('inicio'), fin: f.get('fin'), activa: form.activa.checked };
    if (datos.nombre.length < 3) { form.nombre.focus(); throw new Error('Escribe el nombre de la temporada.'); }
    const sel = leerSeleccion(form);
    const r = await ctx.api('adminSaveSeason', { temporada: payload(datos), productos: sel });
    guardarLocal(r.temporada, sel);
    pintar();
    toast(nueva ? 'Temporada creada' : 'Temporada guardada');
    return true;
  }

  async function eliminar() {
    const ok = await confirmar(`Se borrará <b>${esc(t.nombre)}</b>. Sus productos no se borran, solo dejan de estar en esta temporada.`,
      { titulo: '¿Eliminar temporada?', ok: 'Sí, eliminar', peligro: true });
    if (!ok) return false;
    await ctx.api('adminDeleteSeason', { id: t.id });
    cat.temporadas = cat.temporadas.filter((x) => x.id !== t.id);
    cat.productos.forEach((p) => { if (p.temporada === t.id) p.temporada = ''; });
    pintar();
    toast('Temporada eliminada');
    return true;
  }
}

async function onChange(e) {
  if (!e.target.matches('[data-activa]')) return;
  const t = cat.temporadas.find((x) => x.id === e.target.closest('[data-id]').dataset.id);
  e.target.disabled = true;
  try {
    const r = await ctx.api('adminSaveSeason', { temporada: payload({ ...t, activa: e.target.checked }) });
    guardarLocal(r.temporada);
    pintar();
    toast(r.temporada.activa ? 'Temporada activada' : 'Temporada pausada');
  } catch (err) {
    e.target.checked = !e.target.checked;
    e.target.disabled = false;
    toast(err.message, 'error');
  }
}

function onClick(e) {
  if (e.target.closest('[data-nueva]')) { editor(null); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) editor(cat.temporadas.find((x) => x.id === ed.closest('[data-id]').dataset.id));
}

export async function render(el, c) {
  main = el;
  ctx = c;
  cat = await ctx.catalogo();
  main.innerHTML = `<div class="adm-toolbar"><p class="muted" style="margin:0;flex:1">Aparecen en la página Temporada y en la portada solo entre sus fechas.</p>
    <button class="btn" type="button" data-nueva>+ Nueva temporada</button></div><div id="tlist"></div>`;
  pintar();
  main.addEventListener('click', onClick);
  main.addEventListener('change', onChange);
}

export function salir() {
  if (!main) return;
  main.removeEventListener('click', onClick);
  main.removeEventListener('change', onChange);
  main = null;
}
