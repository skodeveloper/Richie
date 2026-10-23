// Convierte la exportación del punto de venta (Código, Producto, P. Venta,
// Departamento, Existencia, Tipo de Venta…) en productos de la tienda:
// limpia nombres, separa la presentación, asigna categoría y marca, marca
// licores y granel, y oculta lo que no es para clientes. Nunca usa el costo.

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const CATEGORIAS = [
  'Bebidas', 'Cerveza', 'Vinos y licores', 'Botanas', 'Dulces y chocolates', 'Pan, galletas y tortillas',
  'Lácteos y huevo', 'Salchichonería y quesos', 'Helados', 'Café, té y cereales', 'Enlatados y salsas',
  'Pastas, arroz y granos', 'Aceites y condimentos', 'Despensa', 'Limpieza del hogar', 'Higiene personal',
  'Farmacia', 'Bebé', 'Mascotas', 'Varios', 'Cigarros'
];

// Departamentos que son proveedores o marcas: categoría y marca directas.
const DEPARTAMENTOS = {
  'coca cola': ['Bebidas', 'Coca-Cola'], pepsi: ['Bebidas', 'Pepsi'], penafiel: ['Bebidas', 'Peñafiel'],
  jarritos: ['Bebidas', 'Jarritos'], boing: ['Bebidas', 'Boing'], 'del valle': ['Bebidas', 'Del Valle'],
  jumex: ['Bebidas', 'Jumex'], bonafont: ['Bebidas', 'Bonafont'], 'bonafont garrafon': ['Bebidas', 'Bonafont'],
  epura: ['Bebidas', 'Epura'], ciel: ['Bebidas', 'Ciel'], 'sporade volt': ['Bebidas', 'Volt'], sangria: ['Bebidas', ''],
  'cuahutemoc moct': ['Cerveza', ''], vinos: ['Vinos y licores', ''], vinateria: ['Vinos y licores', ''],
  sabritas: ['Botanas', 'Sabritas'], barcel: ['Botanas', 'Barcel'], friturinas: ['Botanas', ''],
  'botanas ciro/charly': ['Botanas', ''], dulceria: ['Dulces y chocolates', ''], ricolino: ['Dulces y chocolates', 'Ricolino'],
  'cadbury adams': ['Dulces y chocolates', ''], bimbo: ['Pan, galletas y tortillas', 'Bimbo'],
  marinela: ['Pan, galletas y tortillas', 'Marinela'], wonder: ['Pan, galletas y tortillas', 'Wonder'],
  gamesa: ['Pan, galletas y tortillas', 'Gamesa'], guna: ['Pan, galletas y tortillas', ''],
  'el queretano': ['Pan, galletas y tortillas', ''], lala: ['Lácteos y huevo', 'Lala'], alpura: ['Lácteos y huevo', 'Alpura'],
  alpua: ['Lácteos y huevo', 'Alpura'], danone: ['Lácteos y huevo', 'Danone'], bonafina: ['Lácteos y huevo', ''],
  fud: ['Salchichonería y quesos', 'FUD'], 'carnes frias y creme': ['Salchichonería y quesos', ''],
  cremeria: ['Salchichonería y quesos', ''], holanda: ['Helados', 'Holanda'], "kellogg´s": ['Café, té y cereales', "Kellogg's"],
  "kellogg's": ['Café, té y cereales', "Kellogg's"], 'nestle(cafe bebidas)': ['Café, té y cereales', 'Nestlé'],
  'clemente jacques': ['Enlatados y salsas', 'Clemente Jacques'], 'la costena': ['Enlatados y salsas', 'La Costeña'],
  sabormex: ['Enlatados y salsas', ''], especias: ['Aceites y condimentos', ''], roldan: ['Limpieza del hogar', ''],
  'bolsa la huasteca': ['Limpieza del hogar', ''], ac: ['Limpieza del hogar', ''], 'cuidado personal': ['Higiene personal', ''],
  'casa croqueta': ['Mascotas', ''], 'cable y conectores': ['Varios', ''], pilas: ['Varios', ''], telcel: ['Varios', 'Telcel'],
  link: ['Varios', ''], cigarros: ['Cigarros', ''], 'philips morris': ['Cigarros', ''], phillips: ['Cigarros', ''],
  british: ['Cigarros', ''], this: ['Cigarros', ''], 'gelatinas roly': ['Despensa', ''], roly: ['Despensa', '']
};

// Solo dan la marca; la categoría sale de las palabras del nombre.
const MARCAS = {
  'nestle abarrote': 'Nestlé', gloria: 'Gloria', 'don fer': 'Don Fer', barrilito: 'Barrilito', 'la sierra': 'La Sierra'
};

// Uso interno del punto de venta: no se publican.
const INTERNOS_DEP = ['materias primas', 'la luna'];
const INTERNOS = /^(importe\b|consumo minimo|envase\b|costal\b|caja (gde|grande|chica)\b|bolsa (poli|compostable)\b|cuchara$)/;

// Pistas tan claras que ganan al departamento (el punto de venta agrupa por
// proveedor: Felix llega con La Costeña, un cepillo dental con British…).
const PRIMERO = [
  ['Mascotas', /\b(felix|dog chow|cat chow|pedigree|pedrigree|whiskas|beneful|minino|ganador)\b/],
  ['Higiene personal', /\b(cepillo dental|oral ?b|panal para adulto|tena)\b/],
  ['Café, té y cereales', /\b(coff?e+[ -]?mate|cafe (oro|soluble|legal)|nescafe|necafe|choco ?milk|cal-?c-?tose)\b/],
  ['Botanas', /\bpringles\b/],
  ['Lácteos y huevo', /\b(yoplait|yogh?urt|yogur|griego|licuado|malteada)\b/],
  ['Enlatados y salsas', /\b(aceitunas|campbell'?s)\b/],
  ['Limpieza del hogar', /\b(jabon (en |de )?pasta|suavitel|downy|ensueno)\b/],
  ['Aceites y condimentos', /\bjugoso al sarten\b/],
  ['Despensa', /\b(d'?gari|ggari|jell-?o|jell\.o|grenetina|maizena)\b/],
  ['Bebidas', /\b(ensure|boost|deliciosa)\b/]
];

// Marcas de cerveza que también son palabras comunes (Moderna Estrella,
// Maíz El Indio): solo cuentan si el nombre trae medida de bebida.
const CERVEZA_AMBIGUA = /\b(corona|victoria|modelo|indio|estrella|sol)\b/;
const MEDIDA_BEBIDA = /\d ?(ml|l|lt|lts)\b|\b(lata|botella|clamato|caguam\w*|six)\b/;

// Primera regla que coincide gana: el orden importa.
const REGLAS = [
  ['Mascotas', /\b(dog chow|cat chow|pedigree|whiskas|ganador|croquetas?|alpiste|felix|minino|purina|beneful|kitty|arena para gato)\b/],
  ['Bebé', /\b(gerber|panal(es)?|huggies|kleen bebe|mamila|chupon|biberon|toallitas humedas|similac|enfamil|nan \d|baby)\b/],
  ['Cigarros', /\b(marlboro|camel|benson|pall mall|lucky strike|delicados|faros|montana|chesterfield|winston|raleigh|boots)\b/],
  ['Cerveza', /\b(cerveza|caguam\w*|tecate|heineken|xx (ambar|lager)|dos equis|carta blanca|bohemia|noche buena|michelob|pacifico|stella artois|amstel|miller|budweiser|bud light)\b/],
  ['Cerveza', { test: (n) => CERVEZA_AMBIGUA.test(n) && MEDIDA_BEBIDA.test(n) }],
  ['Vinos y licores', /\b(tequila|mezcal|vodka|ron|whisky|whiskey|brandy|rompope|licor|vino|sidra|anis|ginebra|cognac|champagne|espumoso|boones|cooler|vina real|four loko|bacardi|smirnoff|cuervo|jagermeister|baileys|kahlua|charanda|pulque|caribe cooler|cana de oro|strongbow|huasteco|bucanas|buchanan'?s|presidente|azteca de oro|torres \d+|martell)\b/],
  ['Helados', /\b(helado|paleta helada|cornetto|magnum|mordisko|chemisse|choco crem|bon ice|bonice|nieve|kolorix|esquimal)\b/],
  ['Farmacia', /\b(tabletas?|capsulas?|\d+ ?mg|jarabe|ampolleta|suspension|vick|vaporub|curitas|alcohol (etilico|del \d+)|agua oxigenada|merthi\w+|gasas?|venda|termometro|paracetamol|ibuprofeno|aspirina|naproxeno|omeprazol|pantoprazol|loperamida|pepto|sal de uvas|alka|tempra|desenfriol|tabcin|xl-?3|next|cubrebocas|condon(es)?|preservativos?|prudence|sico|prueba de embarazo|cafiaspirinas?|melox|clorfenamina|theraflu|jeringas?|microdin|glicerina|microporosa|alcohol (asis|lourdes))\b/],
  ['Higiene personal', /\b(shampoo|champu|acondicionador|jabon de tocador|pasta dental|crema dental|colgate|cepillo dental|enjuague|listerine|desodorante|antitranspirante|rastrillo|gillette|toallas? femenin\w+|kotex|saba|always|tampon\w*|tampax|papel higienico|petalo|regio|kleenex|panuelos|talco|crema para peinar|gel para (el )?cabello|tinte|algodon|hisopos|cotonetes|protector solar|bloqueador|crema corporal|nivea|dove|palmolive|head ?&? ?shoulders|pantene|sedal|savile|herbal essences|axe|rexona|speed stick|mennen|nordiko|tio nacho|caprice|elvive|garnier|jabon (de )?(barra|liquido para manos)|aceite (de )?almendras|aceite para bebe|crema (facial|de manos)|toallas desmaquillantes|gel (antibacterial|antiseptico|ego|atm)|desodorante|desorante|grisi|naturella|escudo|zest|old spice|jab(on)? liq\w*|papel premier|corta ?unas|navaja|pomada|acetona|st ives|pond'?s|angel face|cera ego|xiomara|vogue|hortensia|papel facial|big roll|tender \d+ ?hojas|pasador|almoadillas|labisan|shampo|plax|neutro balance|absorsec|sacate|toallitas)\b/],
  ['Limpieza del hogar', /\b(cloro|cloralex|pinol|fabuloso|detergente|suavitel|downy|ariel|persil|roma|foca|zote|ace|vel rosita|salvo|axion|lavatrastes|fibra|esponja|estropajo|escoba|trapeador|recogedor|bolsas? (de )?basura|aluminio|plastico autoadherible|ziploc|servilletas?|toalla de cocina|papel de cocina|insecticida|raid|baygon|aromatizante|glade|pledge|limpiador|desinfectante|lysol|maestro limpio|guantes|cubeta|jerga|trapo|lazo|drano|tricloro|pastilla pato|pato purific|harpic|bold|vanish|clorox|mr musculo|windex|cif|ajax|brasso|blanqueador|poett|carisma|blanca nieves|mas (color|oscura)|air ?wick|off|caza ?facil|cazamoscas|catch ?a ?max|trampa|cybor|raidolitos|acido muriatico|easy-?off|nugget|almidon|jalador|mechudo|scotch ?brite|pelicula plastica|plastipack|papel encerado|sanitas|sultan)\b/],
  ['Café, té y cereales', /\b(cafe|nescafe|cafe de olla|te de|te verde|manzanilla|cereal|corn flakes|zucaritas|choco krispis|froot loops?|special k|all bran|avena|granola|chocomilk|nesquik|cola cao|abuelita|chocolate en polvo|coffee mate|splenda|canderel|stevia|hot ?cakes|legal|cheerios|trix|morelia|choco choco|ibarra)\b/],
  ['Botanas', /\b(doritos|cheetos|ruffles|tostitos|fritos|takis|chips|papas|churrumais|rancheritos|crujitos|chicharron(es)?|cacahuates?|palomitas|totis|runners|karate|pistaches?|semillas? de girasol|botana|nuez|nueces|almendras?|pasas|arandanos|platanitos|kiyakis|sabritones|cheto|hut|pringles|churritos|nachos|palomita|act ii|nishikawa|maiz palomero)\b/],
  ['Pan, galletas y tortillas', /\b(pan|panque|bimbo|marinela|gansito|pinguinos|roles|mantecadas|donas|galletas?|emperador|marias|saladitas|tortillas?|tostadas?|totopos|bolillo|pastelito|tia rosa|nito|submarinos?|barritas|canelitas|chokis|oreo|principe|triki|ricanelas|surtid[ao]s|wafer|waffer|pan dulce|bisquets?|croissant|hot dog|hamburguesa|churro|orejitas|donas?|polvorones|ritz|surtido|primavera|brownie|pastelitos|vuala|macma|sopes)\b/],
  ['Dulces y chocolates', /\b(chocolates?|chicles?|paletas?|caramelos?|gomitas?|bombon(es)?|mazapan|pulparindo|skwinkles|duvalin|kinder|hershey'?s?|carlos v|snickers|milky way|m&m|kit kat|bubulubu|pelon|lucas|trident|halls|tic tac|mentitas|rockaleta|vero|dulces?|malvaviscos?|chocoretas|kranky|bocadin|freskas|panditas|coronado|cajeta|ate|tamarindo|obleas|picafresa|mamut|crunch|ferrero|teens|barras? de coco|miguelito|pica ?fresa|sabrifrut|sabifrut|sweetarts|nerds|chupa chups|kisses|crazy dips|nutella|nuttela)\b/],
  ['Salchichonería y quesos', /\b(jamon|salchichas?|quesos?|chorizo|tocino|longaniza|pechuga de pavo|salami|pepperoni|mortadela|panela|manchego|oaxaca|cotija|chistorra|philadelphia|parmesano|pierna|chuleta)\b/],
  ['Lácteos y huevo', /\b(leche|yogur|yoghurt|yogurt|crema|mantequilla|margarina|huevo|danonino|activia|yakult|bebible|kefir|nido|nutrileche|media crema|condensada|evaporada|carnation|la lechera|lechera|clavel|jocoque|natilla)\b/],
  ['Enlatados y salsas', /\b(atun|sardinas?|chiles?|jalapenos?|chipotles?|frijoles|elotes?|chicharos|champinones|salsas?|catsup|ketchup|mayonesa|mostaza|pure de tomate|valentina|bufalo|herdez|del fuerte|mole|aderezo|vinagreta|aceitunas|almibar|leche de coco|pasta de tomate|bolognesa|hunts|bbq|verduras|ensalada de|pina (en )?(rebanad\w*|trozo)|coctel de frutas|duraznos|cerezas|rajas|jal (enteros|picados)|chi\/zana|chich\/zan|zanahorias|pimiento|chilorio|cochinita|alcachofas?|ostiones|mejillones|alcaparras?|pure (de )?tomate|prego|pesto|adobo|guajillo|pasilla|isadora|heinz|botanera)\b/],
  ['Pastas, arroz y granos', /\b(sopas?|pastas?|spaguetti|spaghetti|fideos?|codos?|coditos|monos?|munitos?|engrane|lentejas?|arroz|frijol|habas|garbanzos?|maruchan|ramen|harina|maseca|azucar|moderna|lasagne|lasana|fettuccine|fusilli|penne|copo|barilla|maiz pozolero|frijo)\b/],
  ['Aceites y condimentos', /\b(aceite|sal|consome|knorr|caldo|oregano|pimienta|comino|canela|clavo|laurel|vinagre|polvo para hornear|royal|maggi|salsa inglesa|sazonador|achiote|bicarbonato|levadura|vainilla|gelatina|flan|tajin|pam|ajo en (polvo|trozo)|ablandador|perejil|azafran|manteca|capullo|consmate|rikopollo)\b/],
  ['Bebidas', /\b(agua|refrescos?|coca|pepsi|sprite|fanta|manzanita|sidral|squirt|7 ?up|seven up|mirinda|jarritos|penafiel|boing|jumex|del valle|jugos?|nectar|gatorade|gatorlyte|powerade|electrolit|suerox|red bull|monster|volt|vive 100|amper|bonafont|epura|e pura|ciel|garrafon|te helado|lipton|arizona|frutsi|bida|pulpy|naranjada|limonada|kool aid|tang|zuko|clight|senorial|chaparrita|yoli|topo chico|mineral|tehuacan|be light|santa clara|squirt|mundet|delaware|lulu|bonafina|ades|flashlyte|electrolife|garci crespo|splash|vitaloe|amayu|ocean spray|mr blue|sangria)\b/],
  ['Varios', /\b(pilas?|duracell|energizer|cable|cargador|audifonos|chip|recarga|focos?|veladoras?|velas?|cerillos|encendedor|clipper|cinta|pegamento|resistol|kola loka|libreta|pluma|lapiz|globos?|vasos?|platos?|cucharas?|tenedor(es)?|popotes?|hielo|carbon|bolsa|charolas?|palillos|baraja|pirotecnia|termo|memoria|usb|fusible|plastiloka|bic|luz eterna|filtros? para cafetera|eveready|wd-?40|pinzas)\b/]
];

function titulo(s) {
  return s.toLowerCase().split(' ').map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

const UNIDADES = { ml: 'ml', l: 'L', lt: 'L', lts: 'L', g: 'g', gr: 'g', grs: 'g', gramos: 'g', kg: 'kg', k: 'kg', kilo: 'kg', pz: 'pz', pza: 'pz', pzas: 'pzas', piezas: 'pzas', oz: 'oz', cm: 'cm', mm: 'mm', m: 'm', mts: 'm' };
const PRESENTACION = /\s+((?:\d+\s?x\s?)?\d+(?:[.,]\d+)?)\s?(ml|lts?|l|grs?|gramos|g|kg|kilo|k|pzas?|piezas|pz|oz|cm|mm|mts|m)\.?$/i;

export function limpiarNombre(nombre) {
  let s = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[VFC] (?=\S)/, ''); // prefijos del punto de venta: Vinos, Farmacia, Cigarros
  if (s === s.toUpperCase() && /[A-ZÑ]{3}/.test(s)) s = titulo(s);
  s = s.replace(/\.+$/, '').trim();
  let presentacion = '';
  const m = s.match(PRESENTACION);
  if (m && m.index > 2) {
    presentacion = `${m[1].replace(',', '.').replace(/\s?x\s?/i, ' × ')} ${UNIDADES[m[2].toLowerCase()] || m[2]}`;
    s = s.slice(0, m.index).trim();
  }
  return { nombre: s, presentacion };
}

export function clasificar(nombre, departamento) {
  const dep = norm(departamento);
  const n = norm(nombre);
  const porDep = DEPARTAMENTOS[dep];
  let marca = (porDep && porDep[1]) || MARCAS[dep] || '';
  const primero = PRIMERO.find(([, re]) => re.test(n));
  let categoria = primero ? primero[0] : '';
  // Sangría Señorial es refresco; un "vino" del mismo proveedor va a licores.
  if (!categoria && porDep && !(dep === 'sangria' && /\bvino\b/.test(n))) categoria = porDep[0];
  // Medicamentos: el punto de venta les pone el prefijo "F ".
  if (!categoria && /^f /i.test(String(nombre).trim())) categoria = 'Farmacia';
  if (!categoria) {
    const regla = REGLAS.find(([, re]) => re.test(n));
    if (regla) categoria = regla[0];
  }
  if (!categoria && dep === 'farmacia') categoria = 'Farmacia';
  if (!categoria && /^v /i.test(String(nombre).trim())) categoria = 'Vinos y licores';
  if (!categoria && /^c /i.test(String(nombre).trim())) categoria = 'Cigarros';
  if (!categoria) categoria = 'Despensa';
  if (!marca && categoria === 'Cerveza') marca = '';
  const sinAlcohol = /\bsin alcohol\b|\b0\.0\b/.test(n);
  return {
    categoria,
    marca,
    es_alcohol: (categoria === 'Cerveza' || categoria === 'Vinos y licores') && !sinAlcohol
  };
}

const ALIAS = {
  codigo: ['codigo', 'clave', 'sku', 'codigo de barras', 'cod'],
  nombre: ['producto', 'descripcion', 'nombre', 'articulo'],
  precio: ['p. venta', 'precio venta', 'precio de venta', 'p venta', 'pventa', 'precio publico', 'precio'],
  departamento: ['departamento', 'depto', 'categoria', 'linea', 'familia'],
  existencia: ['existencia', 'existencias', 'stock', 'inventario'],
  tipo: ['tipo de venta', 'tipo', 'unidad', 'unidad de venta']
};

function buscarColumnas(fila) {
  const h = fila.map(norm);
  const col = {};
  Object.entries(ALIAS).forEach(([k, nombres]) => {
    for (const a of nombres) {
      const i = h.indexOf(a);
      if (i >= 0) { col[k] = i; break; }
    }
  });
  return col;
}

const dinero = (v) => {
  const s = String(v ?? '').replace(/[$\s]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// filas: arreglo de arreglos (primera fila con encabezados en las primeras 10).
export function mapearCatalogo(filas) {
  const ini = filas.slice(0, 10).findIndex((f) => {
    const c = buscarColumnas(f);
    return c.nombre !== undefined && c.precio !== undefined;
  });
  if (ini < 0) throw new Error('No encontramos las columnas “Producto” y “P. Venta” en el archivo. ¿Es la exportación del catálogo del punto de venta?');
  const col = buscarColumnas(filas[ini]);
  if (col.codigo === undefined) throw new Error('Falta la columna “Código”: la necesitamos para actualizar precios sin duplicar productos.');
  const productos = [];
  const errores = [];
  const vistos = new Set();
  filas.slice(ini + 1).forEach((f, i) => {
    const codigo = String(f[col.codigo] ?? '').trim();
    const original = String(f[col.nombre] ?? '').trim();
    if (!codigo && !original) return;
    if (!codigo || !original) { errores.push(`Fila ${ini + i + 2}: falta código o nombre`); return; }
    if (vistos.has(codigo)) { errores.push(`Fila ${ini + i + 2}: código ${codigo} repetido`); return; }
    vistos.add(codigo);
    const dep = col.departamento !== undefined ? String(f[col.departamento] ?? '') : '';
    const precio = dinero(f[col.precio]);
    const exTxt = col.existencia !== undefined ? String(f[col.existencia] ?? '').trim() : '';
    const existencia = exTxt === '' || exTxt === '-' ? null : dinero(exTxt);
    const granel = col.tipo !== undefined && /granel|kg|kilo/.test(norm(f[col.tipo]));
    const { nombre, presentacion } = limpiarNombre(original);
    const cls = clasificar(original, dep);
    const interno = INTERNOS_DEP.includes(norm(dep)) || INTERNOS.test(norm(nombre));
    productos.push({
      codigo,
      nombre,
      presentacion: granel ? '' : presentacion,
      categoria: cls.categoria,
      marca: cls.marca,
      precio: precio && precio > 0 ? precio : null,
      // Sin control de inventario ("-") se considera disponible.
      disponible: existencia === null ? true : existencia > 0,
      visible: !interno && cls.categoria !== 'Cigarros',
      es_alcohol: cls.es_alcohol,
      unidad: granel ? 'kg' : '',
      original,
      departamento: dep.trim(),
      interno
    });
  });
  const cuenta = (f) => productos.filter(f).length;
  const porCategoria = {};
  productos.forEach((p) => { porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1; });
  return {
    productos,
    errores,
    resumen: {
      total: productos.length,
      visibles: cuenta((p) => p.visible),
      ocultos: cuenta((p) => !p.visible),
      internos: cuenta((p) => p.interno),
      cigarros: cuenta((p) => p.categoria === 'Cigarros'),
      agotados: cuenta((p) => p.visible && !p.disponible),
      granel: cuenta((p) => p.unidad === 'kg'),
      alcohol: cuenta((p) => p.es_alcohol),
      sinPrecio: cuenta((p) => p.precio === null),
      porCategoria
    }
  };
}
