// Lector de Excel y mapeo del catálogo del punto de venta (lo que corre en el panel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearXlsx, MUESTRA } from './fixtures/xlsx.mjs';
import { leerXlsx, leerCsv } from '../web/assets/js/admin/xlsx.js';
import { mapearCatalogo, limpiarNombre, clasificar } from '../web/assets/js/admin/catalogo-pos.js';

const buffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

test('lee el .xlsx y nunca deja pasar el precio de costo', async () => {
  const filas = await leerXlsx(buffer(crearXlsx(MUESTRA)));
  assert.equal(filas.length, MUESTRA.length);
  assert.equal(filas[0][1], 'Producto');
  const r = mapearCatalogo(filas);
  assert.ok(!JSON.stringify(r).includes('4321'), 'el costo no aparece en el resultado');
  assert.deepEqual(r.errores, ['Fila 13: código 7501055300075 repetido', 'Fila 14: falta código o nombre']);
  assert.equal(r.productos.length, 11);
});

test('categorías, licores, granel, agotados y ocultos', async () => {
  const r = mapearCatalogo(await leerXlsx(buffer(crearXlsx(MUESTRA))));
  const por = Object.fromEntries(r.productos.map((p) => [p.codigo, p]));
  assert.equal(por['7501055300075'].nombre, 'Coca Cola');
  assert.equal(por['7501055300075'].presentacion, '600 ml');
  // "Estrella" es pasta, no cerveza.
  assert.equal(por['7501000112784'].categoria, 'Pastas, arroz y granos');
  assert.equal(por['7501000112784'].es_alcohol, false);
  assert.equal(por['7501064191428'].categoria, 'Cerveza');
  assert.equal(por['7501064191428'].es_alcohol, true);
  assert.equal(por['7501064191428'].disponible, false, 'existencia 0 = agotado');
  // El departamento es el proveedor: las pistas del nombre ganan.
  assert.equal(por['7500435019972'].categoria, 'Higiene personal');
  assert.equal(por['7500435019972'].disponible, true, 'sin control de existencia = disponible');
  assert.equal(por['7613036068094'].categoria, 'Mascotas');
  assert.equal(por['7501026005787'].visible, true, 'cucharas a la venta sí se publican');
  assert.equal(por['7501031311309'].categoria, 'Cigarros');
  assert.equal(por['7501031311309'].visible, false, 'cigarros ocultos');
  assert.equal(por['IMP-RET'].visible, false, 'importes de envase ocultos');
  assert.equal(por['FRIJOL-GR'].unidad, 'kg');
  assert.equal(por['FRIJOL-GR'].presentacion, '');
  assert.equal(por['7501035908102'].nombre, 'Tequila Don Julio Cristalino');
  assert.equal(por['7501035908102'].es_alcohol, true);
  assert.equal(por['7501008042953'].es_alcohol, false, 'cerveza sin alcohol no pide +18');
  assert.equal(r.resumen.granel, 1);
});

test('limpieza de nombres y presentaciones', () => {
  assert.deepEqual(limpiarNombre('LALA LECHE ENTERA 1LT'), { nombre: 'Lala Leche Entera', presentacion: '1 L' });
  // La dosis de un medicamento se queda en el nombre.
  assert.deepEqual(limpiarNombre('F Flanax 550mg'), { nombre: 'Flanax 550mg', presentacion: '' });
  assert.deepEqual(limpiarNombre('Sabritas Limon 46g.'), { nombre: 'Sabritas Limon', presentacion: '46 g' });
  assert.equal(clasificar('Harina Hot Cakes Tres Estrella 1Kg', 'Scorpion Abarrote').es_alcohol, false);
  assert.equal(clasificar('Maiz Pozolero El Indio 1kg', 'Scorpion Abarrote').es_alcohol, false);
  assert.equal(clasificar('Indio Lata 473ml', 'Scorpion Abarrote').categoria, 'Cerveza');
});

test('CSV con punto y coma y comillas', () => {
  const filas = leerCsv('Código;Producto;P. Venta;Departamento;Existencia\n"750";"Galletas ""Marías"" 170g";"21,50";Gamesa;3\n');
  const r = mapearCatalogo(filas);
  assert.equal(r.productos[0].nombre, 'Galletas "Marías"');
  assert.equal(r.productos[0].precio, 21.5);
  assert.equal(r.productos[0].categoria, 'Pan, galletas y tortillas');
});

test('avisa si faltan columnas', () => {
  assert.throws(() => mapearCatalogo([['Nombre', 'Costo']]), /Producto/);
  assert.throws(() => mapearCatalogo([['Producto', 'P. Venta']]), /Código/);
});
