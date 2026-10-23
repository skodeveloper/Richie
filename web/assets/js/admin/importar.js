// Importar el catálogo del punto de venta (Excel o CSV): vista previa y
// carga por partes. Solo viajan los datos públicos: nunca el precio de costo.
import { esc, money } from '../util.js';
import { toast, drawer } from './ui.js';
import { leerArchivo } from './xlsx.js';
import { mapearCatalogo, CATEGORIAS } from './catalogo-pos.js';

const LOTE = 800;
const CAMPOS = ['codigo', 'nombre', 'presentacion', 'categoria', 'marca', 'precio', 'disponible', 'visible', 'es_alcohol', 'unidad'];
const n = (x) => Number(x).toLocaleString('es-MX');
const ordenCategoria = (c) => { const i = CATEGORIAS.indexOf(c); return i < 0 ? CATEGORIAS.length : i; };

// Compara con lo que ya hay en la tienda (por código) para la vista previa.
function comparar(productos, actuales) {
  const porCodigo = new Map(actuales.filter((p) => p.codigo).map((p) => [String(p.codigo), p]));
  const r = { nuevos: [], precio: 0, disponibilidad: 0, sinCambios: 0 };
  productos.forEach((p) => {
    const a = porCodigo.get(p.codigo);
    if (!a) { r.nuevos.push(p); return; }
    const cambiaPrecio = (a.precio ?? null) !== p.precio;
    const cambiaDisp = !!a.disponible !== p.disponible;
    if (cambiaPrecio) r.precio++;
    if (cambiaDisp) r.disponibilidad++;
    if (!cambiaPrecio && !cambiaDisp && (a.unidad || '') === p.unidad) r.sinCambios++;
  });
  return r;
}

function vistaPrevia(m, cmp, sinCodigoVisibles) {
  const s = m.resumen;
  const nuevos = cmp.nuevos;
  const publicados = nuevos.filter((p) => p.visible).length;
  const cig = nuevos.filter((p) => p.categoria === 'Cigarros').length;
  const internos = nuevos.filter((p) => p.interno).length;
  const kpi = (v, t) => `<div class="kpi"><strong>${n(v)}</strong><span>${t}</span></div>`;
  const porCat = Object.entries(s.porCategoria).sort((a, b) => ordenCategoria(a[0]) - ordenCategoria(b[0]));
  const ejemplos = m.productos.filter((p) => p.visible && p.original !== p.nombre).sort(() => 0.5 - Math.random()).slice(0, 12);
  return `<div class="fgroup"><h3>2. Revisa antes de importar</h3>
      <div class="kpi-row imp-kpis">
        ${kpi(nuevos.length, 'Productos nuevos')}
        ${kpi(cmp.precio, 'Precios que cambian')}
        ${kpi(cmp.disponibilidad, 'Cambian a disponible o agotado')}
        ${kpi(cmp.sinCambios, 'Sin cambios')}
      </div>
      <ul class="imp-list">
        ${nuevos.length ? `<li>Se publicarán <b>${n(publicados)}</b> productos nuevos.${cig || internos ? ` Quedan ocultos${cig ? ` <b>${n(cig)} ${cig === 1 ? 'cigarro' : 'cigarros'}</b> (la ley prohíbe anunciarlos)` : ''}${cig && internos ? ' y' : ''}${internos ? ` <b>${n(internos)} de uso interno</b> (bolsas, envases, importes)` : ''}; puedes revisarlos en el filtro “Ocultos”.` : ''}</li>` : ''}
        <li><b>${n(s.agotados)}</b> con existencia en 0 saldrán como <b>Agotado</b>. Los que no llevan control de existencia (“-”) quedan disponibles.</li>
        ${s.granel ? `<li><b>${n(s.granel)}</b> ${s.granel === 1 ? 'producto a granel se vende' : 'productos a granel se venden'} <b>por kilo</b> (el cliente elige ¼, ½, ¾, 1 kg…).</li>` : ''}
        ${s.alcohol ? `<li><b>${n(s.alcohol)}</b> son cerveza, vinos o licores: salen en Licores y piden confirmar mayoría de edad.</li>` : ''}
        ${s.sinPrecio ? `<li><b>${n(s.sinPrecio)}</b> no traen precio: se mostrarán como “Precio por confirmar”.</li>` : ''}
        <li>A los productos que ya existen solo se les actualiza <b>precio y disponibilidad</b>: lo que hayas editado aquí (nombre, foto, categoría, destacados) se respeta.</li>
      </ul>
      <details class="imp-det"><summary>Productos por categoría</summary>
        <div class="imp-cats">${porCat.map(([c, k]) => `<span>${esc(c)} <b>${n(k)}</b></span>`).join('')}</div>
        <p class="small muted">La categoría se asigna sola según el nombre y el departamento. Si alguno quedó mal, cámbialo en “Editar”.</p></details>
      ${ejemplos.length ? `<details class="imp-det"><summary>Ejemplos de cómo se verán los nombres</summary>
        <table class="ctable imp-tbl"><thead><tr><th>En el punto de venta</th><th>En la tienda</th><th>Categoría</th><th class="num">Precio</th></tr></thead>
        <tbody>${ejemplos.map((p) => `<tr><td class="muted">${esc(p.original)}</td><td>${esc(p.nombre)}${p.presentacion ? ` <span class="muted">· ${esc(p.presentacion)}</span>` : ''}</td>
          <td>${esc(p.categoria)}</td><td class="num">${p.precio === null ? '—' : money(p.precio)}${p.unidad === 'kg' ? '/kg' : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
      ${m.errores.length ? `<details class="imp-det"><summary>${n(m.errores.length)} ${m.errores.length === 1 ? 'fila se omitirá' : 'filas se omitirán'}</summary>
        <ul class="small">${m.errores.slice(0, 50).map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : ''}
    </div>
    ${sinCodigoVisibles ? `<div class="fgroup">
      <label class="switch"><span>Ocultar los ${n(sinCodigoVisibles)} productos que hoy están en la tienda y no vienen del punto de venta
        <small>Recomendado la primera vez, para que el catálogo quede igual al del punto de venta. No se borran: quedan en “Ocultos”.</small></span>
        <input type="checkbox" role="switch" name="ocultar" ${cmp.nuevos.length === m.productos.length ? 'checked' : ''}></label>
    </div>` : ''}
    <div class="imp-prog" id="improg" hidden><div class="bar"><span></span></div><p class="small" aria-live="polite"></p></div>`;
}

export function abrirImportador(ctx, cat, alTerminar) {
  let mapeo = null;
  let cmp = null;
  const sinCodigoVisibles = cat.productos.filter((p) => !p.codigo && p.visible).length;
  const body = `<div class="fgroup"><h3>1. Elige el archivo</h3>
      <p class="small muted" style="margin-top:0">Exporta el catálogo desde tu punto de venta en Excel (.xlsx) o CSV, con las columnas
        <b>Código, Producto, P. Venta, Departamento</b> y <b>Existencia</b>. Úsalo igual cada vez que cambien precios.</p>
      <span class="btn secondary file-btn">📄 Elegir archivo<input type="file" id="impfile" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" aria-label="Elegir archivo del catálogo"></span>
      <span class="small muted" id="impnombre" style="margin-left:8px"></span>
      <p class="small muted" style="margin:12px 0 0">🔒 El precio de costo nunca se lee ni se sube: se queda en tu computadora.</p>
    </div>
    <div id="impres"></div>`;

  const d = drawer({
    title: 'Importar desde punto de venta',
    body,
    actions: ['spacer', { label: 'Cancelar', kind: 'secondary' }, { label: 'Importar', busy: 'Importando…', onClick: importar }]
  });
  const el = d.el;
  const btnImportar = el.querySelector('footer .btn:last-child');
  btnImportar.disabled = true;

  el.querySelector('#impfile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const res = el.querySelector('#impres');
    el.querySelector('#impnombre').textContent = file.name;
    res.innerHTML = '<p class="muted">Leyendo el archivo…</p>';
    btnImportar.disabled = true;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máximo 25 MB).');
      mapeo = mapearCatalogo(await leerArchivo(file));
      if (!mapeo.productos.length) throw new Error('El archivo no trae productos.');
      // Orden de la tienda: por categoría y nombre (el nuevo "orden" sigue este acomodo).
      mapeo.productos.sort((a, b) => ordenCategoria(a.categoria) - ordenCategoria(b.categoria) || a.nombre.localeCompare(b.nombre, 'es'));
      cmp = comparar(mapeo.productos, cat.productos);
      res.innerHTML = vistaPrevia(mapeo, cmp, sinCodigoVisibles);
      btnImportar.textContent = `Importar ${n(mapeo.productos.length)} productos`;
      btnImportar.disabled = false;
      d.markClean();
    } catch (err) {
      mapeo = null;
      res.innerHTML = `<div class="hint-box" role="alert">⚠️ ${esc(err.message || 'No pudimos leer el archivo.')}</div>`;
    } finally {
      e.target.value = '';
    }
  });

  async function importar() {
    if (!mapeo) throw new Error('Primero elige el archivo del catálogo.');
    const ocultar = !!el.querySelector('input[name="ocultar"]:checked');
    const prog = el.querySelector('#improg');
    const barra = prog.querySelector('.bar span');
    const texto = prog.querySelector('p');
    prog.hidden = false;
    el.querySelector('#impfile').disabled = true;
    const lista = mapeo.productos.map((p) => Object.fromEntries(CAMPOS.map((k) => [k, p[k]])));
    const total = { nuevos: 0, actualizados: 0, sin_cambios: 0, ocultados: 0, omitidos: 0 };
    try {
      for (let i = 0; i < lista.length; i += LOTE) {
        const lote = lista.slice(i, i + LOTE);
        texto.textContent = `Guardando ${n(Math.min(i + lote.length, lista.length))} de ${n(lista.length)}…`;
        barra.style.width = `${Math.round((i / lista.length) * 100)}%`;
        const r = await ctx.api('adminImportProducts', { productos: lote, ocultar_sin_codigo: ocultar && i === 0 });
        Object.keys(total).forEach((k) => { total[k] += r[k] || 0; });
        barra.style.width = `${Math.round(((i + lote.length) / lista.length) * 100)}%`;
      }
    } catch (err) {
      el.querySelector('#impfile').disabled = false;
      texto.textContent = 'La importación se detuvo. Lo que ya se guardó se queda; puedes volver a importar el mismo archivo sin duplicar productos.';
      if (alTerminar) alTerminar();
      throw err;
    }
    const partes = [
      total.nuevos && `${n(total.nuevos)} nuevos`,
      total.actualizados && `${n(total.actualizados)} actualizados`,
      total.sin_cambios && `${n(total.sin_cambios)} sin cambios`,
      total.ocultados && `${n(total.ocultados)} anteriores ocultos`,
      total.omitidos && `${n(total.omitidos)} omitidos`
    ].filter(Boolean);
    toast(`Catálogo importado: ${partes.join(', ') || 'sin cambios'}.`);
    if (alTerminar) alTerminar();
    return true;
  }
}
