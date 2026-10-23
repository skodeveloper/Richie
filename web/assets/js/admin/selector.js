// Lista buscable con casillas para elegir productos (promociones y temporadas).
// Con miles de productos solo se pintan los elegidos y lo que coincide con la
// búsqueda; la selección vive aquí, no en las casillas.
import { esc } from '../util.js';

const P = window.LunaPromos;
const MAX_VISIBLES = 60;
const estados = new Map();
let siguiente = 0;

function casilla(p, sel, otraMarca) {
  return `<label><input type="checkbox" name="sel_producto" value="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''}>
    <span>${esc(p.nombre)}${p.presentacion ? ` <span class="muted">· ${esc(p.presentacion)}</span>` : ''}</span>
    <small>${otraMarca ? esc(otraMarca(p) || '') : esc(p.categoria)}</small></label>`;
}

function pintar(picker) {
  const st = estados.get(picker.dataset.picker);
  if (!st) return;
  const q = P.norm(picker.querySelector('[data-filtro]').value);
  const coincide = (p) => !q || st.texto.get(p.id).includes(q);
  const elegidos = st.productos.filter((p) => st.sel.has(p.id) && coincide(p));
  const otros = st.productos.filter((p) => !st.sel.has(p.id) && coincide(p));
  const mostrar = otros.slice(0, MAX_VISIBLES);
  const resto = otros.length - mostrar.length;
  picker.querySelector('.list').innerHTML = [...elegidos, ...mostrar].map((p) => casilla(p, st.sel, st.otraMarca)).join('')
    + (resto > 0 ? `<p class="small muted more">y ${resto.toLocaleString('es-MX')} más: escribe para buscar.</p>` : '')
    + (!elegidos.length && !mostrar.length ? '<p class="small muted more">Sin coincidencias.</p>' : '');
  picker.querySelector('[data-sel]').textContent = `${st.sel.size} seleccionados`;
}

export function selectorProductos(productos, seleccionados = [], { otraMarca = null } = {}) {
  const id = `pk${++siguiente}`;
  const orden = productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const st = {
    productos: orden,
    sel: new Set(seleccionados),
    otraMarca,
    texto: new Map(orden.map((p) => [p.id, P.norm(`${p.nombre} ${p.marca} ${p.categoria} ${p.presentacion} ${p.codigo || ''}`)]))
  };
  // Se olvidan los selectores viejos (cada editor crea uno nuevo).
  if (estados.size > 20) estados.delete(estados.keys().next().value);
  estados.set(id, st);
  const elegidos = orden.filter((p) => st.sel.has(p.id));
  const otros = orden.filter((p) => !st.sel.has(p.id));
  const resto = otros.length - MAX_VISIBLES;
  return `<div class="picker" data-picker="${id}">
    <label class="search"><span aria-hidden="true">🔎</span><span class="sr-only">Buscar productos</span>
      <input type="search" data-filtro placeholder="Buscar producto, marca o código…" autocomplete="off"></label>
    <div class="list">${[...elegidos, ...otros.slice(0, MAX_VISIBLES)].map((p) => casilla(p, st.sel, otraMarca)).join('')}
      ${resto > 0 ? `<p class="small muted more">y ${resto.toLocaleString('es-MX')} más: escribe para buscar.</p>` : ''}</div>
    <div class="sel" data-sel>${st.sel.size} seleccionados</div>
  </div>`;
}

export function leerSeleccion(root) {
  const picker = root.querySelector('.picker[data-picker]');
  const st = picker && estados.get(picker.dataset.picker);
  if (st) return [...st.sel];
  return [...root.querySelectorAll('input[name="sel_producto"]:checked')].map((i) => i.value);
}

let espera;
document.addEventListener('input', (e) => {
  if (!e.target.matches('.picker [data-filtro]')) return;
  const picker = e.target.closest('.picker');
  clearTimeout(espera);
  espera = setTimeout(() => pintar(picker), 120);
});

// En captura: la selección se actualiza antes de que el formulario la lea
// (la vista previa de la promoción escucha "change" en el formulario).
document.addEventListener('change', (e) => {
  if (!e.target.matches('.picker input[name="sel_producto"]')) return;
  const picker = e.target.closest('.picker');
  const st = estados.get(picker.dataset.picker);
  if (!st) return;
  if (e.target.checked) st.sel.add(e.target.value);
  else st.sel.delete(e.target.value);
  picker.querySelector('[data-sel]').textContent = `${st.sel.size} seleccionados`;
}, true);
