// Simulador mínimo de los servicios de Google Apps Script para probar el
// backend en Node: hojas en memoria, caché, propiedades, correo, etc.
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

class Range {
  constructor(sheet, row, col, nr = 1, nc = 1) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const row = [];
      for (let c = 0; c < this.nc; c++) row.push(this.sheet.cell(this.row + r, this.col + c));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.sheet.cell(this.row, this.col); }
  setValues(v) { v.forEach((row, r) => row.forEach((x, c) => this.sheet.put(this.row + r, this.col + c, x))); return this; }
  setValue(v) { this.sheet.put(this.row, this.col, v); return this; }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.nr; }
  getNumColumns() { return this.nc; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setNumberFormat() { return this; } setDataValidation() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  cell(r, c) { return (this.data[r - 1] || [])[c - 1] ?? ''; }
  put(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    // Sheets guarda "'=x" como el texto "=x"
    row[c - 1] = typeof v === 'string' && v.startsWith("'") ? v : v;
  }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getMaxRows() { return 1000; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(arr) { this.data.push(arr.slice()); }
  setFrozenRows() {}
}

export function createGas({ singleFile } = {}) {
  const sheets = new Map();
  const ss = {
    getId: () => 'SS1',
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()],
    deleteSheet: (s) => sheets.delete(s.name),
    toast: () => {}
  };
  const cache = new Map();
  const props = new Map();
  const mails = [];
  const fetches = [];
  const fmt = (d, tz, pattern) => {
    const p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return pattern.replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day)
      .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  };
  const validation = { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } };
  const ctx = {
    console,
    SpreadsheetApp: {
      openById: () => ss,
      getActiveSpreadsheet: () => ss,
      getActive: () => ss,
      newDataValidation: () => validation,
      getUi: () => ({ alert: () => {}, prompt: () => ({}), ButtonSet: {}, Button: {} })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => { cache.set(k, String(v)); },
        remove: (k) => cache.delete(k),
        removeAll: (ks) => ks.forEach((k) => cache.delete(k))
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, v),
        setProperties: (o) => Object.entries(o).forEach(([k, v]) => props.set(k, v))
      })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: fmt,
      getUuid: () => randomUUID(),
      sleep: () => {},
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...createHash(alg).update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b))
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; } })
    },
    MailApp: { sendEmail: (o) => mails.push(o) },
    UrlFetchApp: { fetch: (url, o) => fetches.push({ url, o }) }
  };
  vm.createContext(ctx);
  if (singleFile) {
    vm.runInContext(readFileSync(singleFile, 'utf8'), ctx, { filename: 'Codigo.gs' });
  } else {
    const dir = new URL('../apps-script/', import.meta.url);
    const order = ['Promos.gs', 'Config.gs', ...readdirSync(dir).filter((f) => f.endsWith('.gs') && !['Promos.gs', 'Config.gs'].includes(f))];
    for (const f of order) vm.runInContext(readFileSync(new URL(f, dir), 'utf8'), ctx, { filename: f });
  }

  const parse = (out) => JSON.parse(out.content);
  return {
    ctx, ss, sheets, cache, props, mails, fetches,
    get: (params) => parse(ctx.doGet({ parameter: params })),
    post: (body) => parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } })),
    rows: (name) => {
      const s = sheets.get(name);
      const [h, ...rest] = s.data;
      return rest.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
    },
    setCell(name, id, col, value) {
      const s = sheets.get(name);
      const h = s.data[0];
      const row = s.data.find((r) => r[0] === id);
      row[h.indexOf(col)] = value;
      cache.clear();
    }
  };
}
