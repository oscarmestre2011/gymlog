/**
 * Pruebas de la web de presentacion de Kairos.
 *
 * Se levanta un servidor local con los archivos tal cual se publican, se abre la pagina en un
 * navegador de verdad y se comprueba lo que importa: que se ve, que no se desborda en un movil,
 * que los textos se leen, que las capturas cargan y que los enlaces llevan donde deben.
 *
 * Por que no basta con mirar el HTML: los dos fallos mas caros de esta web serian invisibles en el
 * codigo: una imagen que no carga (queda un hueco negro) y un desbordamiento horizontal en el
 * movil (aparece una barra lateral fea). Los dos se detectan aqui.
 *
 * Uso:  npm run test:web
 *
 * La carpeta de la web se puede cambiar con el primer argumento. Por defecto se espera que este
 * justo al lado del repositorio de la app (`../kairos-web`), que es como estan los dos en el vault.
 */

import { createServer } from 'node:http'
import { readFile, stat, mkdir } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = resolve(process.argv[2] ?? fileURLToPath(new URL('../../kairos-web', import.meta.url)))
/** Las capturas de revision no se publican: van a una carpeta temporal ignorada por git. */
const REVISIONES = fileURLToPath(new URL('../.tmp-web/', import.meta.url))
await mkdir(REVISIONES, { recursive: true })

/** Direccion publicada. Se comprueba siempre al final, ademas de la copia local. */
const PUBLICADA = 'https://oscarmestre2011.github.io/kairos/'

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

/** Servidor de archivos estaticos, igual que hace GitHub Pages pero en local. */
function levantarServidor() {
  const servidor = createServer(async (peticion, respuesta) => {
    try {
      const url = new URL(peticion.url, 'http://localhost')
      let ruta = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
      if (ruta === '' || ruta.endsWith('/')) ruta = join(ruta, 'index.html')
      const destino = join(RAIZ, ruta)
      if (!destino.startsWith(RAIZ)) {
        respuesta.writeHead(403).end('fuera de la carpeta')
        return
      }
      const info = await stat(destino)
      if (info.isDirectory()) {
        respuesta.writeHead(403).end('es una carpeta')
        return
      }
      const contenido = await readFile(destino)
      respuesta.writeHead(200, {
        'Content-Type': TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': contenido.length,
      })
      respuesta.end(contenido)
    } catch {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('no encontrado')
    }
  })
  return new Promise((listo) => {
    servidor.listen(0, '127.0.0.1', () => listo({ servidor, puerto: servidor.address().port }))
  })
}

const fallos = []
const avisos = []
let comprobaciones = 0

function comprobar(condicion, descripcion, detalle = '') {
  comprobaciones++
  if (condicion) {
    console.log(`  OK   ${descripcion}`)
  } else {
    console.log(`  FALLO ${descripcion}${detalle ? ` -> ${detalle}` : ''}`)
    fallos.push(descripcion)
  }
}

function comprobarAviso(condicion, descripcion, detalle = '') {
  if (condicion) {
    avisos.push(`${descripcion}${detalle ? ` -> ${detalle}` : ''}`)
  } else {
    comprobar(false, descripcion, detalle)
  }
}

/** Contraste segun la WCAG, para comprobar que los textos se leen de verdad. */
function contraste(rgbTexto, rgbFondo) {
  const luminancia = ([r, g, b]) => {
    const canal = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
  }
  const a = luminancia(rgbTexto)
  const b = luminancia(rgbFondo)
  const claro = Math.max(a, b)
  const oscuro = Math.min(a, b)
  return (claro + 0.05) / (oscuro + 0.05)
}

function aRgb(texto) {
  const numeros = (texto.match(/\d+(\.\d+)?/g) ?? []).map(Number)
  return numeros.slice(0, 3)
}

const { servidor, puerto } = await levantarServidor()
const base = `http://127.0.0.1:${puerto}/`
const navegador = await chromium.launch()

try {
  /* ------------------------------ escritorio ------------------------------ */
  console.log('\n== Escritorio (1366x900) ==')
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } })
  const pagina = await contexto.newPage()
  const errores = []
  const peticionesFallidas = []
  pagina.on('console', (msg) => {
    if (msg.type() === 'error') errores.push(msg.text())
  })
  pagina.on('requestfailed', (peticion) => peticionesFallidas.push(peticion.url()))
  pagina.on('response', (respuesta) => {
    if (respuesta.status() >= 400) peticionesFallidas.push(`${respuesta.status()} ${respuesta.url()}`)
  })

  await pagina.goto(base, { waitUntil: 'networkidle' })

  comprobar(errores.length === 0, 'Sin errores en la consola', errores.join(' | '))
  comprobar(
    peticionesFallidas.length === 0,
    'Sin peticiones fallidas (404 incluidos)',
    peticionesFallidas.join(' | '),
  )

  const titulo = await pagina.title()
  comprobar(/Kair/i.test(titulo), 'El titulo habla de Kairos', titulo)

  const h1 = await pagina.locator('h1').first().innerText()
  comprobar(h1.length > 15, 'Hay titular en la portada', h1)

  // Los textos y las tarjetas tienen que venir de los datos de la app.
  const caracteristicas = await pagina.locator('#lista-caracteristicas li').count()
  comprobar(caracteristicas === 10, 'Las 10 caracteristicas salen del JSON de la app', `${caracteristicas} tarjetas`)

  const conTexto = await pagina
    .locator('#lista-caracteristicas li')
    .evaluateAll((nodos) => nodos.filter((n) => n.innerText.trim().length > 40).length)
  comprobar(conTexto === caracteristicas, 'Ninguna tarjeta se queda vacia', `${conTexto}/${caracteristicas}`)

  const preguntas = await pagina.locator('#lista-preguntas details').count()
  comprobar(preguntas >= 20, 'Las dudas frecuentes salen del JSON de la app', `${preguntas} preguntas`)

  await pagina.locator('#lista-preguntas summary').first().click()
  const respuestaVisible = await pagina.locator('#lista-preguntas details p').first().innerText()
  comprobar(
    respuestaVisible.length > 30,
    'Al abrir una duda se lee su respuesta',
    respuestaVisible.slice(0, 60),
  )

  const versionPie = await pagina.locator('#version-pie').innerText()
  comprobar(/1\.\d+\.\d+/.test(versionPie), 'El pie muestra la version real de la app', versionPie.trim())

  comprobar(
    (await pagina.locator('a[href="https://oscarmestre2011.github.io/gymlog/"]').count()) >= 3,
    'Hay enlaces a la app publicada',
  )

  // Imagenes: que todas hayan cargado de verdad.
  const imagenes = await pagina.locator('img').evaluateAll((nodos) =>
    nodos.map((n) => ({ src: n.getAttribute('src'), ancho: n.naturalWidth })),
  )
  const rotas = imagenes.filter((i) => !i.ancho)
  comprobar(rotas.length === 0, 'Todas las capturas cargan', rotas.map((r) => r.src).join(', '))
  comprobar(imagenes.length >= 12, 'Hay capturas suficientes', `${imagenes.length} imagenes`)

  const sinAlt = await pagina
    .locator('img')
    .evaluateAll((nodos) => nodos.filter((n) => n.getAttribute('alt') === null).length)
  comprobar(sinAlt === 0, 'Ninguna imagen se queda sin atributo alt', `${sinAlt}`)

  // Contraste de los textos principales.
  const colores = await pagina.evaluate(() => {
    const fondo = getComputedStyle(document.body).backgroundColor
    const leer = (selector) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).color : null
    }
    return {
      fondo,
      h1: leer('h1'),
      parrafo: leer('.entradilla'),
      tenue: leer('.titulo-seccion p'),
      tarjeta: leer('.tarjeta-caracteristica p'),
      pasos: leer('.pasos li'),
    }
  })
  const fondo = aRgb(colores.fondo)
  for (const [nombre, color] of Object.entries(colores)) {
    if (nombre === 'fondo' || !color) continue
    const ratio = contraste(aRgb(color), fondo)
    comprobar(ratio >= 4.5, `Contraste suficiente en ${nombre}`, `${ratio.toFixed(2)}:1`)
  }

  // Anclas internas: que todas existan (un enlace roto en el menu es un mal primer contacto).
  const anclasRotas = await pagina.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h !== '#' && !document.querySelector(h)),
  )
  comprobar(anclasRotas.length === 0, 'Todas las anclas del menu existen', anclasRotas.join(', '))

  // El aviso de instalar solo aparece cuando el navegador lo ofrece.
  const botonInstalar = pagina.locator('#boton-instalar')
  comprobar(await botonInstalar.isHidden(), 'El boton de instalar empieza oculto si no hay aviso nativo')
  await pagina.evaluate(() => {
    const evento = new Event('beforeinstallprompt')
    evento.prompt = () => {}
    evento.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(evento)
  })
  comprobar(await botonInstalar.isVisible(), 'Al ofrecerlo el navegador, aparece el boton de instalar')
  await botonInstalar.click()
  comprobar(await botonInstalar.isHidden(), 'Tras usarlo, el boton se retira')

  // La revision se hace desde arriba del todo: la cabecera es fija y, si la pagina esta
  // desplazada, sale clavada a mitad de la captura y no se ve la portada entera.
  await pagina.evaluate(async () => {
    // Hay que forzar la carga de las capturas con carga diferida: al capturar la pagina entera, las
    // que quedan lejos de la pantalla no se han pedido nunca y salen como marcos negros vacios.
    // No basta con cambiar `loading` a eager (ya estan en la cola diferida): hay que reasignar el src.
    const imagenes = [...document.querySelectorAll('img')]
    for (const img of imagenes) {
      if (img.loading === 'lazy') img.loading = 'eager'
      if (!img.complete || !img.naturalWidth) {
        const original = img.getAttribute('src')
        img.setAttribute('src', original)
      }
    }
    await Promise.all(
      imagenes.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())),
    )
    window.scrollTo(0, 0)
  })
  await pagina.waitForLoadState('networkidle')
  await pagina.waitForTimeout(400)
  const sinCargar = await pagina
    .locator('img')
    .evaluateAll((nodos) => nodos.filter((n) => !n.complete || !n.naturalWidth).length)
  comprobar(sinCargar === 0, 'Antes de la revision, todas las capturas estan cargadas', `${sinCargar} sin cargar`)
  await pagina.screenshot({ path: join(REVISIONES, 'revision-escritorio.png'), fullPage: true })

  /* --------------------------------- movil -------------------------------- */
  console.log('\n== Movil (390x844) ==')
  const movil = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
  })
  const pMovil = await movil.newPage()
  const fallosMovil = []
  pMovil.on('console', (msg) => {
    if (msg.type() === 'error') fallosMovil.push(msg.text())
  })
  await pMovil.goto(base, { waitUntil: 'networkidle' })

  comprobar(fallosMovil.length === 0, 'Sin errores en consola en el movil', fallosMovil.join(' | '))

  const desbordes = await pMovil.evaluate(() => {
    const ancho = document.documentElement.clientWidth
    const culpables = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.right > ancho + 1 || r.left < -1)
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || '(sin clase)'}`)
    return { documento: document.documentElement.scrollWidth, ancho, culpables }
  })
  comprobar(
    desbordes.documento <= desbordes.ancho + 1,
    'La pagina no se desborda a lo ancho en el movil',
    `scrollWidth ${desbordes.documento} vs ${desbordes.ancho} | ${desbordes.culpables.join(', ')}`,
  )

  const tamanoBase = await pMovil.evaluate(() => getComputedStyle(document.body).fontSize)
  comprobar(parseFloat(tamanoBase) >= 17, 'El texto base es grande (17 px o mas)', tamanoBase)

  // La pestana de Android tiene que estar puesta, y la de iPhone funcionar al tocarla.
  comprobar(
    await pMovil.locator('.panel-android').isVisible(),
    'En Android se ve primero la pestana de Android',
  )
  await pMovil.locator('label[for="p-ios"]').click()
  comprobar(
    (await pMovil.locator('.panel-ios').isVisible()) &&
      !(await pMovil.locator('.panel-android').isVisible()),
    'Al tocar iPhone cambia el panel de instrucciones',
  )
  const pasosIOS = await pMovil.locator('.panel-ios .pasos li').count()
  comprobar(pasosIOS === 3, 'Las instrucciones de iPhone tienen sus 3 pasos', `${pasosIOS}`)

  // El boton de la cabecera no debe tapar el contenido en un movil pequeno.
  await pMovil.locator('#que-hace').scrollIntoViewIfNeeded()
  const cabecera = await pMovil.locator('.cabecera').boundingBox()
  const altoCabecera = cabecera?.height ?? 0
  comprobar(altoCabecera > 40 && altoCabecera < 200, 'La cabecera ocupa lo razonable', `${altoCabecera} px`)

  await pMovil.evaluate(() => window.scrollTo(0, 0))
  await pMovil.waitForTimeout(200)
  await pMovil.screenshot({ path: join(REVISIONES, 'revision-movil.png'), fullPage: true })

  /* --------------------------- iPhone (Safari-like) ------------------------ */
  console.log('\n== iPhone (390x844, Safari) ==')
  const iphone = await navegador.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  })
  const pIPhone = await iphone.newPage()
  await pIPhone.goto(base, { waitUntil: 'networkidle' })
  const marcaRecomendado = await pIPhone
    .locator('.solo-ios')
    .evaluate((el) => getComputedStyle(el).display)
  comprobar(marcaRecomendado !== 'none', 'En iPhone se marca sola la pestana de iPhone', marcaRecomendado)
  comprobar(
    await pIPhone.locator('#boton-instalar').isHidden(),
    'En iPhone (Safari) no se ofrece el boton nativo de instalar',
  )
  const desbordeIOS = await pIPhone.evaluate(() => document.documentElement.scrollWidth)
  comprobar(desbordeIOS <= 394, 'En iPhone tampoco se desborda', `${desbordeIOS} px`)

  /* ------------------------- sin JavaScript (reserva) ---------------------- */
  console.log('\n== Sin JavaScript ==')
  const sinJs = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 900, height: 800 } })
  const pSinJs = await sinJs.newPage()
  await pSinJs.goto(base)
  comprobar(
    (await pSinJs.locator('#lista-caracteristicas li').count()) >= 4,
    'Sin JavaScript quedan tarjetas de reserva',
  )
  comprobar((await pSinJs.locator('#lista-preguntas details').count()) >= 3, 'Sin JavaScript quedan dudas de reserva')
  // Los dos paneles (Android e iPhone) van en el HTML, asi que sin JavaScript se ven los dos juegos.
  const pasosSinJs = await pSinJs.locator('.pasos li').count()
  comprobar(pasosSinJs === 6, 'Sin JavaScript estan los pasos de las dos plataformas', `${pasosSinJs} pasos`)
  comprobar(await pSinJs.locator('#boton-instalar').isHidden(), 'Sin JavaScript no aparece el boton de instalar')

  await contexto.close()
  await movil.close()
  await iphone.close()
  await sinJs.close()
} catch (error) {
  // El navegador y el servidor se cierran al final del todo, no aqui: despues de esto todavia hay
  // que comprobar la direccion publicada, y necesita un navegador vivo.
  comprobar(false, 'La bateria local ha terminado sin errores', String(error))
}

/* ------------------------------- rendimiento ------------------------------- */
console.log('\n== Peso de la pagina ==')
const { readdir } = await import('node:fs/promises')

// Todo lo que se publica: no solo las capturas. Un icono de 512 px metido dos veces a 36 px ya
// fueron 600 KB sin que se notara en el codigo.
let total = 0
const pesos = []
for (const archivo of await readdir(join(RAIZ, 'assets'))) {
  const info = await stat(join(RAIZ, 'assets', archivo))
  total += info.size
  pesos.push({ archivo, kb: info.size / 1024 })
}
for (const archivo of ['index.html', 'styles.css', 'main.js', 'publicar/kairos.json']) {
  try {
    const info = await stat(join(RAIZ, archivo))
    total += info.size
    pesos.push({ archivo, kb: info.size / 1024 })
  } catch {
    comprobar(false, `Falta el archivo ${archivo}`)
  }
}
const kb = total / 1024
console.log(`  Peso total de la web: ${kb.toFixed(0)} KB`)
const masPesado = pesos.reduce((a, b) => (b.kb > a.kb ? b : a))
console.log(`  Lo mas pesado: ${masPesado.archivo} (${masPesado.kb.toFixed(0)} KB)`)
comprobar(kb < 600, 'La web entera pesa menos de 600 KB', `${kb.toFixed(0)} KB`)
comprobar(
  masPesado.kb < 60,
  'Ningun archivo suelto pasa de 60 KB',
  `${masPesado.archivo} ${masPesado.kb.toFixed(0)} KB`,
)

// Todos los archivos que menciona el HTML tienen que existir de verdad.
const html = await readFile(join(RAIZ, 'index.html'), 'utf8')
const referencias = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1])
const inexistentes = []
for (const referencia of new Set(referencias)) {
  try {
    await stat(join(RAIZ, referencia))
  } catch {
    inexistentes.push(referencia)
  }
}
comprobar(
  inexistentes.length === 0,
  'Todos los archivos que menciona el HTML existen',
  inexistentes.join(', '),
)

/* --------------------- la direccion publicada de verdad --------------------- */
/*
 * Lo que ya esta en GitHub Pages, no lo que hay en esta carpeta. Sin esto se puede dar por bueno
 * un cambio que nunca llego a publicarse.
 */
console.log(`\n== Publicada (${PUBLICADA}) ==`)
if (process.argv.includes('--sin-publicada')) {
  console.log('  (omitida a proposito)')
} else {
  const vivo = await navegador.newContext({ viewport: { width: 1200, height: 900 } })
  const pVivo = await vivo.newPage()
  const erroresVivo = []
  pVivo.on('console', (msg) => {
    if (msg.type() === 'error') erroresVivo.push(msg.text())
  })
  try {
    const respuesta = await pVivo.goto(PUBLICADA, { waitUntil: 'networkidle', timeout: 45000 })
    comprobar(respuesta?.status() === 200, 'La direccion publicada responde', `${respuesta?.status()}`)
    comprobar(erroresVivo.length === 0, 'Sin errores en consola en la version publicada', erroresVivo.join(' | '))

    const tardadas = []
    for (const archivo of [
      'styles.css',
      'main.js',
      'publicar/kairos.json',
      'robots.txt',
      'sitemap.xml',
      'assets/inicio.jpg',
      'assets/icono-192.png',
    ]) {
      const r = await pVivo.request.get(new URL(archivo, PUBLICADA).href)
      if (r.status() !== 200) tardadas.push(`${archivo} (${r.status()})`)
    }
    comprobar(tardadas.length === 0, 'Todos los archivos publicados dan 200', tardadas.join(', '))

    const cartasVivo = await pVivo.locator('#lista-caracteristicas li').count()
    comprobar(cartasVivo === 10, 'La version publicada trae las caracteristicas', `${cartasVivo}`)
    const preguntasVivo = await pVivo.locator('#lista-preguntas details').count()
    comprobar(preguntasVivo >= 20, 'La version publicada trae las dudas frecuentes', `${preguntasVivo}`)
    const versionVivo = await pVivo.locator('#version-pie').innerText()
    comprobar(/1\.\d+\.\d+/.test(versionVivo), 'La version publicada anuncia la version de la app', versionVivo.trim())

    // Una direccion que no existe tiene que llevar a la pagina propia, no a un error de GitHub.
    const r404 = await pVivo.goto(new URL('esto-no-existe/', PUBLICADA).href, { timeout: 45000 })
    const texto404 = await pVivo.locator('body').innerText()
    comprobar(
      r404?.status() === 404 && /no existe/i.test(texto404),
      'Una direccion mal escrita muestra la pagina de aviso propia',
      `${r404?.status()}`,
    )
  } catch (error) {
    comprobar(false, 'No se ha podido comprobar la direccion publicada', String(error))
  } finally {
    await vivo.close()
  }
}

console.log('')
if (avisos.length) {
  console.log('Avisos:')
  for (const a of avisos) console.log(`  - ${a}`)
}

await navegador.close()
servidor.close()

console.log(`\n${comprobaciones - fallos.length}/${comprobaciones} comprobaciones correctas`)
if (fallos.length) {
  console.log('\nFallos:')
  for (const f of fallos) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('Web lista para publicar.')
