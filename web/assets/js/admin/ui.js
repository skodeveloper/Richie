// Componentes del panel: avisos, editor lateral, confirmaciones, interruptores y fotos.
import { esc } from '../util.js';

export const NAV_ICONS = {
  pedidos: '<path d="M6 2h12l2 4v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6z"/><path d="M4 6h16M9 11h6M9 15h4"/>',
  productos: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  promociones: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  temporadas: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  opiniones: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mas: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  sitio: '<path d="M14 3h7v7M10 14 21 3M19 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
  salir: '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9"/>'
};

export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[name] || ''}</svg>`;

// ---------- Avisos ----------

let toastTimer;
export function toast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, type === 'error' ? 4500 : 2600);
}

// ---------- Interruptor ----------

export function switchHtml(name, checked, label, { hint = '', attrs = '' } = {}) {
  return `<label class="switch"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
    <input type="checkbox" role="switch" name="${name}" ${checked ? 'checked' : ''} ${attrs}></label>`;
}

// ---------- Editor lateral ----------

export function drawer({ title, body, actions = [] }) {
  const prev = document.activeElement;
  const bg = document.createElement('div');
  bg.className = 'drawer-bg';
  const el = document.createElement('section');
  el.className = 'drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<header><h2>${esc(title)}</h2><button class="x" type="button" aria-label="Cerrar" data-close>×</button></header>
    <div class="body">${body}</div>
    <footer>${actions.map((a, i) => (a === 'spacer' ? '<span class="spacer"></span>'
      : `<button class="btn ${a.kind || ''}" type="button" data-act="${i}">${esc(a.label)}</button>`)).join('')}</footer>`;
  document.body.append(bg, el);
  document.body.style.overflow = 'hidden';
  let dirty = false;
  el.addEventListener('input', () => { dirty = true; });
  const close = (force = false) => {
    if (!force && dirty && !window.confirm('Tienes cambios sin guardar. ¿Cerrar de todos modos?')) return;
    bg.remove();
    el.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    if (prev && prev.focus) prev.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', () => close());
  el.querySelector('[data-close]').addEventListener('click', () => close());
  el.querySelector('footer').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = actions[Number(b.dataset.act)];
    if (!a.onClick) { close(); return; }
    const botones = el.querySelectorAll('footer .btn');
    botones.forEach((x) => { x.disabled = true; });
    const original = b.textContent;
    if (a.busy) b.textContent = a.busy;
    try {
      const r = await a.onClick();
      if (r !== false) close(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      if (el.isConnected) {
        botones.forEach((x) => { x.disabled = false; });
        b.textContent = original;
      }
    }
  });
  const first = el.querySelector('.body input, .body select, .body textarea');
  (first || el.querySelector('[data-close]')).focus();
  return { el, close, markClean: () => { dirty = false; } };
}

// ---------- Confirmación ----------

export function confirmar(mensaje, { titulo = '¿Seguro?', ok = 'Sí, continuar', peligro = false } = {}) {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'modal';
    m.setAttribute('role', 'alertdialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML = `<div class="box"><h2>${esc(titulo)}</h2><p class="muted">${mensaje}</p>
      <div class="buttons"><button class="btn ${peligro ? 'danger' : ''}" type="button" data-ok>${esc(ok)}</button>
      <button class="btn secondary" type="button" data-no>Cancelar</button></div></div>`;
    document.body.append(m);
    const fin = (v) => { m.remove(); resolve(v); };
    m.querySelector('[data-ok]').addEventListener('click', () => fin(true));
    m.querySelector('[data-no]').addEventListener('click', () => fin(false));
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') fin(false); });
    m.querySelector('[data-no]').focus();
  });
}

// ---------- Fotos ----------

// Reduce la foto en el navegador (máx. 1000 px, JPEG) antes de subirla.
export function comprimirFoto(file, max = 1000) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error('Elige un archivo de imagen.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pudimos leer esa foto.')); };
    img.src = url;
  });
}

export const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export function vigenciaPill(estado) {
  const map = { ACTIVA: ['ok', 'Activa'], PROGRAMADA: ['info', 'Programada'], VENCIDA: ['mute', 'Vencida'], APAGADA: ['mute', 'Apagada'] };
  const [cls, txt] = map[estado] || ['mute', estado];
  return `<span class="pill ${cls}">${txt}</span>`;
}

export function fechaCorta(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
