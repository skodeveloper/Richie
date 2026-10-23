// Genera un .xlsx mínimo (ZIP + XML) para las pruebas, con el mismo formato
// que exporta el punto de venta. Nunca se usa el archivo real: trae costos.
import { deflateRawSync, crc32 } from 'node:zlib';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const letra = (i) => (i >= 26 ? letra(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

function zip(archivos) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const datos = Buffer.from(texto, 'utf8');
    const comprimido = deflateRawSync(datos);
    const n = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locales.push(local, n, comprimido);
    centrales.push(central, n);
    offset += 30 + n.length + comprimido.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(centrales.length / 2, 8);
  fin.writeUInt16LE(centrales.length / 2, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}

// filas: arreglo de arreglos; los números van como número y el texto como
// texto compartido (igual que Excel).
export function crearXlsx(filas) {
  const compartidos = [];
  const indice = new Map();
  const celdas = filas.map((fila, r) => `<row r="${r + 1}">${fila.map((v, c) => {
    const ref = `${letra(c)}${r + 1}`;
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    if (!indice.has(v)) { indice.set(v, compartidos.length); compartidos.push(v); }
    return `<c r="${ref}" t="s"><v>${indice.get(v)}</v></c>`;
  }).join('')}</row>`).join('');
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Catalogo" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${celdas}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${compartidos.length}" uniqueCount="${compartidos.length}">${compartidos.map((s) => `<si><t xml:space="preserve">${xml(s)}</t></si>`).join('')}</sst>`
  });
}

export const ENCABEZADOS = ['Código', 'Producto', 'P. Costo', 'P. Venta', 'P. Mayoreo', 'Departamento', 'Existencia', 'Inv. Mínimo', 'Inv. Máximo', 'Tipo de Venta'];
// El costo de prueba (4321.987) es un valor imposible de confundir con un precio.
const fila = (codigo, producto, venta, depto, existencia, tipo = 'UNIDAD') => [codigo, producto, 4321.987, venta, 0, depto, existencia, '-', '-', tipo];

// Casos difíciles tomados del catálogo real (nombres, no costos).
export const MUESTRA = [
  ENCABEZADOS,
  fila('7501055300075', 'COCA COLA 600ML', 18, 'Coca Cola', 24),
  fila('7501000112784', 'MODERNA ESTRELLA 200G', 12, 'Scorpion Abarrote', 10),
  fila('7501064191428', 'TECATE LATA 473ML', 22, 'Cuahutemoc Moct', 0),
  fila('7500435019972', 'Cepillo Dental Oral B Pro Impac', 35, 'British', '-'),
  fila('7613036068094', 'Felix Sobre Pavo 85g', 19, 'La Costeña', 5),
  fila('7501026005787', 'Cuchara Pastelera Biodegradable 50pzas', 18, 'Scorpion Abarrote', 3),
  fila('7501031311309', 'C Marlboro Rojos 20s', 95, 'Cigarros', 12),
  fila('IMP-RET', 'Importe Ret 2.5', 15, 'Coca Cola', '-'),
  fila('FRIJOL-GR', 'FRIJOL NEGRO GRANEL', 34, 'Scorpion Abarrote', 40, 'GRANEL'),
  fila('7501035908102', 'V Tequila Don Julio Cristalino 700ml', 950, 'Vinos', 2),
  fila('7501008042953', 'Heineken Sin Alcohol 355ml', 25, 'Cuahutemoc Moct', 6),
  fila('7501055300075', 'COCA COLA 600ML (repetido)', 18, 'Coca Cola', 24),
  fila('', 'Sin código', 10, 'Scorpion Abarrote', 1)
];
