/*
 * Comprueba que pasa si la base de datos local del movil no responde.
 *
 * La app abre la base de datos al arrancar (para sembrar ejercicios y rutinas).
 * Si esa operacion se queda colgada en lugar de fallar, la app se quedaria en la
 * pantalla de carga: fondo oscuro y un indicador casi invisible. Es indistinguible
 * de una "pantalla en negro".
 *
 * Uso:  node scripts/diagnose-storage.mjs
 */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const PORT = 5390
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function serve() {
  const server = createServer(async (req, res) => {
    const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const relative = raw.replace(/^[/\\]+/, '')
    let filePath = join(distDir, normalize(relative === '' ? 'index.html' : relative))
    try {
      if (!(await stat(filePath)).isFile()) filePath = join(distDir, 'index.html')
    } catch {
      filePath = join(distDir, 'index.html')
    }
    const body = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(body)
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

const server = await serve()
const browser = await chromium.launch()

async function probar(nombre, initScript) {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  if (initScript) await context.addInitScript(initScript)
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }).catch(() => null)
  let monto = true
  try {
    await page.waitForSelector('.nav', { timeout: 12000 })
  } catch {
    monto = false
  }
  const visible = (await page.locator('body').innerText().catch(() => '')).trim()
  // Un indicador de carga visible indica que la app se quedo esperando.
  const spinnerVisible = await page.locator('.spinner').isVisible().catch(() => false)

  console.log(`\n${nombre}`)
  console.log(`  la app se monto:      ${monto ? 'SI' : 'NO'}`)
  console.log(`  indicador de carga:   ${spinnerVisible ? 'SI (colgada esperando)' : 'no'}`)
  console.log(`  texto visible:        ${visible.length > 0 ? `${visible.length} caracteres` : 'NADA (pantalla oscura)'}`)
  if (errores.length > 0) console.log(`  errores:              ${[...new Set(errores)].slice(0, 3).join(' | ')}`)

  if (!monto && spinnerVisible) {
    console.log('  >>> SINTOMA REPRODUCIDO: pantalla oscura con indicador, indistinguible de un negro')
    await page.screenshot({ path: join(here, '..', 'capturas', 'diag-carga-colgada.png') })
  }
  await context.close()
}

console.log('Comprobando que pasa si la base de datos local no responde...')

await probar('1) Caso normal (referencia)', null)

await probar('2) IndexedDB se queda colgada (nunca llama a sus callbacks)', () => {
  const original = indexedDB.open.bind(indexedDB)
  indexedDB.open = function (...args) {
    const request = original(...args)
    // Se anulan los callbacks para simular una base de datos que no responde.
    Object.defineProperty(request, 'onsuccess', { set() {}, get: () => null })
    Object.defineProperty(request, 'onerror', { set() {}, get: () => null })
    Object.defineProperty(request, 'onupgradeneeded', { set() {}, get: () => null })
    return request
  }
})

await probar('3) IndexedDB lanza error al abrir', () => {
  indexedDB.open = function () {
    throw new Error('IndexedDB bloqueada por el navegador')
  }
})

await browser.close()
server.close()
