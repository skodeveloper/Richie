// Utilidades compartidas (sin dependencias del DOM de una página concreta).

export const TZ = 'America/Mexico_City';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const money = (n) => (n === null || n === undefined || n === '' ? 'Por confirmar' : fmt.format(Number(n)));

// Importe cuando hay productos sin precio: nunca mostrar un "$0.00" engañoso.
export function importe(monto, pendiente) {
  if (!pendiente) return money(monto);
  return Number(monto) > 0 ? `${money(monto)} + por confirmar` : 'Por confirmar';
}

// "½ kg" para granel; "2 ×" para piezas. Mismo formato que el servidor.
const FRACCIONES = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };
export function cantidadTexto(l) {
  if (l.unidad !== 'kg') return `${l.cantidad} ×`;
  const enteros = Math.floor(l.cantidad);
  const frac = FRACCIONES[Math.round((l.cantidad - enteros) * 100) / 100];
  return `${enteros ? `${enteros}${frac ? ' ' : ''}` : ''}${frac ?? ''}` + ' kg';
}

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

// ---------- Datos de la tienda y horario (editables desde el panel) ----------

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// "8:00-23:30" → [480, 1410]; "Cerrado" o inválido → null
export function parseHorario(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
}

export const horaTexto = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

export function rangoTexto(s) {
  const h = parseHorario(s);
  return h ? `${horaTexto(h[0])} a ${horaTexto(h[1])}` : 'Cerrado';
}

// Mezcla los datos fijos de config.js con lo que la tienda edita en el panel.
export function negocio(config = {}) {
  const base = window.LUNA_CONFIG.negocio;
  const tels = String(config.telefonos || '').split(',').map((t) => t.trim()).filter(Boolean);
  const semana = config.horario_semana || '8:00-23:30';
  const domingo = config.horario_domingo || '9:00-23:30';
  return {
    ...base,
    direccion: config.direccion || base.direccion,
    whatsapp: normPhone(config.whatsapp) || base.whatsapp || '',
    telefonos: tels.length
      ? tels.map((t) => ({ texto: t, tel: '+52' + (normPhone(t) || t.replace(/\D/g, '')) }))
      : base.telefonos,
    semana,
    domingo,
    horario: [
      { dias: 'Lunes a sábado', horas: rangoTexto(semana) },
      { dias: 'Domingos', horas: rangoTexto(domingo) }
    ]
  };
}

// Estado de apertura en la hora de la Ciudad de México.
export function estadoTienda(config = {}, ahora = new Date()) {
  const n = negocio(config);
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(ahora).forEach((x) => { p[x.type] = x.value; });
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  const min = Number(p.hour) * 60 + Number(p.minute);
  const rango = (d) => parseHorario(d === 0 ? n.domingo : n.semana);
  const hoy = rango(dia);
  if (hoy && min >= hoy[0] && min < hoy[1]) {
    return { abierto: true, texto: `Abierto · cierra ${horaTexto(hoy[1])}` };
  }
  if (hoy && min < hoy[0]) return { abierto: false, texto: `Cerrado · abre hoy ${horaTexto(hoy[0])}` };
  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7;
    const r = rango(d);
    if (r) return { abierto: false, texto: `Cerrado · abre ${i === 1 ? 'mañana' : 'el ' + DIAS[d]} ${horaTexto(r[0])}` };
  }
  return { abierto: false, texto: 'Cerrado' };
}
