/*
 * Comprueba si la app DETECTA que hay una version nueva publicada.
 *
 * Monta el caso real: un servicio local que primero sirve la version VIEJA (la 1.0.15 de
 * verdad, construida desde el historial de git) y despues la NUEVA (dist). Se abre la app
 * con la vieja, se cambia el servidor a la nueva y se mira si la app avisa.
 *
 * Se prueba el codigo de deteccion REAL, sacado de src/main.tsx: primero tal y como esta, y
 * despues con la correccion propuesta. Asi queda demostrado cual falla y cual no.
 *
 * Uso:  node scripts/test-deteccion-version.mjs
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const raiz = join(here, '..')
const VIEJA = join(raiz, '.tmp-versiones', 'v15', '.tmp-dist15')
const NUEVA = join(raiz, 'dist')
const BASE = '/gymlog/'

/** Nombre del archivo de cada version: es su huella. */
const ARCHIVO_VIEJO = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(
  readFileSync(join(VIEJA, 'index.html'), 'utf8'),
)?.[1]
const ARCHIVO_NUEVO = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(
  readFileSync(join(NUEVA, 'index.html'), 'utf8'),
)?.[1]
console.log(`version vieja: ${ARCHIVO_VIEJO}\nversion nueva: ${ARCHIVO_NUEVO}\n`)

if (!existsSync(join(VIEJA, 'index.html'))) {
  console.error('Falta la version vieja: construye .tmp-versiones/v15/.tmp-dist15 antes.')
  process.exit(1)
}

const resultados = []
function check(nombre, condicion, detalle = '') {
  resultados.push({ nombre, ok: Boolean(condicion), detalle })
  console.log(`${condicion ? 'OK  ' : 'FALLO'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

/* --------------------------- servidor de pruebas --------------------------- */

let sirviendo = 'vieja'
const peticiones = []

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let ruta = url.pathname
  if (ruta.startsWith(BASE)) ruta = ruta.slice(BASE.length - 1)
  if (ruta === '/' || ruta === '') ruta = '/index.html'

  peticiones.push(`${sirviendo === 'vieja' ? 'VIEJA' : 'NUEVA'} ${ruta}${url.search}`)

  const carpeta = sirviendo === 'vieja' ? VIEJA : NUEVA
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
const puerto = servidor.address().port
const APP = `http://127.0.0.1:${puerto}${BASE}`

/* ------------- codigo de deteccion: el actual y el corregido -------------- */

const main = readFileSync(join(raiz, 'src', 'main.tsx'), 'utf8')
const enUso = /function ficheroEnUso[\s\S]*?\n}/.exec(main)?.[0]
const actualBruto = /async function hayVersionNueva[\s\S]*?\n}/.exec(main)?.[0]
/** El codigo se ejecuta en el navegador: hay que quitar las anotaciones de tipos. */
const sinTipos = (texto) =>
  texto
    .replace(/: Promise<boolean>/g, '')
    .replace(/: string \| null/g, '')
    .replace(/: string/g, '')
    .replace(/\(([a-zA-Z]+)\?\)/g, '($1)')
const actual = actualBruto ? sinTipos(actualBruto) : null
if (!enUso || !actual) {
  console.error('No se ha podido leer el codigo de deteccion de src/main.tsx')
  process.exit(1)
}

const corregido = actual
  .replace('hayVersionNueva', 'hayVersionNuevaCorregida')
  .replace("fetch('./index.html', { cache: 'no-store' })", "fetch(`./index.html?comprobacion=${Date.now()}`, { cache: 'no-store' })")
if (!corregido.includes('comprobacion=')) {
  console.error('No se ha podido aplicar la correccion')
  process.exit(1)
}

const browser = await chromium.launch()

/**
 * Abre la app con la version vieja, cambia el servidor a la nueva y comprueba si el codigo
 * de deteccion indicado se da cuenta.
 */
async function probar(nombre, codigo) {
  console.log(`\n--- ${nombre} ---`)
  sirviendo = 'vieja'
  const context = await browser.newContext({ locale: 'es-ES' })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))

  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)

  /*
   * La version de la app no se ve en la pantalla de inicio (esta en Ajustes), asi que se
   * identifica por el ARCHIVO EN USO: cada compilacion lleva un nombre distinto. Es la misma
   * huella que usa la app para saber si hay version nueva.
   */
  const arranque = await page.evaluate(() => {
    const src = [...document.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src') ?? '')
      .find((s) => /index-[A-Za-z0-9_-]+\.js/.test(s))
    return {
      archivo: /index-[A-Za-z0-9_-]+\.js/.exec(src ?? '')?.[0] ?? '?',
      controlado: Boolean(navigator.serviceWorker.controller),
      caches: null,
    }
  })
  const esVieja = arranque.archivo === ARCHIVO_VIEJO
  check(`${nombre}: arranca con la version VIEJA`, esVieja, `archivo en uso: ${arranque.archivo} (viejo: ${ARCHIVO_VIEJO})`)
  check(`${nombre}: el service worker controla la pagina`, arranque.controlado)

  // Se publica la version nueva.
  sirviendo = 'nueva'
  peticiones.length = 0

  // Se ejecuta el codigo de deteccion tal cual, dentro de la pagina.
  const detecta = await page.evaluate(async (fuente) => {
    const modulo = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(fuente)))}`)
    const nombreFuncion = Object.keys(modulo)[0]
    return modulo[nombreFuncion]()
  }, `${sinTipos(enUso)}\n${codigo}\nexport { ${/function (\w+)/.exec(codigo)[1]} }`)

  console.log(`   peticiones durante la comprobacion: ${peticiones.filter((p) => /index\.html/.test(p)).join(', ') || 'ninguna a index.html'}`)
  check(
    `${nombre}: la app se da cuenta de que hay version nueva`,
    detecta === true,
    detecta ? 'si, saldria el aviso' : 'NO: el aviso no saldra nunca',
  )
  if (errores.length) console.log(`   errores: ${errores.join(' | ')}`)

  await context.close()
  return detecta
}

let conActual = false
let conCorregido = false
try {
  conActual = await probar('Deteccion ACTUAL (cache: no-store)', actual)
  conCorregido = await probar('Deteccion CORREGIDA (parametro unico)', corregido)
} finally {
  await browser.close()
  servidor.close()
}

console.log('\n=== Conclusion ===')
console.log(`  con el codigo actual:    ${conActual ? 'detecta la version nueva' : 'NO la detecta'}`)
console.log(`  con la correccion:       ${conCorregido ? 'detecta la version nueva' : 'NO la detecta'}`)

const fallos = resultados.filter((r) => !r.ok)
console.log('')
console.log(`${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas`)
if (fallos.length > 0) {
  console.log('Comprobaciones falladas (esperado en la deteccion actual si el fallo es real):')
  for (const f of fallos) console.log(`  - ${f.nombre}${f.detalle ? `: ${f.detalle}` : ''}`)
}
