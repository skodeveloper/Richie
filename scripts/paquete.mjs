// Genera los paquetes listos para instalar:
//   dist/Codigo.gs            → un solo archivo para pegar en Apps Script
//   dist/la-luna-hostgator.zip → contenido de web/ para subir a public_html
// Uso: npm run paquete
//      API_URL=https://script.google.com/macros/s/XXX/exec npm run paquete   (deja el zip ya conectado)
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

// Apps Script comparte un solo espacio global entre archivos, así que unirlos
// en uno es equivalente. Promos y Config van primero (definen LunaPromos y ErrorUsuario).
// Seed (el catálogo inicial, muy largo) al final para que el código se lea primero.
const PRIMERO = ['Promos.gs', 'Config.gs', 'Code.gs'];
const ORDEN = [...PRIMERO, ...readdirSync(join(root, 'apps-script'))
  .filter((f) => f.endsWith('.gs') && !PRIMERO.includes(f) && f !== 'Seed.gs').sort(), 'Seed.gs'];
const gs = ORDEN.map((f) => {
  const src = readFileSync(join(root, 'apps-script', f), 'utf8').replace(/^\/\/ ARCHIVO GENERADO.*\n/, '');
  return `// ===================== ${f} =====================\n${src.trimEnd()}\n`;
}).join('\n');
writeFileSync(join(dist, 'Codigo.gs'),
  '// Abarrotes La Luna · backend completo en un solo archivo.\n' +
  '// Pégalo entero en Extensiones → Apps Script (reemplazando Código.gs).\n' +
  '// ARCHIVO GENERADO por `npm run paquete` desde apps-script/ — para cambios, edita allá.\n\n' + gs);
console.log('✓ dist/Codigo.gs');

// Zip para HostGator: el contenido de web/ en la raíz del zip.
const tmp = join(dist, '.web');
rmSync(tmp, { recursive: true, force: true });
cpSync(join(root, 'web'), tmp, { recursive: true });
const apiUrl = process.env.API_URL || '';
if (apiUrl) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(apiUrl)) {
    throw new Error('API_URL no parece una URL de Apps Script (debe terminar en /exec).');
  }
  const cfg = join(tmp, 'assets/js/config.js');
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace("API_URL: ''", `API_URL: '${apiUrl}'`));
}
const zip = join(dist, 'la-luna-hostgator.zip');
rmSync(zip, { force: true });
execFileSync('zip', ['-rqX', zip, '.'], { cwd: tmp });
rmSync(tmp, { recursive: true, force: true });
const conectado = /API_URL: 'https:/.test(readFileSync(join(root, 'web/assets/js/config.js'), 'utf8')) || apiUrl;
console.log(`✓ dist/la-luna-hostgator.zip ${conectado ? '(conectado a la API)' : '(modo demostración: falta API_URL)'}`);
