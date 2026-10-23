// Sección Ajustes: todo lo que antes vivía en la hoja Config, en un formulario.
import { esc, normPhone, parseHorario } from '../util.js';
import { toast, switchHtml, confirmar } from './ui.js';
import { resetDemo } from '../demo-api.js';

let main;
let ctx;
let cat;
let original = {};

const SI = (v) => v === '' || v === undefined ? true : /^s/i.test(String(v)) || v === true;
const dos = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function horarioCampos(clave, etiqueta, valor) {
  const h = parseHorario(valor);
  return `<div class="field" data-horario="${clave}"><span class="label">${etiqueta}</span>
    <div class="time-row">
      <input type="time" data-h="abre" value="${h ? dos(h[0]) : '08:00'}" aria-label="${etiqueta}: abre" ${h ? '' : 'disabled'}>
      <span>a</span>
      <input type="time" data-h="cierra" value="${h ? dos(h[1]) : '22:00'}" aria-label="${etiqueta}: cierra" ${h ? '' : 'disabled'}>
      <label class="check" style="margin-left:6px"><input type="checkbox" data-h="cerrado" ${h ? '' : 'checked'}><span>Cerrado</span></label>
    </div></div>`;
}

function monto(clave, etiqueta, hint) {
  const v = cat.config[clave];
  return `<div class="field"><label for="a-${clave}">${etiqueta}</label>
    <div class="price-in"><span>$</span><input id="a-${clave}" name="${clave}" inputmode="decimal" value="${esc(v ?? '')}" placeholder="Vacío = ${esc(hint)}"></div></div>`;
}

function leer() {
  const f = main && main.querySelector('#aform');
  const v = {};
  if (!f) return v;
  f.querySelectorAll('input[name], textarea[name]').forEach((el) => {
    v[el.name] = el.type === 'checkbox' ? (el.checked ? 'SI' : 'NO') : el.value.trim();
  });
  v.colonias_cobertura = [...f.querySelectorAll('[data-colonia]')].map((c) => c.dataset.colonia).join(', ');
  f.querySelectorAll('[data-horario]').forEach((h) => {
    const cerrado = h.querySelector('[data-h="cerrado"]').checked;
    v[h.dataset.horario] = cerrado ? 'Cerrado' : `${h.querySelector('[data-h="abre"]').value}-${h.querySelector('[data-h="cierra"]').value}`;
  });
  return v;
}

function cambios() {
  const v = leer();
  const out = {};
  Object.keys(v).forEach((k) => {
    const antes = original[k] === undefined || original[k] === null ? '' : String(original[k]);
    if (String(v[k]) !== antes) out[k] = v[k];
  });
  return out;
}

function marcar() {
  const n = Object.keys(cambios()).length;
  const bar = main.querySelector('#savebar');
  bar.classList.toggle('show', n > 0);
  bar.querySelector('span').textContent = n === 1 ? '1 cambio sin guardar' : `${n} cambios sin guardar`;
}

function chip(c) {
  return `<span class="chip" data-colonia="${esc(c)}">${esc(c)}<button type="button" aria-label="Quitar ${esc(c)}" data-quitar>×</button></span>`;
}

function pintar() {
  const c = cat.config;
  original = { ...c };
  const colonias = String(c.colonias_cobertura || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Normalizar el original a como lo escribe el formulario, para no marcar cambios falsos.
  ['email_cliente', 'notificar_comentarios', 'pedidos_activos', 'permitir_recoger', 'pago_efectivo', 'pago_transferencia']
    .forEach((k) => { original[k] = SI(c[k]) ? 'SI' : 'NO'; });
  original.colonias_cobertura = colonias.join(', ');
  ['horario_semana', 'horario_domingo'].forEach((k) => {
    const h = parseHorario(c[k]);
    original[k] = h ? `${dos(h[0])}-${dos(h[1])}` : 'Cerrado';
  });

  main.innerHTML = `<form id="aform" novalidate>
    <section class="adm-card"><h2>Recepción de pedidos</h2>
      <p class="muted">Pausa los pedidos en línea en vacaciones, inventario o días de ley seca. El sitio sigue visible.</p>
      <div class="toggles">${switchHtml('pedidos_activos', SI(c.pedidos_activos), '<b>Recibir pedidos en línea</b>')}</div>
      <div class="field" style="margin-top:14px"><label for="a-msg">Mensaje cuando están pausados</label>
        <input id="a-msg" name="mensaje_pedidos_pausados" value="${esc(c.mensaje_pedidos_pausados || '')}" maxlength="300"></div>
    </section>

    <section class="adm-card"><h2>Entrega a domicilio</h2>
      <p class="muted">Deja vacío lo que prefieras confirmar por teléfono.</p>
      <div class="set-grid">
        ${monto('envio_costo', 'Costo de envío', 'se confirma por teléfono')}
        ${monto('envio_gratis_desde', 'Envío gratis desde', 'no aplica')}
        ${monto('pedido_minimo', 'Pedido mínimo', 'sin mínimo')}
      </div>
      <div class="field"><label for="a-col">Colonias donde entregas</label>
        <div class="chips-in" id="chips">${colonias.map(chip).join('')}
          <input id="a-col" placeholder="Escribe una colonia y presiona Enter" autocomplete="off"></div>
        <span class="hint">Si no agregas ninguna, se acepta cualquier colonia y confirmas la cobertura por teléfono.</span></div>
      <div class="toggles">${switchHtml('permitir_recoger', SI(c.permitir_recoger), 'Permitir “Paso a recoger”', { hint: 'El cliente puede recoger su pedido en la tienda.' })}</div>
    </section>

    <section class="adm-card"><h2>Formas de pago</h2>
      <div class="toggles" style="margin-bottom:14px">
        ${switchHtml('pago_efectivo', SI(c.pago_efectivo), 'Efectivo contra entrega')}
        ${switchHtml('pago_transferencia', SI(c.pago_transferencia), 'Transferencia')}
      </div>
      <div class="field"><label for="a-tr">Datos para transferencia</label>
        <textarea id="a-tr" name="transferencia_datos" maxlength="600" placeholder="Banco, titular y CLABE">${esc(c.transferencia_datos || '')}</textarea>
        <span class="hint">El cliente los ve al terminar su pedido si elige transferencia.</span></div>
    </section>

    <section class="adm-card"><h2>Datos de la tienda</h2>
      <p class="muted">Se muestran en el sitio: encabezado, pie de página y contacto.</p>
      <div class="set-grid">
        <div class="field"><label for="a-tel">Teléfonos (separados por coma)</label><input id="a-tel" name="telefonos" value="${esc(c.telefonos || '')}"></div>
        <div class="field"><label for="a-wa">WhatsApp (10 dígitos)</label><input id="a-wa" name="whatsapp" inputmode="tel" value="${esc(c.whatsapp || '')}" placeholder="Vacío = no se muestra el botón"></div>
      </div>
      <div class="field"><label for="a-dir">Dirección</label><input id="a-dir" name="direccion" value="${esc(c.direccion || '')}"></div>
      ${horarioCampos('horario_semana', 'Lunes a sábado', c.horario_semana)}
      ${horarioCampos('horario_domingo', 'Domingo', c.horario_domingo)}
    </section>

    <section class="adm-card"><h2>Avisos en el sitio</h2>
      <div class="field"><label for="a-aviso">Aviso general (franja arriba del sitio)</label>
        <input id="a-aviso" name="aviso_general" value="${esc(c.aviso_general || '')}" maxlength="300" placeholder="Ej. Hoy cerramos a las 20:00. Vacío = sin aviso"></div>
      <div class="field"><label for="a-alc">Aviso en la sección de licores</label>
        <textarea id="a-alc" name="aviso_alcohol" maxlength="600">${esc(c.aviso_alcohol || '')}</textarea></div>
    </section>

    <section class="adm-card"><h2>Correos</h2>
      <div class="field"><label for="a-mail">Correo que recibe los pedidos nuevos</label>
        <input id="a-mail" name="email_notificacion" type="email" value="${esc(c.email_notificacion || '')}" placeholder="tienda@gmail.com"></div>
      <div class="toggles">
        ${switchHtml('email_cliente', SI(c.email_cliente), 'Enviar correos al cliente', { hint: 'Confirmación y avisos de avance, si dejó su correo.' })}
        ${switchHtml('notificar_comentarios', SI(c.notificar_comentarios), 'Avisarme de opiniones nuevas')}
      </div>
    </section>

    <details class="adm-card"><summary style="cursor:pointer;font-weight:700">Avanzado</summary>
      <div class="field" style="margin-top:14px"><label for="a-nom">Nombre de la tienda (en correos)</label><input id="a-nom" name="tienda_nombre" value="${esc(c.tienda_nombre || '')}"></div>
      <div class="field"><label for="a-url">Dirección del sitio</label><input id="a-url" name="sitio_url" value="${esc(c.sitio_url || '')}" placeholder="https://"></div>
      <div class="field"><label for="a-crm">Webhook de CRM externo (Zapier, Make…)</label><input id="a-crm" name="crm_webhook_url" value="${esc(c.crm_webhook_url || '')}" placeholder="https://"></div>
    </details>

    <div class="savebar" id="savebar"><span></span><div style="display:flex;gap:8px">
      <button class="btn small secondary" type="button" data-descartar style="color:var(--cream);border-color:rgba(247,244,233,.5)">Descartar</button>
      <button class="btn small gold" type="submit">Guardar cambios</button></div></div>
  </form>

  <form class="adm-card" id="pwform" novalidate><h2>Contraseña del panel</h2>
    <p class="muted">Al cambiarla se cierran las sesiones abiertas en otros dispositivos.</p>
    <div class="set-grid">
      <div class="field"><label for="pw-a">Contraseña actual</label><input id="pw-a" type="password" autocomplete="current-password"></div>
      <span></span>
      <div class="field"><label for="pw-n">Nueva contraseña (mínimo 8)</label><input id="pw-n" type="password" autocomplete="new-password" minlength="8"></div>
      <div class="field"><label for="pw-c">Repite la nueva</label><input id="pw-c" type="password" autocomplete="new-password"></div>
    </div>
    <button class="btn secondary" type="submit">Cambiar contraseña</button>
  </form>
  ${ctx.demo ? `<section class="adm-card"><h2>Modo demostración</h2><p class="muted">Borra los pedidos y cambios de prueba de este navegador y vuelve a los datos de ejemplo.</p>
    <button class="btn secondary" type="button" data-reset>Restablecer demostración</button></section>` : ''}`;
}

async function guardar(e) {
  e.preventDefault();
  const c = cambios();
  if (!Object.keys(c).length) return;
  if (c.whatsapp && !normPhone(c.whatsapp)) { toast('El WhatsApp debe tener 10 dígitos.', 'error'); return; }
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const r = await ctx.api('adminSaveConfig', { config: c });
    cat.config = r.config;
    pintar();
    ctx.actualizarEstadoTienda();
    toast('Ajustes guardados. El sitio ya los muestra.');
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
  }
}

async function cambiarPassword(e) {
  e.preventDefault();
  const f = e.target;
  const [a, n, c] = ['#pw-a', '#pw-n', '#pw-c'].map((s) => f.querySelector(s).value);
  if (n.length < 8) { toast('La nueva contraseña debe tener al menos 8 caracteres.', 'error'); return; }
  if (n !== c) { toast('Las contraseñas nuevas no coinciden.', 'error'); return; }
  try {
    const r = await ctx.api('adminChangePassword', { actual: a, nueva: n });
    try { sessionStorage.setItem('luna_admin_token', r.token); } catch (err) { /* sin almacenamiento */ }
    f.reset();
    toast('Contraseña actualizada');
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function onKey(e) {
  if (e.target.id !== 'a-col' || e.key !== 'Enter') return;
  e.preventDefault();
  const v = e.target.value.trim().replace(/,/g, '');
  if (!v) return;
  const existe = [...main.querySelectorAll('[data-colonia]')].some((x) => x.dataset.colonia.toLowerCase() === v.toLowerCase());
  if (!existe) e.target.insertAdjacentHTML('beforebegin', chip(v));
  e.target.value = '';
  marcar();
}

async function onClick(e) {
  if (e.target.closest('[data-quitar]')) { e.target.closest('.chip').remove(); marcar(); return; }
  if (e.target.closest('[data-descartar]')) { pintar(); return; }
  if (e.target.closest('[data-reset]')) {
    if (await confirmar('Se borrarán los pedidos, opiniones y cambios de prueba de este navegador.', { titulo: '¿Restablecer demostración?', ok: 'Sí, restablecer' })) {
      resetDemo();
      sessionStorage.clear();
      location.reload();
    }
  }
}

function onChange(e) {
  const h = e.target.closest('[data-horario]');
  if (h && e.target.dataset.h === 'cerrado') h.querySelectorAll('input[type=time]').forEach((t) => { t.disabled = e.target.checked; });
  if (e.target.closest('#aform')) marcar();
}

export async function render(el, c) {
  main = el;
  ctx = c;
  cat = await ctx.catalogo();
  pintar();
  main.addEventListener('input', onChange);
  main.addEventListener('change', onChange);
  main.addEventListener('keydown', onKey);
  main.addEventListener('click', onClick);
  main.addEventListener('submit', onSubmit);
}

function onSubmit(e) {
  if (e.target.id === 'aform') guardar(e);
  if (e.target.id === 'pwform') cambiarPassword(e);
}

export function salir() {
  if (main && Object.keys(cambios()).length) toast('Se descartaron los ajustes sin guardar.');
  main = null;
}
