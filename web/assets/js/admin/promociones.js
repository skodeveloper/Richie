// Sección Promociones: tarjetas con estado y editor guiado con vista previa.
import { esc, money } from '../util.js';
import { toast, drawer, confirmar, switchHtml, vigenciaPill, fechaCorta } from './ui.js';
import { selectorProductos, leerSeleccion } from './selector.js';

const P = window.LunaPromos;
let main;
let ctx;
let cat;

const TIPOS = [
  ['NXM', 'Lleva y paga', '2x1, 3x2…'],
  ['PORCENTAJE', '% de descuento', 'Ej. 10% menos'],
  ['PRECIO_ESPECIAL', 'Precio especial', 'Ej. a $79 la pieza'],
  ['DESCUENTO_PIEZA', '$ menos por pieza', 'Ej. $5 menos c/u']
];

function aplicaTexto(promo) {
  const t = String(promo.aplica_a || '');
  if (t.trim() === '*') return 'Toda la tienda';
  if (/^cat:/i.test(t)) return `Categoría ${t.slice(4)}`;
  if (/^marca:/i.test(t)) return `Marca ${t.slice(6)}`;
  const n = t.split(',').filter(Boolean).length;
  return `${n} ${n === 1 ? 'producto' : 'productos'}`;
}

function tarjeta(p) {
  return `<article class="pcard" data-id="${esc(p.id)}">
    <div class="top"><span class="big">${esc(P.label(p))}</span>${vigenciaPill(p.estado)}</div>
    <h3>${esc(p.titulo)}</h3>
    <div class="meta">Aplica a: <b>${esc(aplicaTexto(p))}</b><br>
      ${p.inicio || p.fin ? `${p.inicio ? `Del ${esc(fechaCorta(p.inicio))}` : 'Desde hoy'} ${p.fin ? `al ${esc(fechaCorta(p.fin))}` : 'sin fecha de fin'}` : 'Sin fechas: vigente mientras esté activa'}</div>
    <div class="foot">${switchHtml('activa', p.activa, '<span class="small">Activa</span>', { attrs: 'data-activa' })}
      <button class="btn small secondary" type="button" data-edit>Editar</button></div>
  </article>`;
}

function pintar() {
  const lista = main.querySelector('#plist');
  const orden = { ACTIVA: 0, PROGRAMADA: 1, APAGADA: 2, VENCIDA: 3 };
  const promos = cat.promociones.slice().sort((a, b) => orden[a.estado] - orden[b.estado] || a.titulo.localeCompare(b.titulo, 'es'));
  lista.innerHTML = promos.length
    ? `<div class="cards-grid">${promos.map(tarjeta).join('')}</div>`
    : '<div class="adm-empty"><h3>Aún no tienes promociones</h3><p>Crea una con “Nueva promoción”. Se aplican solas en el carrito de tus clientes.</p></div>';
}

function guardarLocal(promo) {
  const i = cat.promociones.findIndex((x) => x.id === promo.id);
  if (i >= 0) cat.promociones[i] = promo;
  else cat.promociones.push(promo);
}

function payload(p) {
  return {
    id: p.id, titulo: p.titulo, descripcion: p.descripcion, tipo: p.tipo, valor: p.valor ?? '', lleva: p.lleva ?? '', paga: p.paga ?? '',
    aplica_a: p.aplica_a, inicio: p.inicio || '', fin: p.fin || '', activa: p.activa, imagen: p.imagen || ''
  };
}

function editor(promo) {
  const nueva = !promo;
  const d = promo || { titulo: '', descripcion: '', tipo: 'NXM', valor: null, lleva: 2, paga: 1, aplica_a: '', inicio: '', fin: '', activa: true };
  const aplica = String(d.aplica_a || '');
  const modo = !aplica ? 'productos' : aplica.trim() === '*' ? 'todo' : /^cat:/i.test(aplica) ? 'categoria' : /^marca:/i.test(aplica) ? 'marca' : 'productos';
  const cats = [...new Set(cat.productos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es'));
  const marcas = [...new Set(cat.productos.map((p) => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const ids = modo === 'productos' ? aplica.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const body = `<form id="prform" novalidate>
    <div class="fgroup"><h3>Promoción</h3>
      <div class="field"><label for="pr-tit">Título *</label><input id="pr-tit" name="titulo" value="${esc(d.titulo)}" maxlength="100" placeholder="Ej. 2x1 en Danonino"></div>
      <div class="field"><label for="pr-desc">Descripción (opcional)</label><input id="pr-desc" name="descripcion" value="${esc(d.descripcion)}" maxlength="300" placeholder="Ej. Llévate 2 y paga 1"></div>
    </div>
    <div class="fgroup"><h3>Tipo de descuento</h3>
      <div class="type-opts" role="radiogroup">${TIPOS.map(([v, t, s]) => `<label class="option"><input type="radio" name="tipo" value="${v}" ${d.tipo === v ? 'checked' : ''}>
        <span><strong>${t}</strong><span>${s}</span></span></label>`).join('')}</div>
      <div class="row2" style="margin-top:14px" data-tipo="NXM">
        <div class="field"><label for="pr-lleva">Lleva</label><input id="pr-lleva" name="lleva" inputmode="numeric" value="${d.lleva ?? 2}"></div>
        <div class="field"><label for="pr-paga">Paga</label><input id="pr-paga" name="paga" inputmode="numeric" value="${d.paga ?? 1}"></div>
      </div>
      <div class="field" style="margin-top:14px" data-tipo="PORCENTAJE PRECIO_ESPECIAL DESCUENTO_PIEZA">
        <label for="pr-valor" id="pr-valor-l">Valor</label><input id="pr-valor" name="valor" inputmode="decimal" value="${d.valor ?? ''}"></div>
    </div>
    <div class="fgroup"><h3>¿A qué productos aplica?</h3>
      <div class="options" role="radiogroup">
        ${[['productos', 'Productos específicos'], ['categoria', 'Toda una categoría'], ['marca', 'Toda una marca'], ['todo', 'Toda la tienda']]
          .map(([v, t]) => `<label class="option" style="padding:10px 14px"><input type="radio" name="modo" value="${v}" ${modo === v ? 'checked' : ''}><span><strong>${t}</strong></span></label>`).join('')}
      </div>
      <div class="field" style="margin-top:14px" data-modo="categoria"><label for="pr-cat">Categoría</label>
        <select id="pr-cat" name="cat">${cats.map((c) => `<option ${modo === 'categoria' && P.norm(aplica.slice(4)) === P.norm(c) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field" style="margin-top:14px" data-modo="marca"><label for="pr-marca">Marca</label>
        <select id="pr-marca" name="marca">${marcas.map((c) => `<option ${modo === 'marca' && P.norm(aplica.slice(6)) === P.norm(c) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div style="margin-top:14px" data-modo="productos">${selectorProductos(cat.productos, ids)}</div>
    </div>
    <div class="fgroup"><h3>Vigencia</h3>
      <div class="row2">
        <div class="field"><label for="pr-ini">Desde (opcional)</label><input id="pr-ini" type="date" name="inicio" value="${esc(d.inicio)}"></div>
        <div class="field"><label for="pr-fin">Hasta (opcional)</label><input id="pr-fin" type="date" name="fin" value="${esc(d.fin)}"></div>
      </div>
      <div class="toggles">${switchHtml('activa', d.activa, 'Promoción activa', { hint: 'Apágala para pausarla sin borrarla.' })}</div>
    </div>
    <div class="preview-box" id="pr-prev" aria-live="polite"></div>
  </form>`;

  const dr = drawer({
    title: nueva ? 'Nueva promoción' : 'Editar promoción',
    body,
    actions: [
      ...(nueva ? [] : [{ label: 'Eliminar', kind: 'secondary', onClick: eliminar }]),
      'spacer',
      { label: 'Cancelar', kind: 'secondary' },
      { label: nueva ? 'Crear promoción' : 'Guardar', busy: 'Guardando…', onClick: guardar }
    ]
  });
  const form = dr.el.querySelector('#prform');

  function leer() {
    const f = new FormData(form);
    const m = f.get('modo');
    const aplicaA = m === 'todo' ? '*' : m === 'categoria' ? `cat:${f.get('cat') || ''}` : m === 'marca' ? `marca:${f.get('marca') || ''}` : leerSeleccion(form).join(',');
    return {
      id: promo ? promo.id : undefined, titulo: String(f.get('titulo') || '').trim(), descripcion: f.get('descripcion'), tipo: f.get('tipo'),
      valor: P.num(f.get('valor')), lleva: P.num(f.get('lleva')), paga: P.num(f.get('paga')), aplica_a: aplicaA,
      inicio: f.get('inicio'), fin: f.get('fin'), activa: form.activa.checked
    };
  }

  function refrescar() {
    const p = leer();
    form.querySelectorAll('[data-tipo]').forEach((el) => { el.hidden = !el.dataset.tipo.split(' ').includes(p.tipo); });
    form.querySelectorAll('[data-modo]').forEach((el) => { el.hidden = el.dataset.modo !== form.modo.value; });
    const lbl = { PORCENTAJE: 'Porcentaje de descuento (%)', PRECIO_ESPECIAL: 'Nuevo precio por pieza ($)', DESCUENTO_PIEZA: 'Pesos de descuento por pieza ($)' }[p.tipo];
    if (lbl) form.querySelector('#pr-valor-l').textContent = lbl;
    const afectados = cat.productos.filter((x) => P.matches(p, x));
    const ejemplo = afectados.find((x) => x.precio !== null && x.precio !== undefined);
    const completo = p.tipo === 'NXM' ? p.lleva !== null && p.paga !== null : p.valor !== null;
    let txt = `Etiqueta: <b>${completo ? esc(P.label(p)) : '—'}</b> · aplica a <b>${afectados.length}</b> ${afectados.length === 1 ? 'producto' : 'productos'}.`;
    if (ejemplo && completo) {
      const cant = p.tipo === 'NXM' ? (p.lleva || 2) : 1;
      const d2 = P.lineDiscount(p, ejemplo.precio, cant);
      txt += `<br>Ejemplo: ${cant} × ${esc(ejemplo.nombre)} = ${money(ejemplo.precio * cant)} → <b>${money(ejemplo.precio * cant - d2)}</b>`;
    } else if (afectados.length) {
      txt += '<br>Ninguno de esos productos tiene precio todavía: el descuento se verá cuando les pongas precio.';
    }
    form.querySelector('#pr-prev').innerHTML = txt;
  }

  async function guardar() {
    const p = leer();
    if (p.titulo.length < 3) { form.titulo.focus(); throw new Error('Escribe un título para la promoción.'); }
    if (form.modo.value === 'productos' && !p.aplica_a) throw new Error('Marca al menos un producto.');
    const r = await ctx.api('adminSavePromo', { promo: payload(p) });
    guardarLocal(r.promo);
    pintar();
    toast(nueva ? 'Promoción creada' : 'Promoción guardada');
    return true;
  }

  async function eliminar() {
    const ok = await confirmar(`Se borrará <b>${esc(promo.titulo)}</b>. Si solo quieres pausarla, apaga “Activa”.`, { titulo: '¿Eliminar promoción?', ok: 'Sí, eliminar', peligro: true });
    if (!ok) return false;
    await ctx.api('adminDeletePromo', { id: promo.id });
    cat.promociones = cat.promociones.filter((x) => x.id !== promo.id);
    pintar();
    toast('Promoción eliminada');
    return true;
  }

  form.addEventListener('input', refrescar);
  form.addEventListener('change', refrescar);
  refrescar();
}

async function onChange(e) {
  if (!e.target.matches('[data-activa]')) return;
  const card = e.target.closest('[data-id]');
  const p = cat.promociones.find((x) => x.id === card.dataset.id);
  e.target.disabled = true;
  try {
    const r = await ctx.api('adminSavePromo', { promo: payload({ ...p, activa: e.target.checked }) });
    guardarLocal(r.promo);
    pintar();
    toast(r.promo.activa ? 'Promoción activada' : 'Promoción pausada');
  } catch (err) {
    e.target.checked = !e.target.checked;
    e.target.disabled = false;
    toast(err.message, 'error');
  }
}

function onClick(e) {
  if (e.target.closest('[data-nueva]')) { editor(null); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) editor(cat.promociones.find((x) => x.id === ed.closest('[data-id]').dataset.id));
}

export async function render(el, c) {
  main = el;
  ctx = c;
  cat = await ctx.catalogo();
  main.innerHTML = `<div class="adm-toolbar"><p class="muted" style="margin:0;flex:1">Se aplican solas en el carrito. Si un producto tiene varias, se usa la que más le conviene al cliente.</p>
    <button class="btn" type="button" data-nueva>+ Nueva promoción</button></div><div id="plist"></div>`;
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
