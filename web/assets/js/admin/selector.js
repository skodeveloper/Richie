// Lista buscable con casillas para elegir productos (promociones y temporadas).
import { esc } from '../util.js';

const P = window.LunaPromos;

export function selectorProductos(productos, seleccionados = [], { otraMarca = null } = {}) {
  const sel = new Set(seleccionados);
  const orden = productos.slice().sort((a, b) => (sel.has(b.id) - sel.has(a.id)) || a.nombre.localeCompare(b.nombre, 'es'));
  return `<div class="picker">
    <label class="search"><span aria-hidden="true">🔎</span><span class="sr-only">Buscar productos</span>
      <input type="search" data-filtro placeholder="Buscar producto…" autocomplete="off"></label>
    <div class="list">${orden.map((p) => `<label data-texto="${esc(P.norm(`${p.nombre} ${p.marca} ${p.categoria} ${p.presentacion}`))}">
      <input type="checkbox" name="sel_producto" value="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''}>
      <span>${esc(p.nombre)}${p.presentacion ? ` <span class="muted">· ${esc(p.presentacion)}</span>` : ''}</span>
      <small>${otraMarca ? esc(otraMarca(p) || '') : esc(p.categoria)}</small></label>`).join('')}</div>
    <div class="sel" data-sel>${sel.size} seleccionados</div>
  </div>`;
}

export function leerSeleccion(root) {
  return [...root.querySelectorAll('input[name="sel_producto"]:checked')].map((i) => i.value);
}

document.addEventListener('input', (e) => {
  if (!e.target.matches('.picker [data-filtro]')) return;
  const q = P.norm(e.target.value);
  e.target.closest('.picker').querySelectorAll('.list label').forEach((l) => { l.hidden = !!q && !l.dataset.texto.includes(q); });
});

document.addEventListener('change', (e) => {
  if (!e.target.matches('.picker input[name="sel_producto"]')) return;
  const picker = e.target.closest('.picker');
  picker.querySelector('[data-sel]').textContent = `${picker.querySelectorAll('input[name="sel_producto"]:checked').length} seleccionados`;
});
