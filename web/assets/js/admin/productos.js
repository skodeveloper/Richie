// Sección Productos: precios en línea, agotar/ocultar/destacar y editor completo con foto.
import { esc, money } from '../util.js';
import { miniatura } from '../icons.js';
import { toast, drawer, confirmar, switchHtml, comprimirFoto, debounce } from './ui.js';
import { abrirImportador } from './importar.js';

const P = window.LunaPromos;
const POR_PAGINA = 60;

let main;
let ctx;
let cat;
let filtro = { q: '', categoria: '', vista: 'todos' };
let limite = POR_PAGINA;

const VISTAS = [
  ['todos', 'Todos', () => true],
  ['sinprecio', 'Sin precio', (p) => p.precio === null || p.precio === undefined],
  ['agotados', 'Agotados', (p) => !p.disponible],
  ['ocultos', 'Ocultos', (p) => !p.visible],
  ['destacados', 'Destacados', (p) => p.destacado],
  ['licores', 'Licores', (p) => p.es_alcohol],
  ['granel', 'A granel', (p) => p.unidad === 'kg']
];

const categorias = () => [...new Set(cat.productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const marcas = () => [...new Set(cat.productos.map((p) => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const esTabaco = (p) => /cigarr|tabaco/.test(P.norm(p.categoria));

function filtrados() {
  const q = P.norm(filtro.q);
  const pasa = VISTAS.find((v) => v[0] === filtro.vista)[2];
  return cat.productos.filter((p) => pasa(p)
    && (!filtro.categoria || p.categoria === filtro.categoria)
    && (!q || P.norm(`${p.nombre} ${p.marca} ${p.categoria} ${p.presentacion} ${p.codigo || ''}`).includes(q)))
    // Los ocultos al final: tras importar, el catálogo anterior no estorba.
    .sort((a, b) => (b.visible - a.visible) || (a.orden ?? 9999) - (b.orden ?? 9999) || a.nombre.localeCompare(b.nombre, 'es'));
}

function fila(p) {
  const sinPrecio = p.precio === null || p.precio === undefined;
  return `<div class="prow${p.visible ? '' : ' hidden-p'}" data-id="${esc(p.id)}">
    ${miniatura(p, 26)}
    <div class="info"><div class="nm">${esc(p.nombre)}</div>
      <div class="sub">${[p.unidad === 'kg' ? 'A granel' : p.presentacion, p.marca, p.categoria].filter(Boolean).map(esc).join(' · ')}${p.visible ? '' : ' · <b>Oculto</b>'}${p.es_alcohol ? ' · +18' : ''}</div></div>
    <label class="price-in${sinPrecio ? ' sinprecio' : ''}${p.unidad === 'kg' ? ' kg' : ''}"><span>$</span><span class="sr-only">Precio${p.unidad === 'kg' ? ' por kilo' : ''} de ${esc(p.nombre)}</span>
      <input type="text" inputmode="decimal" data-precio value="${sinPrecio ? '' : esc(p.precio)}" placeholder="Sin precio" autocomplete="off">${p.unidad === 'kg' ? '<span class="per" aria-hidden="true">/kg</span>' : ''}</label>
    <div class="sw-wrap">
      ${switchHtml('disponible', p.disponible, '<span class="small">Disponible</span>', { attrs: 'data-sw="disponible"' })}
      ${switchHtml('visible', p.visible, '<span class="small">Visible</span>', { attrs: 'data-sw="visible"' })}
      <button class="star-btn" type="button" data-star aria-pressed="${p.destacado}" title="Destacar en la portada" aria-label="Destacar ${esc(p.nombre)} en la portada">★</button>
      <button class="btn small secondary" type="button" data-edit>Editar</button>
    </div>
  </div>`;
}

function pintarContadores() {
  main.querySelector('#pvistas').innerHTML = VISTAS.map(([id, label, f]) => {
    const n = cat.productos.filter(f).length;
    return `<button type="button" data-vista="${id}" aria-pressed="${filtro.vista === id}">${label} <b>${n}</b></button>`;
  }).join('');
}

function pintarLista() {
  const lista = filtrados();
  const el = main.querySelector('#plist');
  main.querySelector('#pcount').textContent = `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}`;
  if (!lista.length) {
    el.innerHTML = `<div class="adm-empty"><h3>No hay productos aquí</h3><p>${filtro.vista === 'sinprecio' ? '¡Todos tus productos ya tienen precio!' : 'Prueba con otra búsqueda o agrega uno nuevo.'}</p></div>`;
    return;
  }
  el.innerHTML = `<div class="plist">
    <div class="prow head" aria-hidden="true"><span></span><span>Producto</span><span>Precio</span><span>Disponible</span><span>Visible</span><span>★</span><span></span></div>
    ${lista.slice(0, limite).map(fila).join('')}
    ${lista.length > limite ? `<div class="more-row"><button class="btn secondary small" type="button" data-mas>Mostrar ${Math.min(POR_PAGINA, lista.length - limite)} más (de ${lista.length - limite})</button></div>` : ''}
  </div>`;
}

function actualizarFila(p) {
  const old = main.querySelector(`.prow[data-id="${CSS.escape(p.id)}"]`);
  if (old) old.outerHTML = fila(p);
  pintarContadores();
}

async function guardar(id, cambios) {
  const r = await ctx.api('adminSaveProducts', { productos: [{ id, ...cambios }] });
  const nuevo = r.productos[0];
  const i = cat.productos.findIndex((x) => x.id === id);
  if (i >= 0) cat.productos[i] = nuevo;
  return nuevo;
}

// ---------- Editor ----------

function editor(p) {
  const nuevo = !p;
  const d = p || { nombre: '', categoria: filtro.categoria || '', marca: '', presentacion: '', precio: null, imagen: '', descripcion: '',
    visible: true, disponible: true, destacado: false, es_alcohol: filtro.vista === 'licores', temporada: '', orden: null,
    unidad: filtro.vista === 'granel' ? 'kg' : '', codigo: '' };
  const body = `
    <form id="pform" novalidate>
      <div class="fgroup"><h3>Foto</h3>
        <div class="photo-edit">
          <span id="pfoto">${miniatura(d, 40)}</span>
          <div class="acts">
            <span class="btn small secondary file-btn">📷 ${d.imagen ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/*" id="pfile" aria-label="Subir foto"></span>
            ${d.imagen ? '<button class="link-btn" type="button" data-quitar-foto>Quitar foto</button>' : ''}
            <details><summary class="small muted" style="cursor:pointer">o pegar un enlace</summary>
              <input class="input" name="imagen" value="${esc(d.imagen)}" placeholder="https://…" style="margin-top:8px"></details>
          </div>
        </div>
        <p class="small muted" style="margin:10px 0 0">Sin foto se muestra un ícono de la categoría.</p>
      </div>
      <div class="fgroup"><h3>Datos</h3>
        <div class="field"><label for="p-nombre">Nombre *</label><input id="p-nombre" name="nombre" value="${esc(d.nombre)}" maxlength="120" required placeholder="Ej. Coca-Cola"></div>
        <div class="row2">
          <div class="field"><label for="p-pres">Presentación</label><input id="p-pres" name="presentacion" value="${esc(d.presentacion)}" maxlength="60" placeholder="Ej. 600 ml"></div>
          <div class="field"><label for="p-precio">${d.unidad === 'kg' ? 'Precio por kilo' : 'Precio'}</label><input id="p-precio" name="precio" inputmode="decimal" value="${d.precio ?? ''}" placeholder="Vacío = por confirmar"></div>
        </div>
        <div class="row2">
          <div class="field"><label for="p-unidad">Se vende por</label><select id="p-unidad" name="unidad">
            <option value="" ${d.unidad === 'kg' ? '' : 'selected'}>Pieza</option>
            <option value="kg" ${d.unidad === 'kg' ? 'selected' : ''}>Kilo (a granel: ¼, ½, ¾, 1 kg…)</option></select></div>
          ${d.codigo ? `<div class="field"><label for="p-codigo">Código del punto de venta</label><input id="p-codigo" value="${esc(d.codigo)}" readonly>
            <p class="small muted" style="margin:6px 0 0">Al importar, el precio y la disponibilidad se toman del punto de venta.</p></div>` : ''}
        </div>
        <div class="row2">
          <div class="field"><label for="p-cat">Categoría *</label><input id="p-cat" name="categoria" value="${esc(d.categoria)}" list="dl-cat" maxlength="60" required placeholder="Elige o escribe una nueva">
            <datalist id="dl-cat">${categorias().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label for="p-marca">Marca</label><input id="p-marca" name="marca" value="${esc(d.marca)}" list="dl-marca" maxlength="60">
            <datalist id="dl-marca">${marcas().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        </div>
        <div class="field"><label for="p-desc">Descripción (opcional)</label><textarea id="p-desc" name="descripcion" maxlength="300" style="min-height:70px">${esc(d.descripcion)}</textarea></div>
      </div>
      <div class="fgroup"><h3>En el sitio</h3>
        <div class="toggles">
          ${switchHtml('disponible', d.disponible, 'Disponible', { hint: 'Apágalo cuando se acabe: sale como “Agotado”.' })}
          ${switchHtml('visible', d.visible, 'Visible en el sitio', { hint: 'Apagado, el producto no aparece.' })}
          ${switchHtml('destacado', d.destacado, 'Destacado en la portada', { hint: 'Sale en “Lo más pedido”.' })}
          ${switchHtml('es_alcohol', d.es_alcohol, 'Bebida alcohólica (+18)', { hint: 'Sale en Licores y pide confirmar mayoría de edad.' })}
        </div>
        <div class="row2" style="margin-top:14px">
          <div class="field"><label for="p-temp">Temporada</label><select id="p-temp" name="temporada"><option value="">Ninguna</option>
            ${cat.temporadas.map((t) => `<option value="${esc(t.id)}" ${t.id === d.temporada ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></div>
          <div class="field"><label for="p-orden">Orden</label><input id="p-orden" name="orden" inputmode="numeric" value="${d.orden ?? ''}" placeholder="Menor = primero"></div>
        </div>
      </div>
    </form>`;

  const d2 = drawer({
    title: nuevo ? 'Nuevo producto' : 'Editar producto',
    body,
    actions: [
      ...(nuevo ? [] : [{ label: 'Eliminar', kind: 'secondary', onClick: eliminar }]),
      'spacer',
      { label: 'Cancelar', kind: 'secondary' },
      { label: nuevo ? 'Agregar producto' : 'Guardar', busy: 'Guardando…', onClick: guardarForm }
    ]
  });
  const form = d2.el.querySelector('#pform');

  async function eliminar() {
    const ok = await confirmar(`Se borrará <b>${esc(p.nombre)}</b> del catálogo. Si solo quieres que no aparezca por ahora, mejor apaga “Visible”.`,
      { titulo: '¿Eliminar producto?', ok: 'Sí, eliminar', peligro: true });
    if (!ok) return false;
    await ctx.api('adminDeleteProduct', { id: p.id });
    cat.productos = cat.productos.filter((x) => x.id !== p.id);
    pintarContadores();
    pintarLista();
    toast('Producto eliminado');
    return true;
  }

  async function guardarForm() {
    const f = new FormData(form);
    const datos = {
      nombre: f.get('nombre'), presentacion: f.get('presentacion'), precio: String(f.get('precio') || '').replace(/[$,\s]/g, ''),
      categoria: f.get('categoria'), marca: f.get('marca'), descripcion: f.get('descripcion'), imagen: f.get('imagen'),
      temporada: f.get('temporada'), orden: f.get('orden'), unidad: f.get('unidad'),
      disponible: form.disponible.checked, visible: form.visible.checked, destacado: form.destacado.checked, es_alcohol: form.es_alcohol.checked
    };
    if (String(datos.nombre).trim().length < 2) { form.nombre.focus(); throw new Error('Escribe el nombre del producto.'); }
    if (!String(datos.categoria).trim()) { form.categoria.focus(); throw new Error('Elige o escribe una categoría.'); }
    if (datos.visible && esTabaco(datos) && !(p && p.visible)) {
      const ok = await confirmar('La ley prohíbe anunciar y promocionar productos de tabaco, también en internet. Consulta a tu asesor antes de mostrarlo.',
        { titulo: 'Aviso sobre tabaco', ok: 'Mostrar de todos modos' });
      if (!ok) return false;
    }
    if (nuevo) {
      const r = await ctx.api('adminSaveProducts', { productos: [{ nuevo: true, ...datos }] });
      cat.productos.push(r.productos[0]);
      toast('Producto agregado');
    } else {
      await guardar(p.id, datos);
      toast('Cambios guardados');
    }
    pintarContadores();
    pintarLista();
    return true;
  }

  form.addEventListener('change', async (e) => {
    if (e.target.id === 'p-unidad') {
      form.querySelector('label[for="p-precio"]').textContent = e.target.value === 'kg' ? 'Precio por kilo' : 'Precio';
      return;
    }
    if (e.target.id !== 'pfile' || !e.target.files[0]) return;
    const btn = form.querySelector('.file-btn');
    const txt = btn.firstChild.textContent;
    btn.firstChild.textContent = 'Subiendo…';
    try {
      const datos = await comprimirFoto(e.target.files[0]);
      const r = await ctx.api('adminUploadImage', { nombre: form.nombre.value || 'producto', tipo: 'image/jpeg', datos });
      form.imagen.value = r.url;
      form.querySelector('#pfoto').innerHTML = miniatura({ ...d, imagen: r.url }, 40);
      toast('Foto lista. Recuerda guardar.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.firstChild.textContent = txt;
      e.target.value = '';
    }
  });
  form.addEventListener('click', (e) => {
    if (!e.target.closest('[data-quitar-foto]')) return;
    form.imagen.value = '';
    form.querySelector('#pfoto').innerHTML = miniatura({ ...d, imagen: '' }, 40);
    e.target.remove();
  });
}

// ---------- Eventos de la lista ----------

async function onChange(e) {
  const row = e.target.closest('.prow[data-id]');
  if (!row) return;
  const sw = e.target.dataset.sw;
  if (!sw) return;
  const p = cat.productos.find((x) => x.id === row.dataset.id);
  const valor = e.target.checked;
  if (sw === 'visible' && valor && esTabaco(p)) {
    const ok = await confirmar('La ley prohíbe anunciar y promocionar productos de tabaco, también en internet. Consulta a tu asesor antes de mostrarlo.',
      { titulo: 'Aviso sobre tabaco', ok: 'Mostrar de todos modos' });
    if (!ok) { e.target.checked = false; return; }
  }
  e.target.disabled = true;
  try {
    const n = await guardar(p.id, { [sw]: valor });
    toast(sw === 'disponible' ? (valor ? `${n.nombre}: disponible` : `${n.nombre}: agotado`) : (valor ? `${n.nombre}: visible` : `${n.nombre}: oculto`));
    actualizarFila(n);
  } catch (err) {
    e.target.checked = !valor;
    e.target.disabled = false;
    toast(err.message, 'error');
  }
}

async function guardarPrecio(input) {
  const row = input.closest('.prow[data-id]');
  const p = cat.productos.find((x) => x.id === row.dataset.id);
  const texto = input.value.replace(/[$,\s]/g, '');
  const anterior = p.precio === null || p.precio === undefined ? '' : String(p.precio);
  if (texto === anterior) return;
  const caja = input.closest('.price-in');
  if (texto !== '' && !(Number(texto) >= 0)) {
    caja.classList.add('err');
    toast('Escribe solo el número, por ejemplo 31.50', 'error');
    return;
  }
  caja.classList.remove('err', 'saved');
  try {
    const n = await guardar(p.id, { precio: texto });
    caja.classList.toggle('sinprecio', n.precio === null);
    caja.classList.add('saved');
    pintarContadores();
    toast(n.precio === null ? `${n.nombre}: sin precio` : `${n.nombre}: ${money(n.precio)}`);
  } catch (err) {
    caja.classList.add('err');
    toast(err.message, 'error');
  }
}

function onClick(e) {
  const v = e.target.closest('[data-vista]');
  if (v) {
    filtro.vista = v.dataset.vista;
    limite = POR_PAGINA;
    pintarContadores();
    pintarLista();
    return;
  }
  if (e.target.closest('[data-nuevo]')) { editor(null); return; }
  if (e.target.closest('[data-importar]')) { abrirImportador(ctx, cat, recargar); return; }
  if (e.target.closest('[data-mas]')) { limite += POR_PAGINA; pintarLista(); return; }
  const row = e.target.closest('.prow[data-id]');
  if (!row) return;
  const p = cat.productos.find((x) => x.id === row.dataset.id);
  if (e.target.closest('[data-edit]')) { editor(p); return; }
  const star = e.target.closest('[data-star]');
  if (star) {
    star.disabled = true;
    guardar(p.id, { destacado: !p.destacado })
      .then((n) => { actualizarFila(n); toast(n.destacado ? `${n.nombre}: destacado en portada` : `${n.nombre}: ya no está destacado`); })
      .catch((err) => { star.disabled = false; toast(err.message, 'error'); });
  }
}

function onKey(e) {
  if (!e.target.matches('[data-precio]')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    const todos = [...main.querySelectorAll('[data-precio]')];
    const sig = todos[todos.indexOf(e.target) + 1];
    e.target.blur();
    if (sig) { sig.focus(); sig.select(); }
  }
}

function onBlur(e) {
  if (e.target.matches('[data-precio]')) guardarPrecio(e.target);
}

function opcionesCategoria() {
  return `<option value="">Todas las categorías</option>
    ${categorias().map((x) => `<option ${x === filtro.categoria ? 'selected' : ''}>${esc(x)}</option>`).join('')}`;
}

async function recargar() {
  const vista = main;
  const nuevo = await ctx.catalogo(true).catch(() => null);
  if (!nuevo || vista !== main || !main) return;
  cat = nuevo;
  limite = POR_PAGINA;
  main.querySelector('#pcat').innerHTML = opcionesCategoria();
  pintarAyuda();
  pintarContadores();
  pintarLista();
}

function pintarAyuda() {
  const conCodigo = cat.productos.some((p) => p.codigo);
  main.querySelector('#payuda').innerHTML = conCodigo
    ? '💡 Escribe el precio y presiona <b>Enter</b> para pasar al siguiente: se guarda solo. Para actualizar todos los precios, vuelve a <b>Importar</b> el catálogo del punto de venta.'
    : '📥 ¿Tienes tu catálogo en el punto de venta? Usa <b>Importar del punto de venta</b> y súbelo completo con precios y existencias. También puedes escribir el precio aquí y presionar <b>Enter</b>.';
}

export async function render(el, c, params) {
  main = el;
  ctx = c;
  cat = await ctx.catalogo();
  if (params.vista) filtro.vista = params.vista;
  limite = POR_PAGINA;
  main.innerHTML = `
    <div class="adm-toolbar">
      <label class="search"><span aria-hidden="true">🔎</span><span class="sr-only">Buscar productos</span>
        <input type="search" id="pq" placeholder="Buscar producto, marca o categoría" value="${esc(filtro.q)}"></label>
      <select id="pcat" aria-label="Filtrar por categoría">${opcionesCategoria()}</select>
      <button class="btn secondary" type="button" data-importar>📥 Importar del punto de venta</button>
      <button class="btn" type="button" data-nuevo>+ Nuevo producto</button>
    </div>
    <div class="seg" id="pvistas" role="toolbar" aria-label="Filtros"></div>
    <p class="hint-box" id="payuda"></p>
    <p class="small muted" id="pcount" aria-live="polite"></p>
    <div id="plist"></div>`;
  pintarAyuda();
  pintarContadores();
  pintarLista();
  main.addEventListener('click', onClick);
  main.addEventListener('change', onChange);
  main.addEventListener('keydown', onKey);
  main.addEventListener('focusout', onBlur);
  main.querySelector('#pq').addEventListener('input', debounce((e) => { filtro.q = e.target.value.trim(); limite = POR_PAGINA; pintarLista(); }, 200));
  main.querySelector('#pcat').addEventListener('change', (e) => { filtro.categoria = e.target.value; limite = POR_PAGINA; pintarLista(); });
}

export function salir() {
  if (!main) return;
  main.removeEventListener('click', onClick);
  main.removeEventListener('change', onChange);
  main.removeEventListener('keydown', onKey);
  main.removeEventListener('focusout', onBlur);
  main = null;
}
