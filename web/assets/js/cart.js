// Carrito guardado en el navegador. Persiste entre páginas y pestañas, así el
// cliente puede ir y volver a la tienda para agregar productos.
import { store } from './util.js';

const KEY = 'luna_carrito_v1';
const EVENT = 'luna:cart';

function read() {
  const c = store.get(KEY, null);
  return c && c.items && typeof c.items === 'object' ? c : { items: {}, edit: null };
}

function write(c) {
  store.set(KEY, c);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const cart = {
  EVENT,
  qty: (id) => read().items[id] || 0,
  // Acepta cuartos de kilo para granel; la cotización valida según la unidad.
  set(id, n) {
    const c = read();
    const q = Math.max(0, Math.min(99, Math.round((Number(n) || 0) * 100) / 100));
    if (q) c.items[id] = q;
    else delete c.items[id];
    write(c);
  },
  add(id, n = 1) {
    this.set(id, this.qty(id) + n);
  },
  remove(id) {
    this.set(id, 0);
  },
  items: () => Object.entries(read().items).map(([id, cantidad]) => ({ id, cantidad })),
  // Un producto a granel cuenta como 1 aunque se pidan fracciones de kilo.
  count: () => Object.values(read().items).reduce((a, b) => a + (Number.isInteger(b) ? b : 1), 0),
  clear: () => write({ items: {}, edit: null }),
  // Modo "agregar a un pedido ya enviado": el carrito arranca con lo pedido.
  editing: () => read().edit,
  startEdit(folio, telefono, items) {
    write({ items: Object.fromEntries(items.map((i) => [i.id, i.cantidad])), edit: { folio, telefono } });
  }
};

window.addEventListener('storage', (e) => {
  if (e.key === KEY) window.dispatchEvent(new CustomEvent(EVENT));
});
