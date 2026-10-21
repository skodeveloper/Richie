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
  bolsa: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'
};

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
