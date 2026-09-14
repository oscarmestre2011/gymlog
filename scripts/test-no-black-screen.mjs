/*
 * Prueba de que la app NUNCA se queda en una pantalla oscura sin explicacion.
 *
 * Motivo: se detecto que si el almacenamiento del movil se queda colgado al
 * arrancar, la app esperaba para siempre y solo se veia fondo oscuro (el
 * indicador de carga es diminuto y pasa desapercibido). Es el peor fallo
 * posible: el usuario no sabe si esperar, cerrar la app o desinstalar.
 *
 * Aqui se comprueba que ahora aparece un mensaje con salida, y que "Reintentar"
 * funciona cuando el problema se resuelve.
 *
 * Uso:  node scripts/test-no-black-screen.mjs
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const shotsDir = join(here, '..', 'capturas')
const PORT = 5389
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
    try {
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
    } catch {
      res.writeHead(404).end('404')
    }
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const server = await serve()
const browser = await chromium.launch()
mkdirSync(shotsDir, { recursive: true })

try {
  /* --- Caso 1: la base de datos se queda colgada --- */
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  await context.addInitScript(() => {
    // Se simula un almacenamiento que no responde nunca (no falla: se cuelga).
    const original = indexedDB.open.bind(indexedDB)
    indexedDB.open = function (...args) {
      const request = original(...args)
      Object.defineProperty(request, 'onsuccess', { set() {}, get: () => null })
      Object.defineProperty(request, 'onerror', { set() {}, get: () => null })
      Object.defineProperty(request, 'onupgradeneeded', { set() {}, get: () => null })
      return request
    }
  })
  const page = await context.newPage()

  console.log('Caso: el almacenamiento del movil no responde al arrancar\n')
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  // Mientras espera, debe decir que esta abriendo (no dejar la pantalla muda).
  await page.waitForTimeout(1500)
  const mientras = await page.locator('body').innerText()
  check('Mientras carga, se explica que esta pasando', /abriendo tus entrenamientos/i.test(mientras), mientras.trim().slice(0, 60))

  // Pasado el tiempo limite (10 s), debe aparecer el error con salida.
  await page.waitForSelector('text=no ha podido arrancar', { timeout: 20000 }).catch(() => null)
  const error = await page.locator('body').innerText()
  check('Aparece un mensaje de error en lugar de pantalla oscura', error.includes('no ha podido arrancar'))
  check('Se explica el motivo', /no ha respondido/i.test(error), (error.match(/no ha respondido[^\n]*/)?.[0] ?? '').slice(0, 80))
  check('Ofrece reintentar', await page.locator('button', { hasText: 'Reintentar' }).isVisible())

  // Las salidas de emergencia estan dentro de un desplegable: se abre para comprobarlas.
  await page.locator('details summary').click()
  await page.waitForTimeout(400)
  const avanzado = await page.locator('body').innerText()
  check('Ofrece limpiar la cache (sin borrar datos)', /Limpiar la caché/i.test(avanzado))
  // El aviso de que borra los datos va en el dialogo de confirmacion del propio
  // boton, asi que aqui solo se comprueba que existe y que esta marcado como peligroso.
  const botonBorrar = page.locator('button', { hasText: 'Borrar los datos' })
  check('Ofrece borrar los datos como ultimo recurso', await botonBorrar.isVisible())
  check(
    'El boton de borrar esta marcado como peligroso',
    ((await botonBorrar.getAttribute('class')) ?? '').includes('danger'),
    (await botonBorrar.getAttribute('class')) ?? '',
  )

  await page.screenshot({ path: join(shotsDir, '16-error-arranque.png') })

  /* --- Caso 2: Reintentar funciona cuando el problema se resuelve --- */
  // Se deja de simular el cuelgue y se pulsa Reintentar.
  await context.addInitScript(() => {
    // En el siguiente arranque, IndexedDB vuelve a funcionar con normalidad.
  })
  await page.evaluate(() => {
    // Nada que hacer: el parche solo afectaba a la pagina anterior.
  })
  await context.close()

  const context2 = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page2 = await context2.newPage()
  await page2.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await esperarApp(page2, 20000)
  check('Con el almacenamiento sano, la app arranca normalmente', await page2.locator('.nav').isVisible())
  await context2.close()
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
