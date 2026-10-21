// Pedido por pasos: Tu pedido → Tus datos → Entrega → Pago → Confirmar.
// Se puede regresar a cualquier paso ya visitado o volver a la tienda a
// agregar productos sin perder nada (el carrito y los datos se guardan).
import { api, loadCatalog } from '../api.js';
import { cart } from '../cart.js';
import { renderChrome, setCatalog, getCatalog, quoteCart, productsById, toast, errorBox } from '../ui.js';
import { esc, money, qs, normPhone, isEmail, store, estadoTienda } from '../util.js';

const P = window.LunaPromos;
renderChrome('pedido.html');

const DATOS_KEY = 'luna_checkout_datos';
const MIS_PEDIDOS_KEY = 'luna_mis_pedidos';
const PASOS = ['Tu pedido', 'Tus datos', 'Entrega', 'Pago', 'Confirmar'];
const PASOS_EDICION = ['Tu pedido', 'Confirmar'];

const root = qs('#checkout');
const datos = { entrega: 'domicilio', pago: 'efectivo', ...store.get(DATOS_KEY, {}) };
let step = 0;
let maxStep = 0;
let enviando = false;
let mayorEdad = false;

const edit = () => cart.editing();
const pasos = () => (edit() ? PASOS_EDICION : PASOS);
const cfg = () => (getCatalog() && getCatalog().config) || {};
const si = (v, def = true) => (v === undefined || v === '' ? def : P.truthy(v));
const guardarDatos = () => store.set(DATOS_KEY, datos);

// ---------- Resumen lateral ----------

function summaryHtml() {
  const q = quoteCart(datos.entrega);
  if (!q || !q.lines.length) return '';
  let envio;
  if (datos.entrega === 'recoger') envio = 'Recoges en tienda';
  else if (q.envio === null) envio = 'Por confirmar';
  else envio = q.envio === 0 ? 'Gratis' : money(q.envio);
  const pend = q.preciosPendientes || q.envioPorConfirmar;
  return `<div class="panel">
    <h3>Resumen</h3>
    <dl class="totals">
      <dt>${q.piezas} ${q.piezas === 1 ? 'pieza' : 'piezas'}</dt><dd>${money(q.subtotal)}</dd>
      ${q.descuento ? `<dt>Promociones</dt><dd class="save">−${money(q.descuento)}</dd>` : ''}
      <dt>Envío</dt><dd>${esc(envio)}</dd>
      <dt class="total">Total${pend ? ' estimado' : ''}</dt><dd class="total">${money(q.total)}</dd>
    </dl>
    ${q.descuento ? `<p class="small" style="color:var(--ok);margin:12px 0 0">Ahorras ${money(q.descuento)} con promociones.</p>` : ''}
    ${pend ? `<p class="small muted" style="margin:12px 0 0">${q.preciosPendientes ? 'Algunos productos aún no tienen precio en línea. ' : ''}Te confirmamos el total por teléfono antes de entregar.</p>` : ''}
  </div>`;
}

// ---------- Pasos ----------

function stepperHtml() {
  return `<ol class="stepper" aria-label="Pasos del pedido">${pasos().map((n, i) => {
    const cls = i === step ? 'current' : i <= maxStep ? 'done' : '';
    return `<li class="${cls}"><button type="button" data-goto="${i}" ${i <= maxStep && i !== step ? '' : 'disabled'}
      ${i === step ? 'aria-current="step"' : ''}>${esc(n)}</button></li>`;
  }).join('')}</ol>`;
}

function field(name, label, { type = 'text', hint = '', attrs = '', value = datos[name] } = {}) {
  return `<div class="field" data-field="${name}">
    <label for="f-${name}">${label}</label>
    ${type === 'textarea'
      ? `<textarea id="f-${name}" name="${name}" ${attrs}>${esc(value || '')}</textarea>`
      : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${attrs}>`}
    ${hint ? `<span class="hint">${hint}</span>` : ''}
    <span class="error" hidden></span>
  </div>`;
}

function nav({ back = true, backHref = '', next = 'Continuar →', nextAttrs = '' } = {}) {
  const backBtn = backHref
    ? `<a class="btn secondary" href="${backHref}">← Seguir comprando</a>`
    : back ? '<button class="btn secondary" type="button" data-back>← Regresar</button>' : '<span></span>';
  return `<div class="step-nav">${backBtn}<button class="btn" type="submit" ${nextAttrs}>${next}</button></div>`;
}

function stepCarrito() {
  const q = quoteCart(datos.entrega);
  const e = edit();
  if (!q.lines.length && !q.faltantes.length) {
    return `<div class="empty">
      <h3>${e ? 'Tu pedido quedó vacío' : 'Tu pedido está vacío'}</h3>
      <p class="muted">Agrega productos desde la tienda; aquí los verás para revisarlos antes de enviar.</p>
      <a class="btn" href="tienda.html">Ir a la tienda</a>
      ${e ? '<p><button class="link-btn" type="button" data-cancel-edit>Cancelar la modificación</button></p>' : ''}
    </div>`;
  }
  const c = cfg();
  const pausados = c.pedidos_activos !== undefined && c.pedidos_activos !== '' && !P.truthy(c.pedidos_activos);
  const tienda = estadoTienda(c);
  const aviso = pausados
    ? `<div class="alert error" role="alert">${esc(c.mensaje_pedidos_pausados || 'Por el momento no recibimos pedidos en línea. Llámanos por teléfono.')}</div>`
    : !tienda.abierto ? `<div class="alert info closed-note"><span aria-hidden="true">🌙</span><span><b>${esc(tienda.texto)}.</b> Puedes enviar tu pedido ahora: lo atendemos en cuanto abramos.</span></div>` : '';
  return `<form class="step-panel" data-step="0" novalidate>
    <h2 tabindex="-1">${e ? `Agregar a tu pedido ${esc(e.folio)}` : 'Revisa tu pedido'}</h2>
    ${aviso}
    <p class="muted">${e ? 'Ajusta cantidades o vuelve a la tienda por más productos. Solo se puede mientras no lo confirmemos.' : 'Cambia cantidades o regresa a la tienda para agregar más. Nada se pierde.'}</p>
    ${q.faltantes.length ? `<div class="alert warn">Algunos productos ya no están disponibles y no se incluirán.
      <button class="link-btn" type="button" data-purge>Quitarlos</button></div>` : ''}
    <div>${q.lines.map((l) => `
      <div class="line">
        <div>
          <div class="name">${esc(l.nombre)}</div>
          <div class="meta">${esc(l.presentacion)}${l.precio !== null ? ` · ${money(l.precio)} c/u` : ' · Precio por confirmar'}</div>
          ${l.promo ? `<div class="promo-line">${esc(l.promo.etiqueta)} · ${esc(l.promo.titulo)}${l.descuento ? ` (−${money(l.descuento)})` : ''}</div>` : ''}
        </div>
        <div class="right">
          <div class="qty" role="group" aria-label="Cantidad de ${esc(l.nombre)}">
            <button type="button" data-dec="${esc(l.id)}" aria-label="Quitar uno">−</button>
            <output>${l.cantidad}</output>
            <button type="button" data-inc="${esc(l.id)}" aria-label="Agregar uno">+</button>
          </div>
          <strong>${l.total === null ? 'Por confirmar' : money(l.total)}</strong>
          <button class="link-btn remove" type="button" data-remove="${esc(l.id)}">Quitar</button>
        </div>
      </div>`).join('')}
    </div>
    ${e ? '<p><button class="link-btn" type="button" data-cancel-edit>Cancelar la modificación</button></p>' : ''}
    ${nav({ backHref: 'tienda.html', next: e ? 'Revisar cambios →' : 'Continuar →', nextAttrs: pausados && !e ? 'disabled' : '' })}
  </form>`;
}

function stepDatos() {
  return `<form class="step-panel" data-step="1" novalidate>
    <h2 tabindex="-1">Tus datos</h2>
    <p class="muted">Para confirmar tu pedido y avisarte cuando vaya en camino.</p>
    ${field('nombre', 'Nombre', { attrs: 'autocomplete="name" required maxlength="80"' })}
    ${field('telefono', 'Teléfono (10 dígitos)', { type: 'tel', attrs: 'autocomplete="tel" inputmode="tel" required maxlength="16"', hint: 'Te llamamos o escribimos a este número. También sirve para seguir tu pedido.' })}
    ${field('email', 'Correo electrónico (opcional)', { type: 'email', attrs: 'autocomplete="email" maxlength="120"', hint: 'Si lo dejas, te enviamos la confirmación y los cambios de estado.' })}
    ${nav()}
  </form>`;
}

function stepEntrega() {
  const c = cfg();
  const recoger = si(c.permitir_recoger);
  if (!recoger) datos.entrega = 'domicilio';
  const cobertura = String(c.colonias_cobertura || '').split(',').map((s) => s.trim()).filter(Boolean);
  const envioTxt = P.num(c.envio_costo) === null
    ? 'El costo de envío se confirma por teléfono según tu zona.'
    : `Envío ${money(P.num(c.envio_costo))}${P.num(c.envio_gratis_desde) !== null ? ` · gratis desde ${money(P.num(c.envio_gratis_desde))}` : ''}.`;
  const minimo = P.num(c.pedido_minimo);
  return `<form class="step-panel" data-step="2" novalidate>
    <h2 tabindex="-1">¿Cómo lo recibes?</h2>
    <p class="muted">${esc(envioTxt)}${minimo !== null ? ` Pedido mínimo ${money(minimo)}.` : ''}</p>
    <div class="options" role="radiogroup" aria-label="Forma de entrega">
      <label class="option"><input type="radio" name="entrega" value="domicilio" ${datos.entrega === 'domicilio' ? 'checked' : ''}>
        <span><strong>A domicilio</strong><span>Te lo llevamos. Horario de lunes a domingo hasta las 23:30.</span></span></label>
      ${recoger ? `<label class="option"><input type="radio" name="entrega" value="recoger" ${datos.entrega === 'recoger' ? 'checked' : ''}>
        <span><strong>Paso a recoger</strong><span>Estela 60, Guadalupe Tepeyac. Te avisamos cuando esté listo.</span></span></label>` : ''}
    </div>
    <div id="dom" ${datos.entrega === 'domicilio' ? '' : 'hidden'} style="margin-top:20px">
      ${field('direccion', 'Calle y número', { attrs: 'autocomplete="street-address" maxlength="200"' })}
      <div class="field" data-field="colonia">
        <label for="f-colonia">Colonia</label>
        <input id="f-colonia" name="colonia" value="${esc(datos.colonia || '')}" autocomplete="address-level3" maxlength="80" ${cobertura.length ? 'list="colonias"' : ''}>
        ${cobertura.length ? `<datalist id="colonias">${cobertura.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
          <span class="hint">Entregamos en: ${esc(cobertura.join(', '))}.</span>` : '<span class="hint">Confirmamos la cobertura al llamarte.</span>'}
        <span class="error" hidden></span>
      </div>
      ${field('referencias', 'Referencias (opcional)', { attrs: 'maxlength="200" placeholder="Entre calles, color de fachada, timbre…"' })}
    </div>
    ${nav()}
  </form>`;
}

function stepPago() {
  const c = cfg();
  const efectivo = si(c.pago_efectivo);
  const transfer = si(c.pago_transferencia);
  if (datos.pago === 'transferencia' && !transfer) datos.pago = 'efectivo';
  if (datos.pago === 'efectivo' && !efectivo && transfer) datos.pago = 'transferencia';
  return `<form class="step-panel" data-step="3" novalidate>
    <h2 tabindex="-1">¿Cómo pagas?</h2>
    <p class="muted">Pagas al recibir o con transferencia. No pedimos datos de tarjeta.</p>
    <div class="options" role="radiogroup" aria-label="Forma de pago">
      ${efectivo ? `<label class="option"><input type="radio" name="pago" value="efectivo" ${datos.pago === 'efectivo' ? 'checked' : ''}>
        <span><strong>Efectivo contra entrega</strong><span>Pagas cuando recibes tu pedido.</span></span></label>` : ''}
      ${transfer ? `<label class="option"><input type="radio" name="pago" value="transferencia" ${datos.pago === 'transferencia' ? 'checked' : ''}>
        <span><strong>Transferencia</strong><span>Te mostramos los datos bancarios al enviar tu pedido.</span></span></label>` : ''}
    </div>
    <div id="cambio" ${datos.pago === 'efectivo' ? '' : 'hidden'} style="margin-top:20px">
      ${field('paga_con', '¿Con cuánto pagas? (opcional)', { type: 'number', attrs: 'inputmode="decimal" min="0" step="1" placeholder="Ej. 500"', hint: 'Para llevarte cambio.' })}
    </div>
    ${field('notas', 'Notas para la tienda (opcional)', { type: 'textarea', attrs: 'maxlength="500" placeholder="Ej. si no hay Lala Light, cámbiala por Deslactosada"' })}
    ${nav()}
  </form>`;
}

function stepConfirmar() {
  const q = quoteCart(datos.entrega);
  const e = edit();
  const bloque = (titulo, cuerpo, goto) => `<div class="review-block"><div><strong>${titulo}</strong><p>${cuerpo}</p></div>
    ${goto !== null ? `<button class="link-btn" type="button" data-goto="${goto}">Cambiar</button>` : ''}</div>`;
  return `<form class="step-panel" data-step="${pasos().length - 1}" novalidate>
    <h2 tabindex="-1">${e ? 'Confirma los cambios' : 'Confirma tu pedido'}</h2>
    <p class="muted">Revisa que todo esté bien. Te llamaremos para confirmar disponibilidad y total.</p>
    <div id="form-error"></div>
    ${bloque('Productos', `${q.piezas} piezas · ${q.lines.length} productos`, 0)}
    ${e ? bloque('Pedido', `Folio ${esc(e.folio)}`, null) : `
      ${bloque('Contacto', `${esc(datos.nombre)} · ${esc(datos.telefono)}${datos.email ? ` · ${esc(datos.email)}` : ''}`, 1)}
      ${bloque('Entrega', datos.entrega === 'recoger' ? 'Paso a recoger a la tienda' : `${esc(datos.direccion)}, ${esc(datos.colonia)}${datos.referencias ? ` · ${esc(datos.referencias)}` : ''}`, 2)}
      ${bloque('Pago', (datos.pago === 'transferencia' ? 'Transferencia' : 'Efectivo contra entrega') + (datos.pago === 'efectivo' && datos.paga_con ? ` · pagas con ${money(datos.paga_con)}` : '') + (datos.notas ? `<br><span class="muted">Notas: ${esc(datos.notas)}</span>` : ''), 3)}`}
    ${q.contieneAlcohol ? `<label class="check" style="margin:16px 0"><input type="checkbox" id="mayor" ${mayorEdad ? 'checked' : ''} required>
      <span>Confirmo que soy mayor de 18 años y mostraré identificación al recibir las bebidas alcohólicas.</span></label>` : ''}
    <div class="hp" aria-hidden="true"><label>No llenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
    ${nav({ next: e ? 'Guardar cambios' : 'Enviar pedido', nextAttrs: enviando ? 'disabled' : '' })}
  </form>`;
}

function render(focus = true) {
  const cat = getCatalog();
  if (!cat) return;
  const vistas = edit() ? [stepCarrito, stepConfirmar] : [stepCarrito, stepDatos, stepEntrega, stepPago, stepConfirmar];
  step = Math.min(step, vistas.length - 1);
  const q = quoteCart(datos.entrega);
  if (!q.lines.length) step = 0;
  root.innerHTML = `<div class="checkout">
    <div>${q.lines.length ? stepperHtml() : ''}${vistas[step]()}</div>
    <aside class="summary" aria-label="Resumen del pedido">${summaryHtml()}</aside>
  </div>`;
  if (focus) {
    const h = root.querySelector('h2');
    if (h) h.focus({ preventScroll: true });
  }
}

function goto(i, push = true) {
  step = i;
  maxStep = Math.max(maxStep, i);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (push) history.pushState({ step: i }, '', `#paso-${i + 1}`);
}

// ---------- Validación ----------

function setError(name, msg) {
  const f = root.querySelector(`[data-field="${name}"]`);
  if (!f) return;
  f.classList.toggle('invalid', !!msg);
  const e = f.querySelector('.error');
  e.hidden = !msg;
  e.textContent = msg || '';
  const input = f.querySelector('input,textarea,select');
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function leerFormulario(form) {
  new FormData(form).forEach((v, k) => {
    if (k !== 'website') datos[k] = String(v).trim();
  });
  guardarDatos();
}

function validar(n) {
  const errores = {};
  if (n === 1) {
    if (String(datos.nombre || '').length < 2) errores.nombre = 'Escribe tu nombre.';
    if (!normPhone(datos.telefono)) errores.telefono = 'Escribe un teléfono de 10 dígitos.';
    if (datos.email && !isEmail(datos.email)) errores.email = 'Revisa tu correo o déjalo vacío.';
  }
  if (n === 2 && datos.entrega === 'domicilio') {
    if (String(datos.direccion || '').length < 5) errores.direccion = 'Escribe calle y número.';
    if (!datos.colonia) errores.colonia = 'Escribe tu colonia.';
    const cob = String(cfg().colonias_cobertura || '').split(',').map((s) => P.norm(s)).filter(Boolean);
    if (datos.colonia && cob.length && !cob.includes(P.norm(datos.colonia))) {
      errores.colonia = 'Por ahora no entregamos en esa colonia. Puedes elegir "Paso a recoger".';
    }
  }
  return errores;
}

// ---------- Envío ----------

async function enviar(form) {
  const err = qs('#form-error');
  const q = quoteCart(datos.entrega);
  if (q.contieneAlcohol && !qs('#mayor').checked) {
    err.innerHTML = errorBox('Confirma que eres mayor de 18 años para incluir bebidas alcohólicas.');
    qs('#mayor').focus();
    return;
  }
  enviando = true;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  const items = cart.items().filter((i) => productsById()[i.id]);
  const e = edit();
  try {
    let res;
    if (e) {
      res = await api.updateOrder({ folio: e.folio, telefono: e.telefono, items, mayor_edad: q.contieneAlcohol ? true : undefined });
    } else {
      res = await api.createOrder({
        ...datos,
        telefono: normPhone(datos.telefono),
        paga_con: datos.pago === 'efectivo' ? datos.paga_con : '',
        items,
        mayor_edad: q.contieneAlcohol ? true : undefined,
        website: form.website ? form.website.value : ''
      });
      const mis = store.get(MIS_PEDIDOS_KEY, []).filter((x) => x.folio !== res.folio);
      store.set(MIS_PEDIDOS_KEY, [{ folio: res.folio, telefono: normPhone(datos.telefono), fecha: res.fecha }, ...mis].slice(0, 10));
    }
    cart.clear();
    exito(res, e);
  } catch (ex) {
    enviando = false;
    btn.disabled = false;
    btn.textContent = e ? 'Guardar cambios' : 'Enviar pedido';
    err.innerHTML = errorBox(ex.message);
    err.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function exito(res, e) {
  const tel = e ? e.telefono : normPhone(datos.telefono);
  const link = `seguimiento.html?folio=${encodeURIComponent(res.folio)}&telefono=${encodeURIComponent(tel)}`;
  const c = res.cotizacion;
  history.replaceState(null, '', 'pedido.html');
  root.innerHTML = `<div class="panel success">
    <span class="moon" style="margin:auto" aria-hidden="true"></span>
    <p class="eyebrow" style="margin-top:16px">${e ? 'Cambios guardados' : '¡Pedido recibido!'}</p>
    <h2 tabindex="-1">Tu folio es</h2>
    <p class="folio">${esc(res.folio)}</p>
    <p>${e ? 'Actualizamos tu pedido.' : 'Lo estamos revisando.'} Te llamaremos al <b>${esc(tel)}</b> para confirmar disponibilidad y total${c.preciosPendientes || c.envioPorConfirmar ? ' (algunos importes se confirman por teléfono)' : ''}.</p>
    <p><strong>Total${c.preciosPendientes || c.envioPorConfirmar ? ' estimado' : ''}: ${money(c.total)}</strong></p>
    ${res.transferencia ? `<div class="alert info transfer"><strong>Datos para transferencia</strong>\n${esc(res.transferencia)}\n<span class="small">Usa tu folio ${esc(res.folio)} como concepto.</span></div>` : ''}
    <div class="step-nav" style="justify-content:center">
      <a class="btn" href="${link}">Seguir mi pedido</a>
      <a class="btn secondary" href="tienda.html">Volver a la tienda</a>
    </div>
    <p class="small muted">Guardamos tu folio en este dispositivo. También puedes buscarlo con tu teléfono.</p>
  </div>`;
  root.querySelector('h2').focus();
  window.scrollTo({ top: 0 });
}

// ---------- Eventos ----------

root.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-back]')) {
    history.back();
    return;
  }
  const g = t.closest('[data-goto]');
  if (g) {
    goto(Number(g.dataset.goto));
    return;
  }
  const r = t.closest('[data-remove]');
  if (r) {
    cart.remove(r.dataset.remove);
    toast('Producto quitado');
    return;
  }
  if (t.closest('[data-purge]')) {
    const ids = productsById();
    cart.items().forEach((i) => { if (!ids[i.id]) cart.remove(i.id); });
    return;
  }
  if (t.closest('[data-cancel-edit]')) {
    cart.clear();
    toast('Modificación cancelada');
  }
});

// Guardar mientras se escribe, para no perder nada al regresar o repintar.
root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name && t.name !== 'website' && t.type !== 'radio' && t.closest('form[data-step]')) {
    datos[t.name] = t.value.trim();
    guardarDatos();
  }
});

root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'entrega') {
    datos.entrega = t.value;
    qs('#dom').hidden = t.value !== 'domicilio';
    guardarDatos();
    root.querySelector('.summary').innerHTML = summaryHtml();
  }
  if (t.name === 'pago') {
    datos.pago = t.value;
    qs('#cambio').hidden = t.value !== 'efectivo';
    guardarDatos();
  }
  if (t.id === 'mayor') mayorEdad = t.checked;
});

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const n = Number(form.dataset.step);
  leerFormulario(form);
  const last = pasos().length - 1;
  if (n === last) {
    if (!enviando) enviar(form);
    return;
  }
  const errores = validar(n);
  root.querySelectorAll('[data-field]').forEach((f) => setError(f.dataset.field, errores[f.dataset.field]));
  const primero = Object.keys(errores)[0];
  if (primero) {
    const el = root.querySelector(`[name="${primero}"]`);
    if (el) el.focus();
    return;
  }
  goto(n + 1);
});

window.addEventListener('popstate', () => {
  const m = location.hash.match(/paso-(\d)/);
  const i = m ? Number(m[1]) - 1 : 0;
  step = Math.max(0, Math.min(i, maxStep));
  render();
});

window.addEventListener(cart.EVENT, () => {
  if (!enviando && step === 0) render(false);
  else if (!enviando) {
    const s = root.querySelector('.summary');
    if (s) s.innerHTML = summaryHtml();
  }
});

let firma = '';
loadCatalog((c) => {
  setCatalog(c);
  const f = JSON.stringify([c.productos, c.promociones, c.config]);
  if (f === firma || enviando) return;
  firma = f;
  render(false);
}).catch((e) => {
  root.innerHTML = errorBox(`No pudimos cargar el catálogo. ${e.message}`);
});
if (location.hash) history.replaceState(null, '', 'pedido.html');
