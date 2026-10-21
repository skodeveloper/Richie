// Cliente de la API (Apps Script). Si no hay API_URL, usa el backend de demostración.
import { demoApi } from './demo-api.js';

const cfg = window.LUNA_CONFIG;
export const DEMO = !cfg.API_URL;

const CATALOGO_KEY = 'luna_catalogo_v1';

async function call(url, options) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', ...options });
  } catch (e) {
    throw new Error('No pudimos conectar con el servidor de la tienda. Intenta de nuevo en unos minutos o llámanos.');
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error('El servidor no respondió correctamente. Intenta de nuevo.');
  }
  if (!json.ok) throw new Error(json.error || 'Ocurrió un error.');
  return json.data;
}

const get = (params) => call(cfg.API_URL + '?' + new URLSearchParams(params));
// text/plain evita la verificación CORS previa (Apps Script no la soporta).
const post = (body) => call(cfg.API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(body)
});

const remoteApi = {
  catalog: () => get({ action: 'catalog' }),
  track: (folio, telefono) => get({ action: 'track', folio: folio || '', telefono: telefono || '' }),
  comments: () => get({ action: 'comments' }),
  createOrder: (pedido) => post({ action: 'createOrder', ...pedido }),
  updateOrder: (datos) => post({ action: 'updateOrder', ...datos }),
  addComment: (c) => post({ action: 'addComment', ...c }),
  login: (password) => post({ action: 'login', password }),
  logout: (token) => post({ action: 'logout', token }),
  adminOrders: (token, filtros) => post({ action: 'adminOrders', token, ...filtros }),
  adminUpdateOrder: (token, datos) => post({ action: 'adminUpdateOrder', token, ...datos }),
  adminComments: (token) => post({ action: 'adminComments', token }),
  adminModerateComment: (token, datos) => post({ action: 'adminModerateComment', token, ...datos }),
  adminCatalog: (token) => post({ action: 'adminCatalog', token }),
  adminSaveProducts: (token, datos) => post({ action: 'adminSaveProducts', token, ...datos }),
  adminDeleteProduct: (token, datos) => post({ action: 'adminDeleteProduct', token, ...datos }),
  adminSavePromo: (token, datos) => post({ action: 'adminSavePromo', token, ...datos }),
  adminDeletePromo: (token, datos) => post({ action: 'adminDeletePromo', token, ...datos }),
  adminSaveSeason: (token, datos) => post({ action: 'adminSaveSeason', token, ...datos }),
  adminDeleteSeason: (token, datos) => post({ action: 'adminDeleteSeason', token, ...datos }),
  adminSaveConfig: (token, datos) => post({ action: 'adminSaveConfig', token, ...datos }),
  adminClients: (token, datos) => post({ action: 'adminClients', token, ...datos }),
  adminChangePassword: (token, datos) => post({ action: 'adminChangePassword', token, ...datos }),
  adminUploadImage: (token, datos) => post({ action: 'adminUploadImage', token, ...datos })
};

export const api = DEMO ? demoApi : remoteApi;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CATALOGO_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

// Catálogo con "stale-while-revalidate": pinta al instante lo guardado y
// luego actualiza con lo más reciente del Sheet.
export async function loadCatalog(onData) {
  const cached = readCache();
  if (cached && onData) onData(cached, true);
  try {
    const fresh = await api.catalog();
    try { localStorage.setItem(CATALOGO_KEY, JSON.stringify(fresh)); } catch (e) { /* sin espacio */ }
    if (onData) onData(fresh, false);
    return fresh;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}
