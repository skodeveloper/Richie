// Búsqueda tolerante para miles de productos: varias palabras en cualquier
// orden ("leche lala" = "Lala Leche"), sin acentos y con singular/plural
// ("frijoles" encuentra "Frijol"). Ordena por relevancia.
const P = window.LunaPromos;

const raiz = (t) => (t.length > 4 && t.endsWith('es') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);

export const terminos = (q) => P.norm(q).split(/[^a-z0-9]+/).filter(Boolean);

const indices = new WeakMap();
function indice(p) {
  let x = indices.get(p);
  if (!x) {
    x = {
      nombre: ` ${P.norm(p.nombre).replace(/[^a-z0-9]+/g, ' ')} `,
      resto: P.norm(`${p.marca || ''} ${p.categoria || ''} ${p.presentacion || ''} ${p.codigo || ''}`)
    };
    indices.set(p, x);
  }
  return x;
}

// 0 = no coincide. Cada palabra suma más si está en el nombre y al inicio de
// una palabra; a igualdad gana donde las palabras aparecen antes en el nombre
// ("leche lala" pone "Lala Leche" antes que "Lala Arroz con Leche").
export function puntaje(p, ts) {
  const { nombre, resto } = indice(p);
  let total = 0;
  let posiciones = 0;
  for (const t of ts) {
    const r = raiz(t);
    const inicio = nombre.indexOf(` ${r}`);
    if (inicio >= 0) { total += 3; posiciones += inicio; continue; }
    const dentro = nombre.indexOf(r);
    if (dentro >= 0) { total += 2; posiciones += dentro; continue; }
    if (resto.includes(r)) { total += 1; posiciones += 60; continue; }
    return 0;
  }
  return total * 1000 - Math.min(999, posiciones);
}

export function buscar(lista, q, desempate) {
  const ts = terminos(q);
  if (!ts.length) return lista.slice().sort(desempate);
  return lista.map((p) => [p, puntaje(p, ts)]).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || desempate(a[0], b[0])).map(([p]) => p);
}
