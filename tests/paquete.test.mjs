import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGas } from './gas-mock.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('el Codigo.gs de un solo archivo funciona igual que los módulos', () => {
  execFileSync('node', ['scripts/paquete.mjs'], { cwd: root });
  const g = createGas({ singleFile: new URL('../dist/Codigo.gs', import.meta.url) });
  g.ctx.configuracionInicial();
  g.ctx.guardarContrasena_('secreta123');
  assert.equal(g.get({ action: 'catalog' }).data.productos.length, 101);
  const r = g.post({
    action: 'createOrder', nombre: 'Ana', telefono: '5512345678', entrega: 'recoger', pago: 'efectivo',
    items: [{ id: 'bio4', cantidad: 2 }]
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(g.get({ action: 'track', folio: r.data.folio }).data.pedido.estado, 'RECIBIDO');
  const { token } = g.post({ action: 'login', password: 'secreta123' }).data;
  assert.equal(g.post({ action: 'adminOrders', token }).data.pedidos.length, 1);
});

test('el zip trae el sitio en la raíz (listo para public_html)', () => {
  const list = execFileSync('unzip', ['-Z1', 'dist/la-luna-hostgator.zip'], { cwd: root, encoding: 'utf8' }).split('\n');
  for (const f of ['index.html', '.htaccess', 'assets/js/config.js', 'assets/css/styles.css', 'data/demo.json']) {
    assert.ok(list.includes(f), `falta ${f}`);
  }
  assert.ok(!list.some((f) => f.startsWith('web/')), 'no debe venir dentro de una carpeta web/');
});
