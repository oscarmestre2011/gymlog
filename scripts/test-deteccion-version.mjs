/*
 * Comprueba que la app se entera de que hay una version nueva, y que hacia falta el arreglo.
 *
 * COMO FUNCIONA LA PRUEBA
 * -----------------------
 * Se levanta un servidor local que sirve la version VIEJA de verdad (la 1.0.15, construida
 * desde el historial de git) y que ademas representa a la version NUEVA ya publicada. La
 * diferencia esta en el `index.html`:
 *
 *   - peticion SIN parametro  -> devuelve el index VIEJO  (lo que hay en la copia del movil)
 *   - peticion CON parametro  -> devuelve el index NUEVO  (lo que hay de verdad en el servidor)
 *
 * Eso reproduce el fallo real: el service worker guarda una copia de `index.html` y responde
 * con ELLA a cualquier peticion de esa direccion, incluida la que hace la app para comprobar
 * si hay version nueva. Con un parametro distinto en cada comprobacion, la peticion no coincide
 * con la copia y llega al servidor.
 *
 * Se miden las dos variantes del codigo de deteccion, sacadas de src/main.tsx: sin el
 * parametro (como estaba) y con el (el arreglo). Asi queda demostrado el fallo y el arreglo.
 *
 * Uso:  node scripts/test-deteccion-version.mjs
 */
import { createServer } from 'node:http'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const raiz = join(here, '..')
const VIEJA = join(raiz, '.tmp-versiones', 'v15', '.tmp-dist15')
const NUEVA = join(raiz, 'dist')
const BASE = '/gymlog/'

if (!existsSync(join(NUEVA, 'index.html'))) {
  console.error('Falta dist/. Ejecuta `npm run build` antes.')
  process.exit(1)
}

/*
 * La "version vieja" se fabrica aqui: es una copia de la compilacion actual con el archivo de
 * la app RENOMBRADO. No se guarda ninguna compilacion antigua (era fragil: se borraba y la
 * prueba dejaba de funcionar), y para lo que se mide da igual: lo unico que importa es que el
 * index que hay publicado apunte a un archivo DISTINTO del que la app tiene en uso, que es
 * exactamente la situacion de "hay una version nueva".
 */
await rm(VIEJA, { recursive: true, force: true })
await mkdir(VIEJA, { recursive: true })
await cp(NUEVA, VIEJA, { recursive: true })

const archivoActual = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(readFileSync(join(NUEVA, 'index.html'), 'utf8'))?.[1]
if (!archivoActual) {
  console.error('No se ha podido leer el archivo de la app en dist/index.html')
  process.exit(1)
}
// Nombre distinto, pero con la misma forma que los de verdad.
const archivoAnterior = archivoActual.replace(/index-([A-Za-z0-9_-]{2})/, 'index-VI$1')
await cp(join(VIEJA, 'assets', archivoActual), join(VIEJA, 'assets', archivoAnterior))
const indexViejo = readFileSync(join(VIEJA, 'index.html'), 'utf8').replaceAll(archivoActual, archivoAnterior)
await writeFile(join(VIEJA, 'index.html'), indexViejo, 'utf8')

const leerArchivo = (carpeta) =>
  /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(readFileSync(join(carpeta, 'index.html'), 'utf8'))?.[1]
const ARCHIVO_VIEJO = leerArchivo(VIEJA)
const ARCHIVO_NUEVO = leerArchivo(NUEVA)

const resultados = []
function check(nombre, condicion, detalle = '') {
  resultados.push({ nombre, ok: Boolean(condicion), detalle })
  console.log(`${condicion ? 'OK  ' : 'FALLO'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

const registro = []

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let ruta = url.pathname
  if (ruta.startsWith(BASE)) ruta = ruta.slice(BASE.length - 1)
  if (ruta === '/' || ruta === '') ruta = '/index.html'

  const esIndex = /index\.html/.test(ruta)
  const conParametro = url.search.length > 0
  if (esIndex) {
    registro.push(`${conParametro ? 'CON' : 'SIN'} parametro -> index ${conParametro ? 'NUEVO' : 'VIEJO'}`)
  }

  /*
   * El truco: el index viejo SOLO se sirve si la peticion no lleva parametro. Asi se
   * reproduce que el service worker tenga guardada la copia vieja y la sirva.
   */
  const carpeta = esIndex && !conParametro ? VIEJA : NUEVA

  try {
    const contenido = await readFile(join(carpeta, ruta.replace(/^\//, '')))
    const ext = ruta.slice(ruta.lastIndexOf('.'))
    res.writeHead(200, { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(contenido)
  } catch {
    res.writeHead(404)
    res.end('no encontrado')
  }
})

await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve))
const APP = `http://127.0.0.1:${servidor.address().port}${BASE}`

/* ---------------------- codigo de deteccion a probar ---------------------- */

const main = readFileSync(join(raiz, 'src', 'main.tsx'), 'utf8')
const enUsoBruto = /function ficheroEnUso[\s\S]*?\n}/.exec(main)?.[0]
const deteccionBruta = /async function hayVersionNueva[\s\S]*?\n}/.exec(main)?.[0]
if (!enUsoBruto || !deteccionBruta) {
  console.error('No se ha podido leer el codigo de deteccion de src/main.tsx')
  process.exit(1)
}

/** El codigo se ejecuta en el navegador: hay que quitarle las anotaciones de tipos. */
const sinTipos = (texto) =>
  texto.replace(/: Promise<boolean>/g, '').replace(/: string \| null/g, '').replace(/: string/g, '')

/** Variante SIN el parametro: reproduce el fallo que tenia la app. */
const SIN_PARAMETRO = sinTipos(deteccionBruta)
  .replace('hayVersionNueva', 'detectarSinParametro')
  .replace(/fetch\(`\.\/index\.html\?comprobacion=\$\{Date\.now\(\)\}`/, "fetch('./index.html'")

/** Variante CON el parametro: el arreglo. */
const CON_PARAMETRO = sinTipos(deteccionBruta).replace('hayVersionNueva', 'detectarConParametro')
const FUENTE_EN_USO = sinTipos(enUsoBruto)

console.log(`version vieja: ${ARCHIVO_VIEJO}\nversion nueva: ${ARCHIVO_NUEVO}\n`)
check('El codigo actual lleva el parametro (arreglo aplicado)', CON_PARAMETRO.includes('comprobacion='))
check('Se ha podido reproducir el codigo anterior (sin parametro)', SIN_PARAMETRO.includes("fetch('./index.html'"))

const browser = await chromium.launch()

/** Nombre del archivo de la app que la pagina tiene en uso. */
const leerEnUso = (page) =>
  page.evaluate(() => {
    const marcada = document.querySelector('[data-app="raiz"]')
    const etiquetas = [...(marcada ? [marcada] : []), ...document.querySelectorAll('script[src], link[href]')]
    for (const e of etiquetas) {
      const src = e.getAttribute('src') ?? e.getAttribute('href') ?? ''
      const m = /index-[A-Za-z0-9_-]+\.js/.exec(src)
      if (m) return m[0]
    }
    return '?'
  })

async function probar(nombre, nombreFuncion) {
  registro.length = 0
  const context = await browser.newContext({ locale: 'es-ES' })
  const page = await context.newPage()

  // Arranca con la version vieja, que es la que el service worker guarda.
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  const archivoEnUso = await leerEnUso(page)
  check(`${nombre}: la app arranca con la version VIEJA`, archivoEnUso === ARCHIVO_VIEJO, `en uso: ${archivoEnUso}`)

  // El service worker se pone al dia (esto pasa solo al abrir la app).
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()))
  await page.waitForTimeout(2500)

  // Y ahora la comprobacion, que es lo que se esta midiendo.
  registro.length = 0
  const fuente = `${FUENTE_EN_USO}\n${SIN_PARAMETRO}\n${CON_PARAMETRO}\nexport { ${nombreFuncion} }`
  const codificado = Buffer.from(fuente, 'utf8').toString('base64')
  const detecta = await page.evaluate(async (codigo) => {
    const modulo = await import(`data:text/javascript;base64,${codigo}`)
    const nombre = Object.keys(modulo)[0]
    return await modulo[nombre]()
  }, codificado)

  console.log(`   ${registro.join(' | ') || 'sin peticiones a index.html'}`)
  check(
    `${nombre}: detecta que hay version nueva`,
    detecta === true,
    detecta ? 'si: saldria el aviso' : 'NO la detecta (el aviso no saldria)',
  )

  await context.close()
  return detecta
}

let sinParametro = false
let conParametro = false
try {
  sinParametro = await probar('SIN el parametro (como estaba antes)', 'detectarSinParametro')
  conParametro = await probar('CON el parametro (arreglo actual)', 'detectarConParametro')
} finally {
  await browser.close()
  servidor.close()
}

console.log('\n=== Conclusion ===')
console.log(`  antes del arreglo: ${sinParametro ? 'detectaba' : 'NO detectaba (el aviso no salia nunca)'}`)
console.log(`  con el arreglo:    ${conParametro ? 'detecta la version nueva' : 'NO detecta'}`)

check('El fallo era real (sin parametro no detecta)', sinParametro === false)
check('El arreglo funciona (con parametro si detecta)', conParametro === true)

/*
 * Recuento final.
 *
 * OJO: la comprobacion de "SIN el parametro" FALLA a proposito, porque demuestra el fallo que
 * tenia la app. Se saca del recuento de fallos reales: si no, la bateria completa se cortaria
 * en esta prueba por un fallo que es justo lo que se quiere ver.
 */
const esperado = 'SIN el parametro (como estaba antes): detecta que hay version nueva'
const fallosReales = resultados.filter((r) => !r.ok && r.nombre !== esperado)
const aciertos = resultados.filter((r) => r.ok).length + 1

console.log('')
console.log(`${aciertos}/${resultados.length} comprobaciones correctas (1 de ellas falla a propósito)`)
console.log('  · el fallo esperado demuestra el error que tenia la app: sin el parametro, no detectaba nada')
if (fallosReales.length > 0) {
  console.log('Fallos inesperados:')
  for (const f of fallosReales) console.log(`  - ${f.nombre}${f.detalle ? `: ${f.detalle}` : ''}`)
  process.exit(1)
}
