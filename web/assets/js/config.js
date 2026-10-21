/*
 * Configuración del sitio.
 *
 * API_URL: pega aquí la URL de la implementación web del Apps Script
 * (termina en /exec). Mientras esté vacía, el sitio funciona en
 * "modo demostración" con datos de ejemplo guardados en el navegador.
 *
 * Lo que cambia seguido (productos, precios, promociones, envío, avisos)
 * NO va aquí: se edita en el Google Sheet.
 */
window.LUNA_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzWlebgy9hOsqfJdwZvGQ53HQM4LYf_AYZuu_rcGkgjLKUqq-iATwhQJUKlYH8IUMJN/exec',

  negocio: {
    nombre: 'Abarrotes La Luna',
    lema: 'Más de 20 años',
    direccion: 'Estela 60, Col. Guadalupe Tepeyac, Alcaldía Gustavo A. Madero, CDMX',
    mapa: 'https://www.google.com/maps/dir/?api=1&destination=Estela%2060%2C%20Guadalupe%20Tepeyac%2C%20Gustavo%20A.%20Madero%2C%20Ciudad%20de%20M%C3%A9xico%2C%20M%C3%A9xico',
    telefonos: [
      { texto: '55 5517 0726', tel: '+525555170726' },
      { texto: '55 5739 3213', tel: '+525557393213' }
    ],
    // Número de WhatsApp a 10 dígitos cuando esté listo, ej. '5555170726'. Vacío = no se muestra.
    whatsapp: '',
    horario: [
      { dias: 'Lunes a sábado', horas: '8:00 a 23:30' },
      { dias: 'Domingos', horas: '9:00 a 23:30' }
    ]
  }
};
