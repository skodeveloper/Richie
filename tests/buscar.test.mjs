// Buscador de la tienda: palabras en cualquier orden, plurales y relevancia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

globalThis.window = { LunaPromos: createRequire(import.meta.url)('../shared/promos.js') };
const { buscar, terminos } = await import('../web/assets/js/buscar.js');

const prod = (id, nombre, extra = {}) => ({ id, nombre, marca: '', categoria: 'Despensa', presentacion: '', ...extra });
const lista = [
  prod('a', 'Dulce de Leche Coronado', { categoria: 'Dulces y chocolates' }),
  prod('b', 'Lala Leche Entera', { marca: 'Lala', categoria: 'Lácteos y huevo' }),
  prod('c', 'Frijol Negro Granel'),
  prod('d', 'Yoghurt Lala Fresa', { marca: 'Lala', categoria: 'Lácteos y huevo' }),
  prod('e', 'Jabón Zote Rosa', { codigo: '7501026005787' })
];
const ids = (r) => r.map((p) => p.id);
const orden = (a, b) => a.id.localeCompare(b.id);

test('varias palabras en cualquier orden y sin acentos', () => {
  assert.deepEqual(ids(buscar(lista, 'leche lala', orden)), ['b']);
  assert.deepEqual(ids(buscar(lista, 'jabon', orden)), ['e']);
  assert.deepEqual(terminos('  Lála,  LECHE '), ['lala', 'leche']);
});

test('plural encuentra singular', () => {
  assert.deepEqual(ids(buscar(lista, 'frijoles', orden)), ['c']);
});

test('relevancia: el nombre pesa más que la marca o la categoría', () => {
  // Ambos tienen "leche" en el nombre; gana donde aparece antes.
  assert.deepEqual(ids(buscar(lista, 'leche', orden)), ['b', 'a']);
  assert.deepEqual(ids(buscar([lista[0], prod('f', 'Lala Arroz Con Leche', { marca: 'Lala' }), lista[1]], 'leche lala', orden)), ['b', 'f']);
  assert.deepEqual(ids(buscar(lista, 'lala', orden)), ['b', 'd']);
  assert.deepEqual(ids(buscar(lista, 'lacteos', orden)), ['b', 'd']);
});

test('código de barras y búsqueda vacía', () => {
  assert.deepEqual(ids(buscar(lista, '7501026', orden)), ['e']);
  assert.equal(buscar(lista, '', orden).length, lista.length);
  assert.deepEqual(ids(buscar(lista, 'xyz', orden)), []);
});
