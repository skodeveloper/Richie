import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

function setup() {
  const g = createGas();
  g.ctx.configuracionInicial();
  g.ctx.guardarContrasena_('secreta123');
  const { token } = g.post({ action: 'login', password: 'secreta123' }).data;
  const admin = (action, datos = {}) => g.post({ action, token, ...datos });
  return { g, admin, token };
}

test('todas las acciones de gestión exigen sesión', () => {
  const { g } = setup();
  for (const action of ['adminCatalog', 'adminSaveProducts', 'adminDeleteProduct', 'adminSavePromo', 'adminDeletePromo',
    'adminSaveSeason', 'adminDeleteSeason', 'adminSaveConfig', 'adminClients', 'adminChangePassword', 'adminUploadImage']) {
    assert.equal(g.post({ action, token: 'falso' }).error, 'SESION_EXPIRADA', action);
  }
});

test('catálogo del panel incluye ocultos, promociones apagadas y la configuración privada', () => {
  const { admin } = setup();
  const c = admin('adminCatalog').data;
  assert.equal(c.productos.length, 170);
  assert.ok(c.productos.some((p) => !p.visible && p.categoria === 'Cigarros'));
  assert.equal(c.promociones.length, 2);
  assert.ok(c.promociones.every((p) => p.estado === 'APAGADA'));
  assert.equal(c.config.email_notificacion, 'skodev.ia@gmail.com');
  assert.equal(c.config.horario_semana, '8:00-23:30');
});

test('productos: editar precio en lote, agotar, crear, validar y eliminar; la web lo ve al instante', () => {
  const { g, admin } = setup();
  g.get({ action: 'catalog' }); // llena la caché
  const r = admin('adminSaveProducts', { productos: [{ id: 'lala-entera', precio: '31.50' }, { id: 'bio4', disponible: false }] });
  assert.equal(r.ok, true, r.error);
  const pub = g.get({ action: 'catalog' }).data.productos;
  assert.equal(pub.find((p) => p.id === 'lala-entera').precio, 31.5, 'la caché se limpia al guardar');
  assert.equal(pub.find((p) => p.id === 'bio4').disponible, false);

  const nuevo = admin('adminSaveProducts', { productos: [{ nuevo: true, nombre: 'Coca-Cola', presentacion: '600 ml', categoria: 'Refrescos', precio: 22, imagen: 'https://example.com/coca.jpg' }] });
  assert.equal(nuevo.ok, true, nuevo.error);
  const p = nuevo.data.productos[0];
  assert.equal(p.id, 'coca-cola-600-ml');
  assert.equal(p.visible, true);
  assert.ok(g.get({ action: 'catalog' }).data.productos.some((x) => x.id === 'coca-cola-600-ml' && x.categoria === 'Refrescos'));
  const repetido = admin('adminSaveProducts', { productos: [{ nuevo: true, nombre: 'Coca-Cola', presentacion: '600 ml', categoria: 'Refrescos' }] });
  assert.equal(repetido.data.productos[0].id, 'coca-cola-600-ml-2', 'ids únicos');

  assert.match(admin('adminSaveProducts', { productos: [{ id: 'bio4', precio: 'abc' }] }).error, /precio/i);
  assert.match(admin('adminSaveProducts', { productos: [{ id: 'bio4', imagen: 'javascript:alert(1)' }] }).error, /https/);
  assert.match(admin('adminSaveProducts', { productos: [{ nuevo: true, nombre: 'Sin categoría' }] }).error, /categoría/);
  assert.match(admin('adminSaveProducts', { productos: [{ id: 'bio4', temporada: 'no-existe' }] }).error, /temporada/);
  assert.match(admin('adminSaveProducts', { productos: [{ id: 'nadie', precio: 1 }] }).error, /No encontramos/);
  assert.equal(admin('adminSaveProducts', { productos: [{ nuevo: true, nombre: '=IMPORTXML("x")', categoria: 'X' }] }).ok, true);
  assert.ok(g.rows('Productos').at(-1).nombre.startsWith("'="), 'anti-fórmulas');

  assert.equal(admin('adminDeleteProduct', { id: 'coca-cola-600-ml-2' }).ok, true);
  assert.ok(!admin('adminCatalog').data.productos.some((x) => x.id === 'coca-cola-600-ml-2'));
});

test('promociones: crear, se aplica en pedidos, editar, apagar y eliminar', () => {
  const { g, admin } = setup();
  admin('adminSaveProducts', { productos: [{ id: 'danonino-maxi', precio: 14 }] });
  const r = admin('adminSavePromo', { promo: { titulo: '3x2 en Danonino', tipo: 'NXM', lleva: 3, paga: 2, aplica_a: 'danonino-maxi', activa: true, valor: 99 } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.promo.id, '3x2-en-danonino');
  assert.equal(r.data.promo.estado, 'ACTIVA');
  assert.equal(r.data.promo.valor, null, 'limpia campos que no usa el tipo');

  const pedido = g.post({ action: 'createOrder', nombre: 'Ana', telefono: '5512345678', entrega: 'recoger', pago: 'efectivo', items: [{ id: 'danonino-maxi', cantidad: 3 }] });
  assert.equal(pedido.data.cotizacion.descuento, 14);

  assert.equal(admin('adminSavePromo', { promo: { id: '3x2-en-danonino', titulo: '3x2 en Danonino', tipo: 'NXM', lleva: 3, paga: 2, aplica_a: 'danonino-maxi', activa: false } }).data.promo.estado, 'APAGADA');
  assert.equal(g.get({ action: 'catalog' }).data.promociones.length, 0);
  assert.equal(admin('adminSavePromo', { promo: { titulo: 'Futura', tipo: 'PORCENTAJE', valor: 10, aplica_a: '*', activa: true, inicio: '2099-01-01' } }).data.promo.estado, 'PROGRAMADA');

  assert.match(admin('adminSavePromo', { promo: { titulo: 'Mala', tipo: 'NXM', lleva: 1, paga: 2, aplica_a: '*' } }).error, /paga debe ser menor/);
  assert.match(admin('adminSavePromo', { promo: { titulo: 'Mala', tipo: 'PORCENTAJE', valor: 150, aplica_a: '*' } }).error, /porcentaje/);
  assert.match(admin('adminSavePromo', { promo: { titulo: 'Mala', tipo: 'PORCENTAJE', valor: 10 } }).error, /a qué productos/);
  assert.match(admin('adminSavePromo', { promo: { titulo: 'Mala', tipo: 'PORCENTAJE', valor: 10, aplica_a: '*', inicio: '2026-12-01', fin: '2026-11-01' } }).error, /anterior/);

  assert.equal(admin('adminDeletePromo', { id: '3x2-en-danonino' }).ok, true);
  assert.equal(admin('adminCatalog').data.promociones.filter((p) => p.id === '3x2-en-danonino').length, 0);
});

test('temporadas: crear con productos, reasignar, mostrar en la web y eliminar', () => {
  const { g, admin } = setup();
  const r = admin('adminSaveSeason', { temporada: { nombre: 'Navidad', inicio: '2026-12-01', fin: '2026-12-31', activa: true }, productos: ['bio4', 'gastroprotec'] });
  assert.equal(r.ok, true, r.error);
  const id = r.data.temporada.id;
  assert.equal(id, 'navidad-2026');
  let cat = admin('adminCatalog').data;
  assert.equal(cat.temporadas.find((t) => t.id === id).productos, 2);
  assert.equal(cat.productos.find((p) => p.id === 'bio4').temporada, id);

  admin('adminSaveSeason', { temporada: { id, nombre: 'Navidad', inicio: '', fin: '', activa: true }, productos: ['gastroprotec', 'lala-entera'] });
  cat = admin('adminCatalog').data;
  assert.equal(cat.productos.find((p) => p.id === 'bio4').temporada, '', 'se quita de la temporada');
  assert.equal(cat.productos.find((p) => p.id === 'lala-entera').temporada, id);
  assert.ok(g.get({ action: 'catalog' }).data.temporadas.some((t) => t.id === id), 'vigente sin fechas');

  assert.equal(admin('adminDeleteSeason', { id }).ok, true);
  cat = admin('adminCatalog').data;
  assert.ok(!cat.temporadas.some((t) => t.id === id));
  assert.equal(cat.productos.find((p) => p.id === 'lala-entera').temporada, '');
});

test('ajustes: validación, efecto en pedidos y datos privados fuera de la web', () => {
  const { g, admin } = setup();
  const r = admin('adminSaveConfig', { config: {
    envio_costo: '25', envio_gratis_desde: 300, colonias_cobertura: ' Guadalupe Tepeyac ,Lindavista,, ', whatsapp: '55 1234 5678',
    horario_semana: '8:00 - 22:00', transferencia_datos: 'BBVA\nCLABE 012', pedidos_activos: true, email_notificacion: 'tienda@example.com'
  } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.config.colonias_cobertura, 'Guadalupe Tepeyac, Lindavista');
  assert.equal(r.data.config.whatsapp, '5512345678');
  assert.equal(r.data.config.horario_semana, '8:00-22:00');
  assert.equal(r.data.config.transferencia_datos, 'BBVA\nCLABE 012');
  const pub = g.get({ action: 'catalog' }).data.config;
  assert.equal(pub.whatsapp, '5512345678');
  assert.equal(pub.email_notificacion, undefined);

  const pedido = g.post({ action: 'createOrder', nombre: 'Ana', telefono: '5512345678', entrega: 'domicilio', direccion: 'Estela 10', colonia: 'Roma', pago: 'efectivo', items: [{ id: 'bio4', cantidad: 1 }] });
  assert.match(pedido.error, /no entregamos/);

  assert.match(admin('adminSaveConfig', { config: { envio_costo: 'gratis' } }).error, /monto/i);
  assert.match(admin('adminSaveConfig', { config: { email_notificacion: 'no-es-correo' } }).error, /correo/);
  assert.match(admin('adminSaveConfig', { config: { horario_domingo: 'de 9 a 5' } }).error, /horario/);
  assert.match(admin('adminSaveConfig', { config: { inventada: 1 } }).error, /desconocido/);

  admin('adminSaveConfig', { config: { pedidos_activos: false } });
  assert.equal(g.post({ action: 'createOrder', nombre: 'Ana', telefono: '5512345678', entrega: 'recoger', pago: 'efectivo', items: [{ id: 'bio4', cantidad: 1 }] }).ok, false);
});

test('clientes (CRM), cambio de contraseña y subida de fotos', () => {
  const { g, admin, token } = setup();
  g.post({ action: 'createOrder', nombre: 'Ana López', telefono: '5512345678', entrega: 'recoger', pago: 'efectivo', items: [{ id: 'bio4', cantidad: 1 }] });
  g.post({ action: 'createOrder', nombre: 'Ana López', telefono: '5512345678', entrega: 'recoger', pago: 'efectivo', items: [{ id: 'bio4', cantidad: 1 }] });
  const c = admin('adminClients', { q: 'ana' }).data;
  assert.equal(c.total, 1);
  assert.equal(c.clientes[0].pedidos, 2);
  assert.equal(admin('adminClients', { q: 'zzz' }).data.total, 0);

  const foto = admin('adminUploadImage', { nombre: 'Lala Entera', tipo: 'image/jpeg', datos: Buffer.from('jpegdata').toString('base64') });
  assert.equal(foto.ok, true, foto.error);
  assert.equal(foto.data.url, 'https://lh3.googleusercontent.com/d/F1');
  assert.deepEqual(g.files[0].sharing, ['ANYONE_WITH_LINK', 'VIEW']);
  assert.match(admin('adminUploadImage', { tipo: 'text/html', datos: 'eA==' }).error, /JPG/);

  assert.match(admin('adminChangePassword', { actual: 'mala', nueva: 'otraClave99' }).error, /actual/);
  assert.match(admin('adminChangePassword', { actual: 'secreta123', nueva: 'corta' }).error, /8 caracteres/);
  const cambio = admin('adminChangePassword', { actual: 'secreta123', nueva: 'otraClave99' });
  assert.equal(cambio.ok, true, cambio.error);
  assert.equal(g.post({ action: 'adminCatalog', token }).error, 'SESION_EXPIRADA', 'la sesión vieja se cierra');
  assert.equal(g.post({ action: 'adminCatalog', token: cambio.data.token }).ok, true, 'la nueva sesión funciona');
});

test('migración automática: una hoja vieja recibe los ajustes nuevos sin abrir el Sheet', () => {
  const g = createGas();
  g.ctx.configuracionInicial();
  const config = g.sheets.get('Config');
  config.data = config.data.filter((r) => !['whatsapp', 'horario_semana'].includes(r[0]));
  g.props.delete('ESTRUCTURA');
  const pub = g.get({ action: 'catalog' }).data.config;
  assert.equal(pub.horario_semana, '8:00-23:30');
  assert.ok('whatsapp' in pub);
  assert.equal(g.props.get('ESTRUCTURA'), '2');
});

test('autorizarPermisos corre sin errores (se usa tras actualizar el código)', () => {
  const g = createGas();
  g.ctx.configuracionInicial();
  g.ctx.autorizarPermisos();
  assert.equal(g.props.get('ESTRUCTURA'), '2');
});
