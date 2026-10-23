// Íconos de línea por categoría para productos sin foto.
import { esc } from './util.js';

const P = window.LunaPromos;

const SVG = {
  leche: '<path d="M8 2h8v3l2 3v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8l2-3z"/><path d="M8 5h8M6 12h12"/>',
  yogurt: '<path d="M5 7h14l-1.6 13.2a1 1 0 0 1-1 .8H7.6a1 1 0 0 1-1-.8z"/><path d="M4 4h16v3H4zM9 13a3 3 0 0 0 6 0"/>',
  queso: '<path d="M3 17 14 5l7 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="9" cy="15" r="1.5"/><circle cx="15.5" cy="14" r="1"/><path d="M3 13h18"/>',
  carne: '<path d="M7 17c-3-3-3-7 0-10s7-3 10 0 3 7 0 10-7 3-10 0z"/><path d="M5 19l-2 2M19 5l2-2"/>',
  congelado: '<path d="M12 2v20M4 7l16 10M20 7 4 17"/><path d="m9 3 3 2 3-2M9 21l3-2 3 2"/>',
  licor: '<path d="M10 2h4v5l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3z"/><path d="M8 13h8v5H8z"/>',
  bebida: '<path d="M6 4h12l-1.5 16a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M6.5 9h11M14 4l2-2"/>',
  pan: '<path d="M4 13a8 6 0 0 1 16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 11c0 2 1 3 1 5M14 11c0 2 1 3 1 5"/>',
  dulce: '<circle cx="12" cy="12" r="5"/><path d="m7 12-4-3v6zM17 12l4-3v6z"/>',
  limpieza: '<path d="M9 8h6v13a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M10 8V4h5l2 2M15 4h4"/>',
  bolsa: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  cerveza: '<path d="M5 7h10v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 7a3 3 0 0 1 5-2 3 3 0 0 1 5 2M8.5 11v6M11.5 11v6"/>',
  botana: '<path d="M6 4l2 1.5L10 4l2 1.5L14 4l2 1.5L18 4v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3"/>',
  cafe: '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5c0 1.8 1.5 1.8 1.5 3.5M12 2.5c0 1.8 1.5 1.8 1.5 3.5"/>',
  lata: '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M6 5v14c0 1.1 2.7 2 6 2s6-.9 6-2V5"/><path d="M6 10c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
  granos: '<path d="M8 4h8l-1 3c3 2 5 5 5 9a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5c0-4 2-7 5-9z"/><path d="M9 7h6M10 14h4"/>',
  aceite: '<path d="M10 2h4v4l3 3v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l3-3z"/><path d="M12 12c-1.5 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.5-2-2-4z"/>',
  higiene: '<path d="M8 10h8v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/><path d="M11 10V6h2v4M9 4h5l2 2"/>',
  farmacia: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9.5 9.5 5 5"/>',
  bebe: '<path d="M9 9h6v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/><path d="M8 9h8M10 9V7a2 2 0 0 1 4 0v2M12 3v2M9 14h2M9 17h2"/>',
  mascota: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="5.8" r="1.8"/><circle cx="14.5" cy="5.8" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12.3 11c-3 0-5.5 4-5.5 6.5 0 1.5 1.2 2.5 2.7 2.2 1.1-.2 1.9-.7 2.8-.7s1.7.5 2.8.7c1.5.3 2.7-.7 2.7-2.2 0-2.5-2.5-6.5-5.5-6.5z"/>',
  varios: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  helado: '<path d="M8 10 12 22l4-12"/><path d="M7 10a5 5 0 1 1 10 0z"/>'
};

// Categorías del catálogo del punto de venta: ícono propio. En lácteos y
// salchichonería el nombre afina (leche, yogurt, queso o carnes frías).
const POR_CATEGORIA = {
  bebidas: 'bebida', cerveza: 'cerveza', 'vinos y licores': 'licor', botanas: 'botana', 'dulces y chocolates': 'dulce',
  'pan, galletas y tortillas': 'pan', 'lacteos y huevo': 'leche', 'salchichoneria y quesos': 'queso', helados: 'helado',
  'cafe, te y cereales': 'cafe', 'enlatados y salsas': 'lata', 'pastas, arroz y granos': 'granos',
  'aceites y condimentos': 'aceite', despensa: 'bolsa', 'limpieza del hogar': 'limpieza', 'higiene personal': 'higiene',
  farmacia: 'farmacia', bebe: 'bebe', mascotas: 'mascota', varios: 'varios', cigarros: 'bolsa'
};
const AFINAR = new Set(['lacteos y huevo', 'salchichoneria y quesos']);

const REGLAS = [
  ['leche', /lech|nutri|lala 100/],
  ['yogurt', /yog|postre|griego|danon|natilla|flan|gelatina/],
  ['queso', /ques|crema|philadelphia|mantequilla/],
  ['carne', /salchich|carne|jamon|tocino|chorizo/],
  ['congelado', /congel|helad|pizza/],
  ['licor', /licor|cerveza|vino|tequila|mezcal|whisk|ron|vodka|brandy|alcohol/],
  ['bebida', /bebida|refresc|jugo|agua|licuad|cafe|te /],
  ['pan', /temporada|pan|galleta|tortill/],
  ['dulce', /dulce|botana|chocolate|papas/],
  ['limpieza', /limpi|detergen|jabon|papel/]
];

const TINTES = ['#e8ecdf', '#f0e6cf', '#e3ebf0', '#efe1dc', '#e7e2ef', '#e0ede6'];

export function iconoCategoria(categoria, nombre = '') {
  const cat = P.norm(categoria);
  const propio = POR_CATEGORIA[cat];
  if (propio) {
    if (!AFINAR.has(cat) || !nombre) return propio;
    const n = P.norm(nombre);
    const fina = REGLAS.slice(0, 4).find(([, re]) => re.test(n)); // leche, yogurt, queso, carne
    return fina ? fina[0] : propio;
  }
  const t = P.norm(`${categoria} ${nombre}`);
  const regla = REGLAS.find(([, re]) => re.test(t));
  return regla ? regla[0] : 'bolsa';
}

export function tinte(categoria) {
  const s = P.norm(categoria);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TINTES[h % TINTES.length];
}

export function iconoSvg(nombre, size = 44) {
  return `<svg class="ico-cat" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[nombre] || SVG.bolsa}</svg>`;
}

// Miniatura: foto si hay, si no ícono de la categoría sobre un tinte.
export function miniatura(p, size = 44) {
  const style = `style="background:${tinte(p.categoria)}"`;
  if (p.imagen) {
    return `<span class="mini" ${style} data-icono="${iconoCategoria(p.categoria, p.nombre)}"><img src="${esc(p.imagen)}" alt="" loading="lazy"></span>`;
  }
  return `<span class="mini" ${style}>${iconoSvg(iconoCategoria(p.categoria, p.nombre), size)}</span>`;
}

// Si una foto no carga, se cambia por el ícono (sin atributos onerror: la CSP los bloquea).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const mini = img.closest('.mini');
  if (!mini) return;
  // Solo se cambia la imagen: las etiquetas (2x1, Agotado…) se conservan.
  img.insertAdjacentHTML('afterend', iconoSvg(mini.dataset.icono || 'bolsa', mini.classList.contains('thumb') ? 56 : 26));
  img.remove();
}, true);
