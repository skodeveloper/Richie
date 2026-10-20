// Utilidades compartidas (sin dependencias del DOM de una página concreta).

export const TZ = 'America/Mexico_City';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const money = (n) => (n === null || n === undefined || n === '' ? 'Por confirmar' : fmt.format(Number(n)));

function parts(date) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  return p;
}
export const todayMX = () => { const p = parts(new Date()); return `${p.year}-${p.month}-${p.day}`; };
export const nowMX = () => { const p = parts(new Date()); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };

export function prettyDate(s) {
  if (!s) return '';
  const [d, t] = String(s).split(' ');
  const [y, m, day] = d.split('-').map(Number);
  if (!y) return s;
  const fecha = new Date(y, m - 1, day).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return t ? `${fecha}, ${t}` : fecha;
}

export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  return d.length === 10 ? d : '';
}

export const isEmail = (v) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(String(v || ''));

export const safeUrl = (v) => (/^https:\/\/[^\s"'<>]+$/i.test(String(v || '').trim()) ? String(v).trim() : '');

export const ESTADOS = {
  RECIBIDO: { nombre: 'Recibido', desc: 'Tu pedido llegó a la tienda.' },
  CONFIRMADO: { nombre: 'Confirmado', desc: 'Revisamos disponibilidad y total.' },
  PREPARANDO: { nombre: 'En preparación', desc: 'Estamos armando tu pedido.' },
  EN_CAMINO: { nombre: 'En camino', desc: 'Tu pedido va hacia tu domicilio.' },
  LISTO_RECOGER: { nombre: 'Listo para recoger', desc: 'Pasa por él a la tienda.' },
  ENTREGADO: { nombre: 'Entregado', desc: '¡Gracias por tu compra!' },
  CANCELADO: { nombre: 'Cancelado', desc: 'Este pedido fue cancelado.' }
};

export function flujoEstados(entrega) {
  return entrega === 'recoger'
    ? ['RECIBIDO', 'CONFIRMADO', 'PREPARANDO', 'LISTO_RECOGER', 'ENTREGADO']
    : ['RECIBIDO', 'CONFIRMADO', 'PREPARANDO', 'EN_CAMINO', 'ENTREGADO'];
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* almacenamiento no disponible */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* almacenamiento no disponible */ }
  }
};
