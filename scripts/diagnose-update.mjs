/*
 * Diagnostico de la deteccion de version nueva.
 *
 * Se ejecuta el mismo codigo que usa la app para decidir si hay novedad y se informa
 * de lo que devuelve, para saber si el problema esta en la deteccion o en el aviso.
 *
 * Uso:  node scripts/diagnose-update.mjs
 */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat, mkdir, rm, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const distDir = join(projectDir, 'dist')
const trabajo = join(projectDir, '.tmp-diagnose')
const PORT = 5382
const SUBPATH = '/app/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
}

const nombreJs = async (dir) =>
  /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(await readFile(join(dir, 'index.html'), 'utf8'))?.[1] ?? '?'

await rm(trabajo, { recursive: true, force: true })
await mkdir(trabajo, { recursive: true })
const dirAntiguo = join(trabajo, 'antiguo')
await cp(distDir, dirAntiguo, { recursive: true })

// La version antigua: se cambia el fichero JS por una copia con otro nombre, para que
// el nombre en uso sea distinto del publicado SIN necesidad de recompilar nada.
const jsActual = await nombreJs(dirAntiguo)
const jsFalso = jsActual.replace('.js', '-viejo.js')
await cp(join(dirAntiguo, 'assets', jsActual), join(dirAntiguo, 'assets', jsFalso))
const html = await readFile(join(dirAntiguo, 'index.html'), 'utf8')
await (await import('node:fs/promises')).writeFile(
  join(dirAntiguo, 'index.html'),
  html.replace(jsActual, jsFalso),
  'utf8',
)

console.log(`En uso (version cargada): ${jsFalso}`)
console.log(`Publicado (version nueva): ${jsActual}\n`)

function serve(getDir) {
  const server = createServer(async (req, res) => {
    const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const sinPrefijo = raw.startsWith('/app') ? raw.slice('/app'.length) : raw
    const relative = sinPrefijo.replace(/^[/\\]+/, '')
    const dir = getDir()
    let filePath = join(dir, normalize(relative === '' ? 'index.html' : relative))
    try {
      if (!(await stat(filePath)).isFile()) filePath = join(dir, 'index.html')
    } catch {
      filePath = join(dir, 'index.html')
    }
    const body = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(body)
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

let sirviendo = 'antiguo'
const server = await serve(() => (sirviendo === 'antiguo' ? dirAntiguo : distDir))
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  page.on('console', (m) => console.log(`   [consola] ${m.text()}`))

  await page.goto(`http://localhost:${PORT}${SUBPATH}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  if ((await page.locator('text=Bienvenido a').count()) > 0) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(800)
  }
  await page.waitForSelector('.nav', { timeout: 25000 })

  const enUso = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'))
    return scripts
  })
  console.log(`\nEtiquetas script de la pagina: ${JSON.stringify(enUso)}`)

  // Se publica la version nueva y se ejecuta la MISMA logica de deteccion de la app.
  sirviendo = 'nuevo'
  await page.waitForTimeout(1000)

  // Primero se comprueba que el servidor ya sirve la version nueva (sin pasar por el SW).
  const desdeElServidor = await page.evaluate(async () => {
    const r = await fetch(`./index.html?cachebuster=${Date.now()}`, { cache: 'no-store' })
    const html = await r.text()
    return { ok: r.ok, publicado: /index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? '?', tamano: html.length }
  })
  console.log(`\nEl servidor sirve: ${desdeElServidor.publicado} (${desdeElServidor.tamano} caracteres)`)

  const deteccion = await page.evaluate(async () => {
    const enUsoNombre = (() => {
      for (const script of [...document.querySelectorAll('script[src]')]) {
        const nombre = /index-[A-Za-z0-9_-]+\.js/.exec(script.getAttribute('src') ?? '')
        if (nombre) return nombre[0]
      }
      return null
    })()

    // 1) Peticion normal, la que hace la app.
    const normal = await fetch('./index.html', { cache: 'no-store' })
    const htmlNormal = await normal.text()

    // 2) Sin pasar por el service worker (no-store + cabecera de control).
    const sinSw = await fetch(`./index.html?sin-sw=${Date.now()}`, { cache: 'no-store' })
    const htmlSinSw = await sinSw.text()

    // 3) Que hay guardado en la cache del service worker.
    const caches1 = await caches.keys()
    const cache = caches1.length ? await caches.open(caches1[0]) : null
    const claves = cache ? (await cache.keys()).map((p) => new URL(p.url).pathname) : []
    let htmlCacheado = ''
    if (cache) {
      const guardado = await cache.match(new Request('./index.html', { credentials: 'same-origin' }))
      if (guardado) htmlCacheado = await guardado.text()
    }

    const saca = (html) => /index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? '?'
    return {
      enUsoNombre,
      normal: saca(htmlNormal),
      desdeServidor: saca(htmlSinSw),
      enCacheDelSw: saca(htmlCacheado),
      claves,
      tieneControlador: Boolean(navigator.serviceWorker.controller),
    }
  })
  console.log(`\nQuien sirve cada cosa:`)
  console.log(`   en uso en la pagina:     ${deteccion.enUsoNombre}`)
  console.log(`   fetch normal (la app):   ${deteccion.normal}`)
  console.log(`   fetch sin service worker:${deteccion.desdeServidor}`)
  console.log(`   copia en cache del sw:   ${deteccion.enCacheDelSw}`)
  console.log(`   hay service worker:      ${deteccion.tieneControlador ? 'si' : 'no'}`)
  console.log(`   claves en cache:         ${deteccion.claves.join(', ')}`)

  // Y ahora el aviso de la app de verdad, simulando volver a la aplicacion.
  console.log('\nSimulando que se vuelve a la app (visibilitychange):')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(4000)
  const aviso = await page.locator('.update-banner').count()
  console.log(`   aviso visible: ${aviso > 0 ? 'SI' : 'NO'}`)
} finally {
  await browser.close()
  server.close()
  await rm(trabajo, { recursive: true, force: true })
}
