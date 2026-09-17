/*
 * Comprueba el aviso de "version nueva" que aparece cuando el service worker
 * ha descargado una version mas reciente.
 *
 * Por que existe: medido con scripts/update-behavior.mjs, tras publicar un cambio
 * la app sigue mostrando la version anterior durante la siguiente apertura. Sin
 * aviso, parece que el cambio "no ha llegado".
 *
 * Uso:  node scripts/update-banner.mjs   (requiere dist/ compilado con base /app/)
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
const PORT = 5392

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
      const withoutPrefix = raw.startsWith('/app') ? raw.slice('/app'.length) : raw
      const relative = withoutPrefix.replace(/^[/\\]+/, '')
      let filePath = join(distDir, normalize(relative) === '' ? 'index.html' : normalize(relative))
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
try {
  mkdirSync(shotsDir, { recursive: true })
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()

  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: 'networkidle' })
  await esperarApp(page, 20000)
  await page.waitForTimeout(800)

  check('En condiciones normales NO aparece el aviso', (await page.locator('.update-banner').count()) === 0)

  // Se simula el aviso del service worker (en produccion lo dispara main.tsx).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gymlog:update-ready')))
  await page.waitForSelector('.update-banner', { timeout: 8000 })

  const banner = await page.locator('.update-banner').innerText()
  check('El aviso aparece cuando hay version nueva', banner.includes('versión nueva'), banner.replace(/\n/g, ' '))
  check('El aviso tranquiliza sobre los datos', /datos no se tocan/i.test(banner))
  check('Ofrece un boton para actualizar', await page.locator('.update-banner button', { hasText: 'Actualizar' }).isVisible())
  check('Se puede descartar', await page.locator('.update-banner .icon-btn').isVisible())

  /*
   * El aviso no debe tapar la cabecera de la app.
   *
   * DOS DETALLES QUE HACEN FALSA ESTA COMPROBACION, y que costaron un rato:
   *
   * 1. Hay que volver ARRIBA antes de medir. Si la pagina esta desplazada, la cabecera (que va
   *    pegada) sube hasta el borde de la pantalla y el aviso la tapa: eso es correcto y esperado.
   *    Al volver arriba, la cabecera queda por debajo del aviso.
   * 2. Hay que esperar a que el hueco se aplique: el alto del aviso lo mide un efecto de React y
   *    se publica como variable CSS, asi que medir al instante es una carrera.
   */
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await page
    .waitForFunction(
      () => {
        const app = document.querySelector('.app')
        const topbar = document.querySelector('.topbar')
        if (!app || !topbar) return false
        const hueco = parseFloat(getComputedStyle(app).paddingTop) || 0
        return hueco > 0 && Math.round(topbar.getBoundingClientRect().y) >= hueco - 1
      },
      { timeout: 4000 },
    )
    .catch(() => undefined)

  const topbarBox = await page.locator('.topbar').boundingBox()
  const bannerBox = await page.locator('.update-banner').boundingBox()
  check(
    'El aviso no tapa la cabecera',
    Boolean(topbarBox && bannerBox && topbarBox.y >= bannerBox.y + bannerBox.height - 1),
    `banner acaba en y=${bannerBox ? Math.round(bannerBox.y + bannerBox.height) : '?'}, cabecera empieza en y=${topbarBox ? Math.round(topbarBox.y) : '?'}`,
  )

  await page.screenshot({ path: join(shotsDir, '15-aviso-version-nueva.png') })

  // Descartar: no debe recargar ni molestar.
  await page.locator('.update-banner .icon-btn').click()
  await page.waitForTimeout(500)
  check('Al descartarlo desaparece', (await page.locator('.update-banner').count()) === 0)
  check('Descartarlo no recarga ni pierde el estado', await page.locator('.nav').isVisible())

  /*
   * Regresion de un fallo real: el service worker guardaba el HTML con una clave y lo
   * buscaba con otra, asi que servia la copia ANTIGUA aunque tuviera la nueva (se veian
   * hasta tres entradas "/index.html" distintas en la misma cache). Consecuencia: la app
   * se quedaba en la version anterior y el aviso de version nueva no saltaba.
   *
   * Se comprueba que la cache no tiene claves duplicadas y que el HTML guardado es el
   * mismo que el publicado.
   */
  const cache = await page.evaluate(async () => {
    const nombres = await caches.keys()
    if (nombres.length === 0) return { sinCache: true, duplicadas: [], rutas: [] }
    const abierta = await caches.open(nombres[0])
    const peticiones = await abierta.keys()
    const rutas = peticiones.map((p) => new URL(p.url).pathname)
    const duplicadas = rutas.filter((r, i) => rutas.indexOf(r) !== i)

    const guardado = await abierta.match(new Request('./index.html', { credentials: 'same-origin' }))
    const htmlGuardado = guardado ? await guardado.text() : ''
    const publicado = await fetch(`./index.html?comprobar=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
    const saca = (html) => /index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? '?'
    return { rutas, duplicadas, guardado: saca(htmlGuardado), publicado: saca(publicado) }
  })

  check(
    'La caché no tiene claves duplicadas',
    (cache.duplicadas ?? []).length === 0,
    (cache.duplicadas ?? []).join(', ') || `${(cache.rutas ?? []).length} claves`,
  )
  check(
    'El HTML guardado es el mismo que el publicado (no sirve copia vieja)',
    !cache.sinCache && Boolean(cache.guardado) && cache.guardado === cache.publicado,
    `guardado: ${cache.guardado} / publicado: ${cache.publicado}`,
  )

  // Volver a mostrarlo y pulsar Actualizar: debe recargar la app.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gymlog:update-ready')))
  await page.waitForSelector('.update-banner', { timeout: 8000 })
  const navigated = page.waitForEvent('framenavigated', { timeout: 15000 }).then(() => true).catch(() => false)
  await page.locator('.update-banner button', { hasText: 'Actualizar' }).click()
  check('El boton Actualizar recarga la app', await navigated)
  await esperarApp(page, 20000)
  check('Tras actualizar la app sigue funcionando', await page.locator('.nav').isVisible())
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
