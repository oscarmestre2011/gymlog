/*
 * Comprueba el aviso de "version nueva" que aparece cuando el service worker
 * ha descargado una version mas reciente.
 *
 * Por que existe: medido con scripts/update-behavior.mjs, tras publicar un cambio
 * la app sigue mostrando la version anterior durante la siguiente apertura. Sin
 * aviso, parece que el cambio "no ha llegado".
 *
 * Uso:  node scripts/update-banner.mjs   (requiere dist/ compilado con base /gymlog/)
 */
import { chromium, devices } from 'playwright'
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
      const withoutPrefix = raw.startsWith('/gymlog') ? raw.slice('/gymlog'.length) : raw
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

  await page.goto(`http://localhost:${PORT}/gymlog/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.nav', { timeout: 20000 })
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

  // El aviso no debe tapar la cabecera de la app.
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

  // Volver a mostrarlo y pulsar Actualizar: debe recargar la app.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gymlog:update-ready')))
  await page.waitForSelector('.update-banner', { timeout: 8000 })
  const navigated = page.waitForEvent('framenavigated', { timeout: 15000 }).then(() => true).catch(() => false)
  await page.locator('.update-banner button', { hasText: 'Actualizar' }).click()
  check('El boton Actualizar recarga la app', await navigated)
  await page.waitForSelector('.nav', { timeout: 20000 })
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
