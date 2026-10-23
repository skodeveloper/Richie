# Pruebas de aceptación · Panel de administración v2

Objetivo: confirmar que la tienda puede operar **todo desde la página**, sin abrir el Google Sheet.
Marca cada prueba con ✅ o ❌ y anota lo que veas. Hazlas en el sitio real (después de actualizar) desde
**celular y computadora**. Usa un teléfono tuyo para los pedidos de prueba y cancélalos al final.

> Ya pasaron en automático (modo demostración): 25 pruebas del servidor y un recorrido de 16 etapas en
> navegador (`npm test` y `npm run e2e`). Estas son las pruebas reales, con tu Google.

## A. Acceso
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| A1 | Abre `/admin.html` y entra con la contraseña | Ves el panel con menú: Pedidos, Productos, Promociones, Temporadas, Opiniones, Clientes, Ajustes | |
| A2 | Escribe una contraseña equivocada | “Contraseña incorrecta”, no entra | |
| A3 | En celular, toca **Más** | Se abre el menú lateral con todas las secciones | |

## B. Productos
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| B1 | Filtro **Sin precio** → escribe un precio y presiona Enter | Se guarda (aviso verde), el cursor pasa al siguiente y el contador baja | |
| B2 | Abre el sitio → Tienda y busca ese producto | Muestra el precio nuevo | |
| B3 | Apaga **Disponible** en un producto | En el sitio aparece “Agotado” y no se puede agregar | |
| B4 | Toca la ★ de un producto | Aparece en “Lo más pedido” de la portada | |
| B5 | **+ Nuevo producto** con nombre, categoría nueva, precio y **foto desde el celular** | Se crea; en la tienda sale con su foto y su categoría nueva | |
| B6 | Edita ese producto y cambia la presentación | El cambio se ve en la tienda | |
| B7 | Elimina el producto de prueba | Desaparece del panel y del sitio | |

## C. Promociones
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| C1 | **+ Nueva promoción** → Lleva y paga 2 / 1 → elige un producto con precio | La vista previa muestra el ejemplo con descuento | |
| C2 | Guárdala y ve a Promociones del sitio | Aparece la tarjeta 2x1 y el producto con su etiqueta | |
| C3 | Agrega 2 piezas al carrito | El resumen muestra el descuento | |
| C4 | Apaga el interruptor **Activa** | Desaparece del sitio | |
| C5 | Crea una de % para **una categoría** y otra con fecha de inicio futura | La de categoría aplica a todos sus productos; la futura sale como “Programada” y no se ve aún | |

## D. Temporadas
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| D1 | **+ Nueva temporada** (ej. Navidad) con 2–3 productos | Aparece en la página Temporada y en la portada | |
| D2 | Ponle fecha de fin de ayer | Deja de mostrarse en el sitio | |

## E. Ajustes
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| E1 | Costo de envío y una colonia → **Guardar cambios** | En el carrito sale el envío; otra colonia es rechazada | |
| E2 | WhatsApp de 10 dígitos | Aparece el botón verde de WhatsApp en el sitio | |
| E3 | Aviso general “Prueba de aviso” | Sale la franja arriba del sitio; al borrarlo desaparece | |
| E4 | Cambia el horario de domingo | El pie de página y “Abierto/Cerrado” del encabezado lo reflejan | |
| E5 | Datos para transferencia | El cliente los ve al terminar un pedido con transferencia | |
| E6 | Apaga **Recibir pedidos en línea** | El panel dice “Pedidos pausados”; el carrito muestra el mensaje y no deja continuar. Vuelve a encenderlo | |
| E7 | Correo que recibe los pedidos = el de la tienda | El siguiente pedido llega a ese correo | |
| E8 | Cambia la contraseña | Te pide entrar de nuevo; la vieja ya no sirve | |

## F. Pedidos de punta a punta
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| F1 | Haz un pedido de prueba en el sitio (celular) | Recibes folio; en el panel suena y aparece en “Nuevos”; llega correo | |
| F2 | En Seguimiento, “Agregar productos” | Se actualiza el mismo folio | |
| F3 | En el panel: **Marcar: Confirmado → En preparación → En camino → Entregado** | El seguimiento del cliente avanza en cada paso | |
| F4 | **Imprimir ticket** | Sale solo ese pedido en la hoja | |
| F5 | En Seguimiento del pedido entregado, **Volver a pedir lo mismo** | El carrito se llena con esos productos | |
| F6 | **Clientes** | Aparece tu cliente de prueba con su número de pedidos y total | |

## G. Opiniones
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| G1 | Deja una opinión en el sitio | Llega como “Por revisar” al panel (con contador) | |
| G2 | Respóndela y **Publicar** | Aparece en Opiniones del sitio con tu respuesta | |

## H. Sitio público (experiencia)
| # | Qué revisar | ✅/❌ |
|---|---|---|
| H1 | Encabezado: “Abierto · cierra …” o “Cerrado · abre …” correcto | |
| H2 | Productos sin foto muestran un ícono de su categoría (no letras) | |
| H3 | En la tienda, al escribir en el buscador busca en todas las categorías | |
| H4 | Las categorías muestran cuántos productos tienen | |
| H5 | Menú dice “Seguir pedido” y el botón “Carrito” (antes ambos decían “Mi pedido”) | |
| H6 | Si la tienda está cerrada, el carrito avisa que el pedido se atiende al abrir | |
| H7 | Portada: el buscador “Busca: leche, pan…” lleva a la tienda con los resultados | |
| H8 | Tienda: “Explora por categoría” con íconos; al tocar una se filtra y sube a los productos | |
| H9 | Buscar “leche lala” o “frijoles” encuentra los productos aunque el orden o el plural no coincidan | |
| H10 | Sin resultados: dice qué se buscó y ofrece preguntar por WhatsApp con el texto ya escrito | |
| H11 | En celular los productos se ven en lista compacta (4–5 por pantalla) y el paso del pedido dice su nombre | |

## I. Catálogo del punto de venta y granel
| # | Qué haces | Qué debe pasar | ✅/❌ |
|---|---|---|---|
| I1 | **Productos → 📥 Importar del punto de venta** → elige `CATALOGO.xlsx` | Vista previa: ~3,295 nuevos, ~3,183 a publicar, 91 cigarros y 21 internos ocultos, 605 agotados, 48 a granel | |
| I2 | Abre “Ejemplos de cómo se verán los nombres” | Nombres limpios (sin “V ”/“F ”), presentación aparte (600 ml, 1 kg) y categoría razonable | |
| I3 | Deja marcado “Ocultar los productos actuales…” → **Importar** | Barra de avance; al terminar, el aviso con nuevos/ocultos. Los anteriores quedan al final, en “Ocultos” | |
| I4 | Vuelve a importar el mismo archivo | 0 nuevos, todo “Sin cambios” (no duplica) | |
| I5 | Cambia un precio en el punto de venta, exporta e importa | Solo ese precio cambia; nombre/foto/categoría editados se respetan | |
| I6 | En la tienda busca “frijol” o “granel” | Precio “/kg”; “Agregar ½ kg”; con + y − sube/baja de ¼ en ¼ | |
| I7 | Pide ¾ kg y envía el pedido | El correo, el panel y el seguimiento dicen “¾ kg”; aviso de que el total se ajusta al pesar | |
| I8 | Tienda → **Todo** | Se ven 48 productos y **Ver más** carga los siguientes; agotados al final | |
| I9 | En una promoción, marca productos con el buscador | Encuentra por nombre, marca o código de barras entre todos los productos | |

**Aprobación:** Nombre ____________________ Fecha ____________ ¿Se aprueba para grabar el video nuevo? Sí / No
