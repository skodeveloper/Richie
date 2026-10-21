// Prueba de punta a punta en navegador (modo demostración, sin tocar Google).
// Uso: npm run e2e   (requiere Playwright instalado de forma global)
// Recorre el sitio público y el panel: lo que se cambia en el panel debe verse en el sitio.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PUERTO = 8095;
const B = `http://localhost:${PUERTO}/`;
const O = process.env.E2E_CAPTURAS || '';
const shot = (page, nombre, opts = {}) => (O ? page.screenshot({ path: path.join(O, nombre), ...opts }) : null);

// Copia del sitio con API_URL vacío para usar el backend de demostración.
function prepararSitio() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-e2e-'));
  fs.cpSync(path.join(__dirname, '..', '..', 'web'), dir, { recursive: true });
  const cfg = path.join(dir, 'assets/js/config.js');
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(/API_URL: '[^']*'/, "API_URL: ''"));
  return dir;
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let paso = 0;
const ok = (c, msg) => { if (!c) throw new Error('FALLÓ: ' + msg); console.log(`  ✓ ${msg}`); };

(async () => {
  const sitio = prepararSitio();
  const servidor = spawn('python3', ['-m', 'http.server', String(PUERTO), '--directory', sitio], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  const step = (s) => console.log(`${++paso}. ${s}`);
  const admin = async (hash) => { await page.goto(B + 'admin.html#' + hash); await page.waitForSelector('#adm-main :not(.adm-loading)'); await page.waitForTimeout(400); };

  step('Portada: estado de la tienda, íconos por categoría');
  await page.goto(B);
  await page.waitForSelector('#home-featured .card');
  ok(await page.isVisible('.site-header [data-open-pill]'), 'pill abierto/cerrado visible');
  ok(await page.$('#home-featured .card .ico-cat'), 'tarjetas sin foto muestran ícono de categoría');
  ok((await page.textContent('.cart-btn')).includes('Carrito'), 'botón dice Carrito');

  step('Panel: entrar');
  await page.goto(B + 'admin.html');
  await page.fill('#pw', 'demo');
  await page.click('#login button');
  await page.waitForSelector('.adm-nav');
  ok(await page.isVisible('#estado-tienda'), 'estado "Recibiendo pedidos" visible');

  step('Productos: precio en línea con Enter, agotar, destacar');
  await admin('productos');
  await page.click('[data-vista="sinprecio"]');
  const antes = Number((await page.textContent('[data-vista="sinprecio"] b')).trim());
  await page.fill('#pq', 'dan fresa');
  await page.waitForTimeout(300);
  const input = page.locator('.prow[data-id="dan-fresa-220-g"] [data-precio]');
  await input.fill('17.5');
  await input.press('Enter');
  await page.waitForSelector('.toast.show');
  await page.waitForTimeout(500);
  ok(Number((await page.textContent('[data-vista="sinprecio"] b')).trim()) === antes - 1, 'contador "Sin precio" baja al capturar');
  await page.click('[data-vista="todos"]');
  await page.fill('#pq', 'bio4');
  await page.waitForTimeout(300);
  await page.click('.prow[data-id="bio4"] [data-sw="disponible"]');
  await page.waitForTimeout(600);
  ok(!(await page.isChecked('.prow[data-id="bio4"] [data-sw="disponible"]')), 'Bio4 marcado como agotado');
  await page.click('.prow[data-id="bio4"] [data-star]');
  await page.waitForTimeout(600);
  ok((await page.getAttribute('.prow[data-id="bio4"] [data-star]', 'aria-pressed')) === 'true', 'Bio4 destacado');

  step('Productos: alta con foto');
  await page.fill('#pq', '');
  await page.click('[data-nuevo]');
  await page.fill('#p-nombre', 'Coca-Cola');
  await page.fill('#p-pres', '600 ml');
  await page.fill('#p-precio', '22');
  await page.fill('#p-cat', 'Refrescos');
  await page.setInputFiles('#pfile', { name: 'coca.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => document.querySelector('#pform [name=imagen]').value.startsWith('data:image'));
  await shot(page, 'editor-producto.png');
  await page.click('.drawer footer .btn:last-child');
  await page.waitForSelector('.drawer', { state: 'detached' });
  await page.fill('#pq', 'coca');
  await page.waitForTimeout(300);
  ok(await page.$('.prow[data-id="coca-cola-600-ml"] img'), 'Coca-Cola creada con foto');
  await shot(page, 'productos.png');

  step('Promociones: crear 3x2 guiado');
  await admin('promociones');
  await page.click('[data-nueva]');
  await page.fill('#pr-tit', '3x2 en Coca-Cola');
  await page.check('input[name=tipo][value=NXM]');
  await page.fill('#pr-lleva', '3');
  await page.fill('#pr-paga', '2');
  await page.check('input[name=modo][value=productos]');
  await page.fill('.picker [data-filtro]', 'coca');
  await page.check('.picker input[value="coca-cola-600-ml"]');
  await page.waitForTimeout(200);
  ok((await page.textContent('#pr-prev')).includes('$44.00'), 'vista previa: 3 × $22 → $44');
  await shot(page, 'editor-promo.png');
  await page.click('.drawer footer .btn:last-child');
  await page.waitForSelector('.drawer', { state: 'detached' });
  ok(await page.$('.pcard[data-id="3x2-en-coca-cola"]'), 'promoción creada');

  step('Temporadas: crear con productos');
  await admin('temporadas');
  await page.click('[data-nueva]');
  await page.fill('#t-nom', 'Navidad');
  await page.fill('.picker [data-filtro]', 'coca');
  await page.check('.picker input[value="coca-cola-600-ml"]');
  await page.click('.drawer footer .btn:last-child');
  await page.waitForSelector('.drawer', { state: 'detached' });
  ok((await page.textContent('#tlist')).includes('Navidad'), 'temporada Navidad creada');

  step('Ajustes: envío, colonias, WhatsApp, aviso');
  await admin('ajustes');
  await page.fill('#a-envio_costo', '25');
  await page.fill('#a-col', 'Guadalupe Tepeyac');
  await page.press('#a-col', 'Enter');
  await page.fill('#a-wa', '55 1234 5678');
  await page.fill('#a-aviso', 'Hoy cerramos a las 20:00');
  await page.waitForSelector('#savebar.show');
  ok((await page.textContent('#savebar span')).includes('4 cambios'), 'barra de guardado cuenta 4 cambios');
  await shot(page, 'ajustes.png', { fullPage: true });
  await page.click('#savebar [type=submit]');
  await page.waitForSelector('#savebar:not(.show)');

  step('Sitio público refleja todo');
  await page.goto(B + 'tienda.html');
  await page.waitForSelector('.card');
  await page.waitForSelector('#aviso:not([hidden])', { timeout: 5000 });
  ok(await page.isVisible('#aviso'), 'franja de aviso visible');
  ok((await page.textContent('#aviso')).includes('20:00'), 'texto del aviso correcto');
  await page.waitForSelector('#wa-fab:not([hidden])', { timeout: 5000 });
  ok(await page.isVisible('#wa-fab'), 'botón de WhatsApp visible');
  await page.click('.chip[data-cat="Refrescos"]');
  await page.waitForSelector('.card[data-id="coca-cola-600-ml"] img');
  ok((await page.textContent('.card[data-id="coca-cola-600-ml"]')).includes('3x2'), 'Coca-Cola con etiqueta 3x2');
  await page.click('.card[data-id="coca-cola-600-ml"] [data-add]');
  await page.click('.card[data-id="coca-cola-600-ml"] [data-inc]');
  await page.click('.card[data-id="coca-cola-600-ml"] [data-inc]');
  await page.fill('#q', 'bio4');
  await page.waitForTimeout(300);
  ok((await page.textContent('.card[data-id="bio4"]')).includes('Agotado'), 'Bio4 sale como Agotado');
  await shot(page, 'tienda.png');
  await page.goto(B + 'temporada.html');
  await page.waitForSelector('.season');
  ok((await page.textContent('main')).includes('Navidad'), 'temporada Navidad publicada');

  step('Carrito: descuento, envío y cobertura');
  await page.goto(B + 'pedido.html');
  await page.waitForSelector('[data-step="0"]');
  const resumen = await page.textContent('.summary');
  ok(resumen.includes('−$22.00'), 'descuento 3x2 aplicado (−$22)');
  await page.click('[data-step="0"] [type=submit]');
  await page.fill('#f-nombre', 'Ana López');
  await page.fill('#f-telefono', '5512345678');
  await page.click('[data-step="1"] [type=submit]');
  await page.fill('#f-direccion', 'Estela 10');
  await page.fill('#f-colonia', 'Roma');
  await page.click('[data-step="2"] [type=submit]');
  ok((await page.textContent('[data-field="colonia"] .error')).includes('no entregamos'), 'colonia fuera de cobertura rechazada');
  await page.fill('#f-colonia', 'Guadalupe Tepeyac');
  await page.click('[data-step="2"] [type=submit]');
  ok((await page.textContent('.summary')).includes('$25.00'), 'envío $25 en el resumen');
  await page.click('[data-back]');
  await page.waitForSelector('[data-step="2"]');
  ok((await page.inputValue('#f-direccion')) === 'Estela 10', '“Regresar” conserva la dirección');
  await page.click('[data-step="2"] [type=submit]');
  await page.click('[data-step="3"] [type=submit]');
  await page.click('[data-step="4"] [type=submit]');
  await page.waitForSelector('.folio');
  const folio = (await page.textContent('.folio')).trim();
  ok(/^LL-/.test(folio), 'pedido enviado ' + folio);

  step('Seguimiento: agregar productos mientras está Recibido');
  await page.goto(B + `seguimiento.html?folio=${folio}&telefono=5512345678`);
  await page.waitForSelector('[data-edit]');
  await page.click('[data-edit]');
  await page.waitForURL(/tienda\.html/);
  await page.waitForSelector('#edit-bar:not([hidden])');
  await page.fill('#q', 'gastroprotec');
  await page.waitForSelector('.card[data-id="gastroprotec"] [data-add]');
  await page.click('.card[data-id="gastroprotec"] [data-add]');
  await page.goto(B + 'pedido.html');
  await page.waitForSelector('[data-step="0"]');
  ok((await page.$$('.line')).length === 2, 'el carrito trae lo ya pedido + lo nuevo');
  await page.click('[data-step="0"] [type=submit]');
  await page.click('[data-step="1"] [type=submit]');
  await page.waitForSelector('.folio');
  ok((await page.textContent('.folio')).trim() === folio, 'pedido actualizado con el mismo folio');

  step('Panel: pedido nuevo, estados, cliente');
  await admin('pedidos');
  await page.waitForSelector(`.order-card[data-folio="${folio}"]`);
  ok((await page.textContent('[data-badge="pedidos"]')).trim() === '1', 'contador de pedidos nuevos = 1');
  await page.click(`.order-card[data-folio="${folio}"] summary`);
  await page.click(`.order-card[data-folio="${folio}"] [data-next]`);
  await page.waitForSelector(`.order-card[data-folio="${folio}"] .st.CONFIRMADO`, { timeout: 5000 }).catch(() => {});
  await page.click('[data-estado="TODOS"]');
  await page.waitForTimeout(400);
  await page.selectOption(`#st-${folio}`, 'ENTREGADO');
  await page.click(`.order-card[data-folio="${folio}"] .estado-form [type=submit]`);
  await page.waitForTimeout(800);
  await admin('clientes');
  ok((await page.textContent('#clist')).includes('Ana López'), 'cliente aparece en CRM');
  await shot(page, 'clientes.png');

  step('Seguimiento: entregado y volver a pedir');
  await page.goto(B + 'seguimiento.html?folio=' + folio);
  await page.waitForSelector('[data-reorder]');
  await page.click('[data-reorder]');
  await page.waitForURL(/pedido\.html/);
  await page.waitForSelector('[data-step="0"]');
  ok((await page.$$('.line')).length === 2, 'carrito recargado con los 2 productos del pedido anterior');

  step('Pausar pedidos');
  await admin('ajustes');
  await page.click('input[name=pedidos_activos]');
  await page.click('#savebar [type=submit]');
  await page.waitForSelector('#savebar:not(.show)');
  ok((await page.textContent('#estado-tienda')).includes('pausados'), 'panel muestra "Pedidos pausados"');
  await page.goto(B + 'pedido.html');
  await page.waitForSelector('[data-step="0"] .alert.error');
  ok(await page.isDisabled('[data-step="0"] [type=submit]'), 'no deja continuar con pedidos pausados');
  await admin('ajustes');
  await page.click('input[name=pedidos_activos]');
  await page.click('#savebar [type=submit]');
  await page.waitForSelector('#savebar:not(.show)');

  step('Opiniones: publicar');
  await page.goto(B + 'comentarios.html');
  await page.fill('#c-nombre', 'Luis Pérez');
  await page.click('label[for=s5]');
  await page.fill('#c-comentario', 'Muy buen servicio.');
  await page.click('#comment-form [type=submit]');
  await page.waitForSelector('#comment-msg .alert.ok');
  await admin('opiniones');
  await page.click('[data-mod=APROBADO]');
  await page.waitForTimeout(500);
  await page.goto(B + 'comentarios.html');
  await page.waitForSelector('.review');
  ok(true, 'opinión publicada');

  step('Contraseña');
  await admin('ajustes');
  await page.fill('#pw-a', 'demo');
  await page.fill('#pw-n', 'nuevaClave1');
  await page.fill('#pw-c', 'nuevaClave1');
  await page.click('#pwform [type=submit]');
  await page.waitForTimeout(1500);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(B + 'admin.html');
  await page.fill('#pw', 'demo');
  await page.click('#login button');
  await page.waitForSelector('#login-msg .alert');
  await page.fill('#pw', 'nuevaClave1');
  await page.click('#login button');
  await page.waitForSelector('.adm-nav');
  ok(true, 'la contraseña nueva funciona y la vieja no');

  step('Celular: sin desbordes horizontales');
  const m = await browser.newContext({ viewport: { width: 375, height: 780 } });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('móvil: ' + e.message));
  for (const p of ['index.html', 'tienda.html', 'promociones.html', 'temporada.html', 'pedido.html', 'seguimiento.html', 'comentarios.html']) {
    await mp.goto(B + p);
    await mp.waitForTimeout(600);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (w > 375) errors.push(`desborde en ${p}: ${w}px`);
  }
  await mp.goto(B + 'admin.html');
  await mp.fill('#pw', 'demo'); // navegador nuevo: demo con datos de fábrica
  await mp.click('#login button');
  await mp.waitForSelector('.adm-bottom');
  for (const v of ['pedidos', 'productos', 'promociones', 'temporadas', 'opiniones', 'clientes', 'ajustes']) {
    await mp.goto(B + 'admin.html#' + v);
    await mp.waitForTimeout(700);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (w > 375) errors.push(`desborde en panel/${v}: ${w}px`);
    await shot(mp, `movil-${v}.png`);
  }
  await mp.goto(B + 'admin.html#productos');
  await mp.waitForSelector('[data-nuevo]');
  await mp.click('[data-nuevo]');
  await mp.waitForSelector('.drawer');
  await shot(mp, 'movil-editor.png');

  console.log(errors.length ? '\nERRORES:\n' + errors.join('\n') : '\nOK: todo el flujo pasó sin errores de consola ni desbordes');
  await browser.close();
  servidor.kill();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
