import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

function setup() {
  const g = createGas();
  g.ctx.configuracionInicial();
  g.ctx.guardarContrasena_('secreta123');
  return g;
}

const cliente = {
  nombre: 'Ana López', telefono: '55 1234 5678', email: 'ana@example.com', entrega: 'domicilio',
  direccion: 'Estela 10', colonia: 'Guadalupe Tepeyac', pago: 'efectivo', paga_con: 500
};

test('configuración inicial crea hojas, catálogo y oculta cigarros', () => {
  const g = setup();
  for (const h of ['Config', 'Productos', 'Promociones', 'Temporadas', 'Pedidos', 'Clientes', 'Comentarios']) {
    assert.ok(g.sheets.has(h), h);
  }
  const r = g.get({ action: 'catalog' });
  assert.equal(r.ok, true);
  assert.equal(r.data.productos.length, 101);
  assert.ok(!r.data.productos.some((p) => p.categoria === 'Cigarros'));
  assert.equal(r.data.promociones.length, 0, 'los ejemplos vienen desactivados');
  assert.equal(r.data.config.email_notificacion, undefined, 'config privada no se expone');
  // Volver a correr la configuración no duplica datos.
  g.ctx.configuracionInicial();
  assert.equal(g.rows('Productos').length, 170);
});

test('pedido completo: precios del servidor, promoción, CRM, correo y seguimiento', () => {
  const g = setup();
  g.setCell('Productos', 'lala-entera', 'precio', 30);
  g.setCell('Productos', 'danonino-maxi', 'precio', 14);
  g.setCell('Promociones', 'promo-ejemplo-2x1', 'activa', 'SI');
  g.setCell('Config', 'envio_costo', 'valor', 20);

  const r = g.post({
    action: 'createOrder', ...cliente,
    items: [{ id: 'lala-entera', cantidad: 2, precio: 1 }, { id: 'danonino-maxi', cantidad: 2 }, { id: 'queso-manchego', cantidad: 1 }]
  });
  assert.equal(r.ok, true, r.error);
  const { folio, cotizacion } = r.data;
  assert.match(folio, /^LL-[A-Z0-9]{5}$/);
  assert.equal(cotizacion.subtotal, 88, 'ignora el precio enviado por el navegador');
  assert.equal(cotizacion.descuento, 14);
  assert.equal(cotizacion.envio, 20);
  assert.equal(cotizacion.total, 94);
  assert.equal(cotizacion.preciosPendientes, true);

  const pedido = g.rows('Pedidos')[0];
  assert.equal(pedido.estado, 'RECIBIDO');
  assert.equal(pedido.telefono, '5512345678');
  assert.match(pedido.productos, /2 × Danonino Maxi \[2x1\]/);
  const crm = g.rows('Clientes')[0];
  assert.equal(crm.pedidos, 1);
  assert.equal(g.mails.length, 2, 'aviso a la tienda + confirmación al cliente');
  assert.equal(g.mails[0].to, 'skodev.ia@gmail.com');

  const t = g.get({ action: 'track', folio });
  assert.equal(t.data.pedido.editable, true);
  assert.equal(t.data.pedido.productos.length, 3);
  assert.equal(t.data.pedido.nombre, undefined, 'no expone datos personales');
  const porTel = g.get({ action: 'track', telefono: '5512345678' });
  assert.equal(porTel.data.pedidos[0].folio, folio);
  assert.equal(g.get({ action: 'track', folio, telefono: '5500000000' }).ok, false);
});

test('el cliente agrega productos mientras está RECIBIDO, luego ya no', () => {
  const g = setup();
  const { data } = g.post({ action: 'createOrder', ...cliente, items: [{ id: 'lala-entera', cantidad: 1 }] });
  const mod = g.post({ action: 'updateOrder', folio: data.folio, telefono: '5512345678', items: [{ id: 'lala-entera', cantidad: 1 }, { id: 'bio4', cantidad: 3 }] });
  assert.equal(mod.ok, true, mod.error);
  assert.equal(mod.data.cotizacion.piezas, 4);
  assert.equal(g.post({ action: 'updateOrder', folio: data.folio, telefono: '5599999999', items: [{ id: 'bio4', cantidad: 1 }] }).ok, false);

  const login = g.post({ action: 'login', password: 'secreta123' });
  g.post({ action: 'adminUpdateOrder', token: login.data.token, folio: data.folio, estado: 'CONFIRMADO', nota_cliente: 'Va en 30 min' });
  const bloqueado = g.post({ action: 'updateOrder', folio: data.folio, telefono: '5512345678', items: [{ id: 'bio4', cantidad: 9 }] });
  assert.equal(bloqueado.ok, false);
  const t = g.get({ action: 'track', folio: data.folio }).data.pedido;
  assert.equal(t.estado, 'CONFIRMADO');
  assert.equal(t.nota_cliente, 'Va en 30 min');
  assert.deepEqual(t.historial.map((h) => h.estado), ['RECIBIDO', 'RECIBIDO', 'CONFIRMADO']);
});

test('validaciones: datos, alcohol +18, cobertura, pausa y anti-fórmulas', () => {
  const g = setup();
  assert.equal(g.post({ action: 'createOrder', ...cliente, telefono: '123', items: [{ id: 'bio4', cantidad: 1 }] }).ok, false);
  assert.equal(g.post({ action: 'createOrder', ...cliente, items: [] }).ok, false);
  assert.equal(g.post({ action: 'createOrder', ...cliente, items: [{ id: 'bio4', cantidad: 500 }] }).ok, false);
  assert.equal(g.post({ action: 'createOrder', ...cliente, items: [{ id: 'marlboro-rojos-cajetilla-20-pzas', cantidad: 1 }] }).ok, false, 'productos ocultos no se pueden pedir');

  g.setCell('Productos', 'bio4', 'es_alcohol', 'SI');
  const sinEdad = g.post({ action: 'createOrder', ...cliente, items: [{ id: 'bio4', cantidad: 1 }] });
  assert.match(sinEdad.error, /mayor de 18/);
  assert.equal(g.post({ action: 'createOrder', ...cliente, mayor_edad: true, items: [{ id: 'bio4', cantidad: 1 }] }).ok, true);

  g.setCell('Config', 'colonias_cobertura', 'valor', 'Guadalupe Tepeyac, Lindavista');
  assert.equal(g.post({ action: 'createOrder', ...cliente, telefono: '5511111111', colonia: 'Roma', items: [{ id: 'gastroprotec', cantidad: 1 }] }).ok, false);
  assert.equal(g.post({ action: 'createOrder', ...cliente, telefono: '5511111111', colonia: 'lindavista', items: [{ id: 'gastroprotec', cantidad: 1 }] }).ok, true);

  const f = g.post({ action: 'createOrder', ...cliente, telefono: '5522222222', nombre: '=HYPERLINK("x")', items: [{ id: 'gastroprotec', cantidad: 1 }] });
  assert.equal(f.ok, true);
  assert.ok(g.rows('Pedidos').at(-1).nombre.startsWith("'="));

  g.setCell('Config', 'pedidos_activos', 'valor', 'NO');
  assert.equal(g.post({ action: 'createOrder', ...cliente, items: [{ id: 'gastroprotec', cantidad: 1 }] }).ok, false);
});

test('panel: contraseña, sesión, filtros y moderación de comentarios', () => {
  const g = setup();
  assert.equal(g.post({ action: 'login', password: 'mala' }).ok, false);
  assert.equal(g.post({ action: 'adminOrders', token: 'inventado' }).error, 'SESION_EXPIRADA');
  const { token } = g.post({ action: 'login', password: 'secreta123' }).data;
  g.post({ action: 'createOrder', ...cliente, items: [{ id: 'bio4', cantidad: 1 }] });
  const lista = g.post({ action: 'adminOrders', token, estado: 'ACTIVOS' });
  assert.equal(lista.data.pedidos.length, 1);
  assert.equal(lista.data.pedidos[0].nombre, 'Ana López');
  assert.equal(lista.data.resumen.RECIBIDO, 1);
  assert.equal(g.post({ action: 'adminOrders', token, q: 'nadie' }).data.pedidos.length, 0);

  const c = g.post({ action: 'addComment', nombre: 'Luis Pérez', calificacion: 5, comentario: 'Muy buen servicio', publicable: true });
  assert.equal(c.ok, true);
  assert.equal(g.get({ action: 'comments' }).data.total, 0, 'pendiente de aprobación');
  g.post({ action: 'adminModerateComment', token, id: c.data.id, estado: 'APROBADO', respuesta: '¡Gracias!' });
  const pub = g.get({ action: 'comments' }).data;
  assert.equal(pub.total, 1);
  assert.equal(pub.comentarios[0].nombre, 'Luis P.');
  assert.equal(pub.comentarios[0].respuesta, '¡Gracias!');

  // Cambiar la contraseña cierra las sesiones abiertas.
  g.ctx.guardarContrasena_('otraClave99');
  assert.equal(g.post({ action: 'adminOrders', token }).error, 'SESION_EXPIRADA');
});

test('onEdit: cambiar estado a mano en la hoja queda en el historial', () => {
  const g = setup();
  const { data } = g.post({ action: 'createOrder', ...cliente, items: [{ id: 'bio4', cantidad: 1 }] });
  const sh = g.sheets.get('Pedidos');
  const col = sh.data[0].indexOf('estado') + 1;
  sh.put(2, col, 'EN_CAMINO');
  g.ctx.onEdit({ range: sh.getRange(2, col), value: 'EN_CAMINO' });
  const t = g.get({ action: 'track', folio: data.folio }).data.pedido;
  assert.deepEqual(t.historial.map((h) => h.estado), ['RECIBIDO', 'EN_CAMINO']);
});

test('CRM externo opcional por webhook', () => {
  const g = setup();
  g.setCell('Config', 'crm_webhook_url', 'valor', 'https://hooks.example.com/abc');
  g.post({ action: 'createOrder', ...cliente, items: [{ id: 'bio4', cantidad: 1 }] });
  assert.equal(g.fetches.length, 1);
  const payload = JSON.parse(g.fetches[0].o.payload);
  assert.equal(payload.evento, 'pedido.creado');
  assert.equal(payload.pedido.telefono, '5512345678');
});

test('límite anti-spam: 5 pedidos por teléfono en 10 minutos', () => {
  const g = setup();
  for (let i = 0; i < 5; i++) {
    assert.equal(g.post({ action: 'createOrder', ...cliente, items: [{ id: 'bio4', cantidad: 1 }] }).ok, true);
  }
  assert.match(g.post({ action: 'createOrder', ...cliente, items: [{ id: 'bio4', cantidad: 1 }] }).error, /varios pedidos/);
});
