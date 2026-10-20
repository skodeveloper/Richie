import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const P = require('../shared/promos.js');

const prods = {
  leche: { id: 'leche', nombre: 'Leche', categoria: 'Leche', marca: 'Lala', precio: 30 },
  yog: { id: 'yog', nombre: 'Yogurt', categoria: 'Yogurt y postres', marca: 'Danone', precio: 14 },
  sinprecio: { id: 'sinprecio', nombre: 'Queso', categoria: 'Quesos', marca: '', precio: null },
  cerveza: { id: 'cerveza', nombre: 'Cerveza', categoria: 'Licores', marca: '', precio: 22, es_alcohol: true }
};
const promo = (o) => ({ id: 'p', titulo: 'P', activa: 'SI', inicio: '', fin: '', ...o });

test('vigencia por fechas y bandera activa', () => {
  const p = promo({ tipo: 'PORCENTAJE', valor: 10, aplica_a: '*', inicio: '2026-10-01', fin: '2026-10-31' });
  assert.equal(P.isActive(p, '2026-10-20'), true);
  assert.equal(P.isActive(p, '2026-11-01'), false);
  assert.equal(P.isActive(p, '2026-09-30'), false);
  assert.equal(P.isActive({ ...p, activa: 'NO' }, '2026-10-20'), false);
  assert.equal(P.isActive({ ...p, tipo: 'RARO' }, '2026-10-20'), false);
});

test('aplica_a: id, cat:, marca: y * sin importar acentos ni mayúsculas', () => {
  assert.ok(P.matches(promo({ aplica_a: 'LECHE' }), prods.leche));
  assert.ok(P.matches(promo({ aplica_a: 'cat:yogurt y postres' }), prods.yog));
  assert.ok(P.matches(promo({ aplica_a: 'marca:Dánone' }), prods.yog));
  assert.ok(P.matches(promo({ aplica_a: '*' }), prods.yog));
  assert.ok(!P.matches(promo({ aplica_a: 'cat:Leche' }), prods.yog));
});

test('descuentos por tipo', () => {
  assert.equal(P.lineDiscount(promo({ tipo: 'PORCENTAJE', valor: 10 }), 30, 3), 9);
  assert.equal(P.lineDiscount(promo({ tipo: 'PRECIO_ESPECIAL', valor: 25 }), 30, 2), 10);
  assert.equal(P.lineDiscount(promo({ tipo: 'PRECIO_ESPECIAL', valor: 35 }), 30, 2), 0);
  assert.equal(P.lineDiscount(promo({ tipo: 'DESCUENTO_PIEZA', valor: 5 }), 30, 4), 20);
  assert.equal(P.lineDiscount(promo({ tipo: 'NXM', lleva: 2, paga: 1 }), 14, 5), 28);
  assert.equal(P.lineDiscount(promo({ tipo: 'NXM', lleva: 3, paga: 2 }), 10, 2), 0);
  assert.equal(P.lineDiscount(promo({ tipo: 'PORCENTAJE', valor: 10 }), null, 3), 0);
});

test('cotización: mejor promoción por renglón, precios pendientes, alcohol y envío', () => {
  const promos = [
    promo({ id: 'a', tipo: 'PORCENTAJE', valor: 10, aplica_a: 'cat:Leche' }),
    promo({ id: 'b', tipo: 'DESCUENTO_PIEZA', valor: 5, aplica_a: 'leche' }),
    promo({ id: 'c', tipo: 'NXM', lleva: 2, paga: 1, aplica_a: 'yog' })
  ];
  const q = P.quote(
    [{ id: 'leche', cantidad: 2 }, { id: 'yog', cantidad: 4 }, { id: 'sinprecio', cantidad: 1 }, { id: 'cerveza', cantidad: 1 }, { id: 'nada', cantidad: 1 }],
    prods, promos, { today: '2026-10-20', entrega: 'domicilio', envioCosto: '25' });
  const leche = q.lines.find((l) => l.id === 'leche');
  assert.equal(leche.promo.id, 'b'); // 5×2=10 > 10% de 60=6
  assert.equal(leche.total, 50);
  assert.equal(q.lines.find((l) => l.id === 'yog').descuento, 28);
  assert.equal(q.subtotal, 60 + 56 + 22);
  assert.equal(q.descuento, 38);
  assert.equal(q.envio, 25);
  assert.equal(q.total, 138 - 38 + 25);
  assert.equal(q.preciosPendientes, true);
  assert.equal(q.contieneAlcohol, true);
  assert.deepEqual(q.faltantes, ['nada']);
  assert.equal(q.piezas, 8);
});

test('envío: por confirmar, gratis desde, y recoger', () => {
  const items = [{ id: 'leche', cantidad: 4 }];
  assert.equal(P.quote(items, prods, [], { entrega: 'domicilio', envioCosto: '' }).envio, null);
  assert.equal(P.quote(items, prods, [], { entrega: 'domicilio', envioCosto: 25, envioGratisDesde: 100 }).envio, 0);
  assert.equal(P.quote(items, prods, [], { entrega: 'domicilio', envioCosto: 25, envioGratisDesde: 200 }).envio, 25);
  assert.equal(P.quote(items, prods, [], { entrega: 'recoger', envioCosto: 25 }).envio, 0);
});

test('las copias generadas son idénticas a la fuente', () => {
  const src = readFileSync(new URL('../shared/promos.js', import.meta.url), 'utf8');
  for (const copy of ['../web/assets/js/promos.js', '../apps-script/Promos.gs']) {
    assert.ok(readFileSync(new URL(copy, import.meta.url), 'utf8').endsWith(src), `${copy} desactualizado: corre npm run build`);
  }
});
