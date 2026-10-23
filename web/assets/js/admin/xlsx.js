// Lector mínimo de Excel (.xlsx) y CSV, sin librerías externas.
// Un .xlsx es un ZIP con XML adentro: se descomprime con DecompressionStream
// (nativo del navegador y de Node 18+) y se lee la primera hoja.

const td = new TextDecoder('utf-8');

async function inflar(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Lee el directorio central del ZIP: { 'xl/worksheets/sheet1.xml': Uint8Array, ... }
async function abrirZip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un Excel válido (.xlsx).');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const archivos = {};
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('El Excel está dañado.');
    const metodo = dv.getUint16(p + 10, true);
    const tamComprimido = dv.getUint32(p + 20, true);
    const largoNombre = dv.getUint16(p + 28, true);
    const largoExtra = dv.getUint16(p + 30, true);
    const largoComent = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nombre = td.decode(u8.subarray(p + 46, p + 46 + largoNombre));
    const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    archivos[nombre] = { metodo, datos: u8.subarray(ini, ini + tamComprimido) };
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return {
    async texto(nombre) {
      const a = archivos[nombre];
      if (!a) return null;
      if (a.metodo === 0) return td.decode(a.datos);
      if (a.metodo === 8) return td.decode(await inflar(a.datos));
      throw new Error('Formato de compresión no soportado en el Excel.');
    }
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const xmlTexto = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});

// Textos de <si>, uniendo los fragmentos <t> (texto con formato).
function textosCompartidos(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
    .map((t) => xmlTexto(t[1])).join(''));
}

// "BC12" → 54 (índice de columna desde 0)
function columna(ref) {
  const letras = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export async function leerXlsx(buffer) {
  const zip = await abrirZip(buffer);
  const libro = await zip.texto('xl/workbook.xml');
  const rels = await zip.texto('xl/_rels/workbook.xml.rels');
  let ruta = 'xl/worksheets/sheet1.xml';
  const primera = libro && libro.match(/<sheet\b[^>]*r:id="([^"]+)"/);
  if (primera && rels) {
    const rel = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${primera[1]}"[^>]*Target="([^"]+)"`))
      || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${primera[1]}"`));
    if (rel) ruta = rel[1].startsWith('/') ? rel[1].slice(1) : `xl/${rel[1].replace(/^\.\//, '')}`;
  }
  const hoja = await zip.texto(ruta);
  if (!hoja) throw new Error('No encontramos la hoja dentro del Excel.');
  const compartidos = textosCompartidos(await zip.texto('xl/sharedStrings.xml'));
  const filas = [];
  for (const f of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
      const tipo = (attrs.match(/\bt="(\w+)"/) || [])[1];
      const cuerpo = c[2] || '';
      let valor = '';
      if (tipo === 'inlineStr') valor = [...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlTexto(t[1])).join('');
      else {
        const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v !== undefined) valor = tipo === 's' ? compartidos[Number(v)] ?? '' : xmlTexto(v);
      }
      fila[ref ? columna(ref) : fila.length] = valor;
    }
    filas.push(Array.from(fila, (x) => x ?? ''));
  }
  return filas;
}

// CSV con comas o punto y coma, comillas dobles y saltos de línea dentro de comillas.
export function leerCsv(texto) {
  const t = texto.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => String(c).trim()));
}

export async function leerArchivo(file) {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return leerCsv(await file.text());
  return leerXlsx(await file.arrayBuffer());
}
