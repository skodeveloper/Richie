// Genera las copias derivadas a partir de las fuentes únicas:
//   shared/promos.js           → web/assets/js/promos.js y apps-script/Promos.gs
//   data/catalogo-inicial.json → apps-script/Seed.gs y web/data/demo.json (productos)
// Uso: npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const write = (p, s) => {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), s);
  console.log('✓', p);
};

const aviso = '// ARCHIVO GENERADO por `npm run build` — no lo edites aquí.\n';
const promos = read('shared/promos.js');
write('web/assets/js/promos.js', aviso + promos);
write('apps-script/Promos.gs', aviso + promos);

const catalogo = JSON.parse(read('data/catalogo-inicial.json'));
write('apps-script/Seed.gs', aviso +
  '// Catálogo inicial que se carga en la hoja Productos con "Configuración inicial".\n' +
  'var SEED_PRODUCTOS = ' + JSON.stringify(catalogo, null, 1) + ';\n');

// Datos del modo demostración: catálogo real + precios y promociones de EJEMPLO.
const demoExtra = JSON.parse(read('data/demo-extra.json'));
const productos = catalogo
  .filter((p) => p.visible === 'SI')
  .map((p) => ({
    ...p,
    precio: demoExtra.precios[p.id] ?? null,
    destacado: demoExtra.destacados.includes(p.id) ? 'SI' : p.destacado
  }))
  .concat(demoExtra.productos);
write('web/data/demo.json', JSON.stringify({
  config: demoExtra.config,
  productos,
  promociones: demoExtra.promociones,
  temporadas: demoExtra.temporadas,
  comentarios: demoExtra.comentarios
}, null, 1) + '\n');
