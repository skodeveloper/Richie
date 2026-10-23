import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

function setup() {
  const g = createGas();
  g.ctx.configuracionInicial();
  g.ctx.guardarContrasena_('secreta123');
  const { token } = g.post({ action: 'login', password: 'secreta123' }).data;
  return { g, admin: (action, datos = {}) => g.post({ action, token, ...datos }) };
}

const catalogo = (n) => Array.from({ length: n }, (_, i) => ({
  codigo: String(7500000000000 + i), nombre: `Producto ${i} con acentos áéíóú`, presentacion: '500 g',
  categoria: i % 2 ? 'Despensa' : 'Bebidas', marca: i % 3 ? '' : 'Lala', precio: 10 + (i % 50),
  disponible: i % 7 !== 0, visible: true, es_alcohol: false, unidad: '', p_costo: 4321.987
}));

test('importación: primera carga en partes, oculta el catálogo anterior y nunca guarda el costo', () => {
  const { g, admin } = setup();
  const lista = catalogo(3000);
  const a = admin('adminImportProducts', { productos: lista.slice(0, 1500), ocultar_sin_codigo: true });
  assert.equal(a.ok, true, a.error);
  assert.deepEqual([a.data.nuevos, a.data.ocultados], [1500, 101]);
  const b = admin('adminImportProducts', { productos: lista.slice(1500) });
  assert.equal(b.data.nuevos, 1500);
  const pub = g.get({ action: 'catalog' }).data.productos;
  assert.equal(pub.length, 3000, 'solo se ven los del punto de venta');
  assert.equal(pub.filter((p) => !p.disponible).length, 429, 'existencia 0 → agotado');
  assert.ok(!JSON.stringify(g.sheets.get('Productos').data).includes('4321.987'), 'el costo no se guarda');
  assert.equal(admin('adminImportProducts', { productos: catalogo(1501) }).ok, false, 'máximo 1500 por envío');
});

test('reimportar: actualiza precio y existencia, respeta lo editado en el panel', () => {
  const { g, admin } = setup();
  const lista = catalogo(200);
  admin('adminImportProducts', { productos: lista, ocultar_sin_codigo: true });
  const id = admin('adminCatalog').data.productos.find((p) => p.codigo === lista[5].codigo).id;
  admin('adminSaveProducts', { productos: [{ id, nombre: 'Nombre bonito', categoria: 'Mi categoría', destacado: true }] });
  const cambiada = lista.map((p, i) => (i === 5 ? { ...p, precio: 99, nombre: 'NOMBRE DEL PUNTO DE VENTA' } : i === 6 ? { ...p, disponible: !p.disponible } : p));
  const r = admin('adminImportProducts', { productos: cambiada });
  assert.deepEqual([r.data.nuevos, r.data.actualizados, r.data.sin_cambios], [0, 2, 198]);
  const p = admin('adminCatalog').data.productos.find((x) => x.id === id);
  assert.equal(p.precio, 99);
  assert.equal(p.nombre, 'Nombre bonito', 'el nombre editado se conserva');
  assert.equal(p.categoria, 'Mi categoría');
  assert.equal(p.destacado, true);
  assert.equal(g.get({ action: 'catalog' }).data.productos.find((x) => x.id === id).precio, 99, 'la web ve el precio nuevo');
});

test('importación: omite filas inválidas o repetidas y protege contra fórmulas', () => {
  const { g, admin } = setup();
  const r = admin('adminImportProducts', { productos: [
    { codigo: '', nombre: 'Sin código', precio: 5 },
    { codigo: '1', nombre: 'X', precio: 5 },
    { codigo: '2', nombre: 'Precio negativo', precio: -3 },
    { codigo: '3', nombre: '=IMPORTXML("http://x")', precio: 5, categoria: 'Despensa', disponible: true, visible: true },
    { codigo: '3', nombre: 'Repetido', precio: 6 }
  ] });
  assert.deepEqual([r.data.nuevos, r.data.omitidos], [1, 4]);
  // Una reimportación reescribe la hoja completa: la protección debe mantenerse.
  admin('adminImportProducts', { productos: [{ codigo: '3', nombre: 'Otro nombre', precio: 7, disponible: false }] });
  const fila = g.rows('Productos').find((x) => x.codigo === '3');
  assert.ok(String(fila.nombre).startsWith("'="));
  assert.equal(fila.precio, 7);
});

test('granel: pedido en cuartos de kilo con precio por kilo', () => {
  const { g, admin } = setup();
  admin('adminImportProducts', { productos: [
    { codigo: '100', nombre: 'Jamón de pierna', categoria: 'Salchichonería y quesos', precio: 158, disponible: true, visible: true, unidad: 'kg' },
    { codigo: '101', nombre: 'Leche entera', categoria: 'Lácteos y huevo', precio: 31, disponible: true, visible: true }
  ] });
  const id = (c) => admin('adminCatalog').data.productos.find((p) => p.codigo === c).id;
  const [jamon, leche] = [id('100'), id('101')];
  const base = { action: 'createOrder', nombre: 'Ana', telefono: '5512345678', entrega: 'recoger', pago: 'efectivo' };
  const ok = g.post({ ...base, items: [{ id: jamon, cantidad: 0.75 }, { id: leche, cantidad: 2 }] });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.data.cotizacion.total, 118.5 + 62);
  assert.match(g.rows('Pedidos')[0].productos, /¾ kg Jamón de pierna/);
  assert.match(g.mails[0].htmlBody, /¾ kg/);
  assert.equal(g.post({ ...base, telefono: '5500000001', items: [{ id: jamon, cantidad: 0.3 }] }).ok, false, 'solo cuartos de kilo');
  assert.equal(g.post({ ...base, telefono: '5500000002', items: [{ id: leche, cantidad: 1.5 }] }).ok, false, 'piezas enteras');
  assert.equal(g.post({ ...base, telefono: '5500000003', items: [{ id: jamon, cantidad: 30 }] }).ok, false, 'máximo 25 kg');
});

test('catálogo grande: se guarda en caché por partes y se sirve igual', () => {
  const { g, admin } = setup();
  const lista = catalogo(3000);
  admin('adminImportProducts', { productos: lista.slice(0, 1500), ocultar_sin_codigo: true });
  admin('adminImportProducts', { productos: lista.slice(1500) });
  const primera = g.get({ action: 'catalog' }).data;
  const partes = Number(g.cache.get('catalogo_v1_n'));
  assert.ok(partes > 5, `el catálogo ocupa ${partes} partes de caché`);
  g.sheets.get('Productos').data.splice(1, 50); // si se leyera de la hoja, cambiaría
  const segunda = g.get({ action: 'catalog' }).data;
  assert.equal(segunda.productos.length, primera.productos.length, 'segunda lectura viene de la caché');
  admin('adminSaveProducts', { productos: [{ id: segunda.productos[100].id, precio: 1 }] });
  assert.ok(!g.cache.has('catalogo_v1_n'), 'guardar en el panel invalida la caché');
});
