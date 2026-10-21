/*
 * Menú del Sheet, configuración inicial y disparadores simples.
 */

var CONFIG_INICIAL = [
  ['tienda_nombre', 'Abarrotes La Luna', 'Nombre que aparece en correos.'],
  ['sitio_url', 'https://abarroteslaluna.com.mx', 'Dirección del sitio (para enlaces en correos).'],
  ['email_notificacion', 'skodev.ia@gmail.com', 'Correo que recibe el aviso de cada pedido nuevo.'],
  ['email_cliente', 'SI', 'SI = enviar confirmación y cambios de estado al cliente si dejó correo.'],
  ['notificar_comentarios', 'SI', 'SI = avisar por correo cuando llega un comentario.'],
  ['pedidos_activos', 'SI', 'NO = pausa los pedidos en línea (vacaciones, inventario, etc.).'],
  ['mensaje_pedidos_pausados', 'Por el momento no recibimos pedidos en línea. Llámanos por teléfono.', 'Texto cuando los pedidos están pausados.'],
  ['envio_costo', '', 'Costo de envío a domicilio. Vacío = "se confirma por teléfono".'],
  ['envio_gratis_desde', '', 'Monto desde el cual el envío es gratis. Vacío = no aplica.'],
  ['pedido_minimo', '', 'Monto mínimo del pedido. Vacío = sin mínimo.'],
  ['colonias_cobertura', '', 'Colonias con entrega, separadas por coma. Vacío = cualquier colonia (se confirma).'],
  ['permitir_recoger', 'SI', 'SI = el cliente puede pasar a recoger a la tienda.'],
  ['pago_efectivo', 'SI', 'Acepta efectivo contra entrega.'],
  ['pago_transferencia', 'SI', 'Acepta transferencia.'],
  ['transferencia_datos', '', 'Banco, titular y CLABE. Se muestran al cliente al terminar su pedido.'],
  ['aviso_general', '', 'Mensaje que aparece arriba de todo el sitio (ej. "Hoy cerramos a las 20:00").'],
  ['telefonos', '55 5517 0726, 55 5739 3213', 'Teléfonos de la tienda, separados por coma.'],
  ['whatsapp', '', 'WhatsApp a 10 dígitos para el botón flotante del sitio. Vacío = no se muestra.'],
  ['direccion', 'Estela 60, Col. Guadalupe Tepeyac, Alcaldía Gustavo A. Madero, CDMX', 'Dirección de la tienda.'],
  ['horario_semana', '8:00-23:30', 'Horario de lunes a sábado (HH:MM-HH:MM o Cerrado).'],
  ['horario_domingo', '9:00-23:30', 'Horario de domingo (HH:MM-HH:MM o Cerrado).'],
  ['aviso_alcohol', 'La venta de bebidas alcohólicas es exclusiva para mayores de 18 años. Se pedirá identificación al entregar. Sujeto a horarios y disposiciones de ley seca.', 'Texto legal en la sección de licores.'],
  ['crm_webhook_url', '', 'Opcional: URL https de Zapier/Make/HubSpot para enviar cada pedido a un CRM externo.']
];

var PROMOS_EJEMPLO = [
  ['promo-ejemplo-2x1', 'EJEMPLO · 2x1 en Danonino', 'Llévate 2 y paga 1.', 'NXM', '', 2, 1, 'danonino-maxi,danonino-lunch', '', '', 'NO', ''],
  ['promo-ejemplo-lala', 'EJEMPLO · 10% en leche Lala', 'Descuento en toda la leche.', 'PORCENTAJE', 10, '', '', 'cat:Leche', '', '', 'NO', '']
];

var TEMPORADAS_EJEMPLO = [
  ['muertos-2026', 'Día de Muertos', 'Todo para tu ofrenda: pan de muerto, velas, chocolate y más.', '2026-10-20', '2026-11-02', 'NO', ''],
  ['posadas-2026', 'Posadas y fiestas', 'Ponche, piñatas, colación y botanas para tus posadas.', '2026-12-01', '2026-12-24', 'NO', '']
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌙 La Luna')
    .addItem('1. Configuración inicial', 'configuracionInicial')
    .addItem('2. Definir contraseña del panel', 'definirContrasenaPanel')
    .addSeparator()
    .addItem('Publicar cambios ya (limpiar caché)', 'limpiarCache')
    .addToUi();
}

// Disparador simple: al editar el catálogo, la web lo ve en segundos.
// En la hoja Pedidos, cambiar "estado" a mano también queda en el historial.
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    var nombre = sh.getName();
    if ([HOJAS.PRODUCTOS, HOJAS.PROMOCIONES, HOJAS.TEMPORADAS, HOJAS.CONFIG, HOJAS.COMENTARIOS].indexOf(nombre) >= 0) {
      limpiarCacheCatalogo_();
      return;
    }
    if (nombre === HOJAS.PEDIDOS && e.range.getRow() > 1 && e.range.getNumRows() === 1 && e.range.getNumColumns() === 1) {
      var headers = encabezados_(sh);
      if (headers[e.range.getColumn() - 1] !== 'estado') return;
      var estado = String(e.value || '').toUpperCase();
      if (ESTADOS.indexOf(estado) < 0) return;
      var colHist = headers.indexOf('historial') + 1;
      var colAct = headers.indexOf('actualizado') + 1;
      var fecha = ahora_();
      var celda = sh.getRange(e.range.getRow(), colHist);
      var historial = parseJson_(celda.getValue(), []);
      historial.push({ estado: estado, fecha: fecha, nota: '' });
      celda.setValue(JSON.stringify(historial));
      sh.getRange(e.range.getRow(), colAct).setValue(fecha);
    }
  } catch (err) {
    console.error(err);
  }
}

// Ejecútala una vez desde el editor (▶ Ejecutar) después de actualizar el código:
// Google pide autorizar los permisos nuevos (Drive para las fotos del panel).
function autorizarPermisos() {
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
  SpreadsheetApp.getActive();
  asegurarEstructura_();
  console.log('Permisos listos. Ahora: Implementar → Administrar implementaciones → Nueva versión.');
}

function limpiarCache() {
  limpiarCacheCatalogo_();
  SpreadsheetApp.getActive().toast('Listo: el sitio ya muestra los cambios.', '🌙 La Luna', 4);
}

var VERSION_ESTRUCTURA = '2';

// Se llama en cada petición: si el código es más nuevo que la hoja, la
// actualiza sola (hojas, columnas y ajustes nuevos). Nadie abre el Sheet.
function asegurarEstructura_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ESTRUCTURA') === VERSION_ESTRUCTURA) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (props.getProperty('ESTRUCTURA') === VERSION_ESTRUCTURA) return;
    prepararLibro_(libro_());
    props.setProperty('ESTRUCTURA', VERSION_ESTRUCTURA);
  } finally {
    lock.releaseLock();
  }
}

function configuracionInicial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  prepararLibro_(ss);
  PropertiesService.getScriptProperties().setProperty('ESTRUCTURA', VERSION_ESTRUCTURA);
  SpreadsheetApp.getUi().alert('🌙 Listo. Se crearon las hojas y el catálogo inicial.\n\n' +
    'Siguiente paso: menú 🌙 La Luna → 2. Definir contraseña del panel.');
}

function prepararLibro_(ss) {
  Object.keys(COLUMNAS).forEach(function (nombre) { asegurarHoja_(ss, nombre, COLUMNAS[nombre]); });

  var config = ss.getSheetByName(HOJAS.CONFIG);
  if (config.getLastRow() > 1) {
    var existentes = {};
    config.getRange(2, 1, config.getLastRow() - 1, 1).getValues().forEach(function (r) { existentes[String(r[0])] = true; });
    CONFIG_INICIAL.forEach(function (c) { if (!existentes[c[0]]) config.appendRow(c); });
  } else {
    sembrar_(config, CONFIG_INICIAL);
  }
  sembrar_(ss.getSheetByName(HOJAS.PRODUCTOS), SEED_PRODUCTOS.map(function (p) {
    return COLUMNAS.Productos.map(function (k) { return p[k] === undefined ? '' : p[k]; });
  }));
  sembrar_(ss.getSheetByName(HOJAS.PROMOCIONES), PROMOS_EJEMPLO);
  sembrar_(ss.getSheetByName(HOJAS.TEMPORADAS), TEMPORADAS_EJEMPLO);

  var siNo = SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build();
  validarColumnas_(ss.getSheetByName(HOJAS.PRODUCTOS), ['visible', 'disponible', 'destacado', 'es_alcohol'], siNo);
  validarColumnas_(ss.getSheetByName(HOJAS.PROMOCIONES), ['activa'], siNo);
  validarColumnas_(ss.getSheetByName(HOJAS.TEMPORADAS), ['activa'], siNo);
  validarColumnas_(ss.getSheetByName(HOJAS.PROMOCIONES), ['tipo'],
    SpreadsheetApp.newDataValidation().requireValueInList(LunaPromos.TIPOS, true).build());
  validarColumnas_(ss.getSheetByName(HOJAS.PEDIDOS), ['estado'],
    SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build());
  validarColumnas_(ss.getSheetByName(HOJAS.COMENTARIOS), ['estado'],
    SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS_COMENTARIO, true).build());

  // Texto plano para que los teléfonos y folios no se conviertan en números.
  formatoTexto_(ss.getSheetByName(HOJAS.PEDIDOS), ['folio', 'telefono', 'fecha', 'actualizado']);
  formatoTexto_(ss.getSheetByName(HOJAS.CLIENTES), ['telefono', 'primer_pedido', 'ultimo_pedido']);
  formatoTexto_(ss.getSheetByName(HOJAS.COMENTARIOS), ['fecha']);
  formatoTexto_(ss.getSheetByName(HOJAS.PROMOCIONES), ['inicio', 'fin']);
  formatoTexto_(ss.getSheetByName(HOJAS.TEMPORADAS), ['inicio', 'fin']);
  formatoTexto_(config, ['valor']);

  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  limpiarCacheCatalogo_();
}

function definirContrasenaPanel() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Contraseña del panel', 'Escribe la nueva contraseña (mínimo 8 caracteres). ' +
    'Cerrará las sesiones abiertas.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    guardarContrasena_(r.getResponseText());
    ui.alert('Contraseña guardada.');
  } catch (e) {
    ui.alert(e.message);
  }
}

function asegurarHoja_(ss, nombre, columnas) {
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  var actuales = sh.getLastColumn() ? encabezados_(sh) : [];
  var faltan = columnas.filter(function (c) { return actuales.indexOf(c) < 0; });
  if (faltan.length) {
    sh.getRange(1, actuales.filter(String).length + 1, 1, faltan.length).setValues([faltan]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#163e35').setFontColor('#f7f4e9');
  return sh;
}

function sembrar_(sh, filas) {
  if (sh.getLastRow() > 1 || !filas.length) return;
  sh.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
}

function validarColumnas_(sh, columnas, regla) {
  var headers = encabezados_(sh);
  columnas.forEach(function (c) {
    var col = headers.indexOf(c) + 1;
    if (col > 0) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(regla);
  });
}

function formatoTexto_(sh, columnas) {
  var headers = encabezados_(sh);
  columnas.forEach(function (c) {
    var col = headers.indexOf(c) + 1;
    if (col > 0) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  });
}
