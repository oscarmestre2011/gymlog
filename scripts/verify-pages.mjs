/*
 * Verifica que la app funciona PUBLICADA EN UNA SUBCARPETA, tal y como la sirve
 * GitHub Pages (https://kairosentrena.com/app/).
 *
 * Comprueba lo que se rompe de verdad en ese escenario: rutas de los ficheros,
 * ambito del service worker, start_url del manifiesto y navegacion directa a
 * rutas inexistentes.
 *
 * IMPORTANTE: compila en una carpeta aparte (.tmp-dist-pages) a proposito, para
 * NO pisar dist/. Si esta prueba sobreescribiera dist/, despues el smoke test y
 * la prueba de PWA fallarian al servir desde la raiz, y el fallo pareceria de la
 * app cuando solo seria del orden de las pruebas.
 *
 * Uso:  node scripts/verify-pages.mjs
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { createServer } from 'node:http'
import { readFile, stat, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const distDir = join(projectDir, '.tmp-dist-pages')
const SUBPATH = '/app/'
const PORT = 5395

console.log('Compilando para subcarpeta en .tmp-dist-pages (sin tocar dist/)...')
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--outDir', '.tmp-dist-pages', '--emptyOutDir'], {
  cwd: projectDir,
  env: { ...process.env, GYMLOG_BASE: SUBPATH },
  shell: process.platform === 'win32',
})
console.log('compilado\n')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/**
 * Servidor que imita a GitHub Pages: la app vive bajo /app/ y cualquier ruta
 * desconocida devuelve el index (comportamiento de sitio estatico con fallback).
 *
 * OJO: hay que quitar el prefijo ANTES de normalizar la ruta. En Windows,
 * path.normalize() convierte "/app/x" en "\\app\\x", y la comprobacion del
 * prefijo fallaria en silencio sirviendo siempre el index.
 */
function servePages() {
  const server = createServer(async (req, res) => {
    try {
      const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const withoutPrefix = raw.startsWith('/app') ? raw.slice('/app'.length) : raw
      const relative = withoutPrefix.replace(/^[/\\]+/, '')

      // Proteccion contra rutas que intenten salir de dist/.
      const safeRelative = normalize(relative).replace(/^(\.\.[/\\])+/, '')
      let filePath = join(distDir, safeRelative === '' ? 'index.html' : safeRelative)

      let exists = false
      try {
        exists = (await stat(filePath)).isFile()
      } catch {
        exists = false
      }
      if (!exists) filePath = join(distDir, 'index.html')

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

const server = await servePages()
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()

  const notFound = []
  const jsErrors = []
  page.on('pageerror', (e) => jsErrors.push(String(e)))
  page.on('response', (r) => {
    if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`)
  })

  const base = `http://localhost:${PORT}${SUBPATH}`

  /* 1. El index generado apunta a las rutas correctas */
  const html = await readFile(join(distDir, 'index.html'), 'utf8')
  const usesAbsoluteBase = html.includes(`${SUBPATH}assets/`)
  check('El HTML generado usa rutas con la base /app/', usesAbsoluteBase)

  const relativePaths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  const suspicious = relativePaths.filter((p) => p.startsWith('/') && !p.startsWith(SUBPATH))
  check('Ninguna ruta se escapa de la subcarpeta', suspicious.length === 0, suspicious.join(', '))

  /* 2. La app carga y funciona en la subcarpeta */
  await page.goto(base, { waitUntil: 'networkidle' })
  await esperarApp(page, 20000)
  await page.waitForTimeout(700)
  const homeText = await page.locator('body').innerText()
  check('La app arranca servida desde /app/', homeText.includes('Hoy es'))
  check('No hay peticiones que devuelvan error', notFound.length === 0, notFound.slice(0, 3).join(' | '))
  check('No hay errores de JavaScript', jsErrors.length === 0, jsErrors.join(' | '))

  /* 3. Runner completo: empezar sesion y apuntar una serie bajo la subcarpeta */
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 8000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza C' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 8000 })
  const card = page.locator('.exercise-card').first()
  await card.locator('.set-row .input').nth(0).fill('47,5')
  await card.locator('.set-row .input').nth(1).fill('8')
  await card.locator('.set-row .icon-btn').last().click()
  await page.waitForTimeout(900)
  const sessionText = await page.locator('body').innerText()
  check('Se puede registrar una serie desde la subcarpeta', sessionText.includes('1 serie') && sessionText.includes('47,5'))
  check('El cronometro de descanso funciona en la subcarpeta', await page.locator('.rest-bar').isVisible())

  /* 4. Service worker con el ambito correcto */
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  /*
   * Se cuentan los recursos de la cache del service worker. La cache es cualquiera que empiece
   * por "gymlog-" y no un nombre escrito a mano: antes ponia "gymlog-v6" y la prueba fallaba
   * cada vez que se subia la version de la cache, con un fallo que parecia de la app y no lo era.
   */
  const sw = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return { ok: false }
    const scope = new URL(registration.scope).pathname
    const nombres = await caches.keys()
    const propias = nombres.filter((n) => n.startsWith('gymlog-'))
    let recursos = 0
    for (const nombre of propias) {
      const cache = await caches.open(nombre)
      recursos += (await cache.keys()).length
    }
    return {
      ok: Boolean(registration.active),
      state: registration.active?.state,
      scope,
      cached: recursos,
      cacheNames: nombres,
    }
  })
  check('El service worker se activa bajo la subcarpeta', sw.ok && sw.state === 'activated', `${sw.state} scope=${sw.scope}`)
  check('El ambito del service worker es la subcarpeta', sw.scope === SUBPATH, `scope=${sw.scope}`)
  check('Precarga recursos en cache', (sw.cached ?? 0) > 0, `${sw.cached} recursos`)

  /* 5. Offline desde la subcarpeta */
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
  let offlineOk = true
  try {
    await esperarApp(page, 20000)
  } catch {
    offlineOk = false
  }
  check('La app abre SIN CONEXION desde la subcarpeta', offlineOk)
  if (offlineOk) {
    const offlineText = await page.locator('body').innerText()
    check('La sesion en curso sobrevive sin conexion', offlineText.includes('Terminar y guardar'))
  }
  await context.setOffline(false)

  /* 6. Manifiesto: start_url y ambito relativos a la subcarpeta */
  const manifest = JSON.parse(await readFile(join(distDir, 'manifest.webmanifest'), 'utf8'))
  check('El manifiesto usa rutas relativas', String(manifest.start_url).startsWith('.'), manifest.start_url)
  const resolved = await page.evaluate(async (href) => {
    const link = document.querySelector('link[rel=manifest]')
    const url = new URL(link.getAttribute('href'), location.href)
    return url.pathname
  }, './manifest.webmanifest')
  check('El manifiesto se resuelve dentro de la subcarpeta', resolved === `${SUBPATH}manifest.webmanifest`, resolved)

  /* 7. Ruta desconocida dentro de la subcarpeta */
  await page.goto(`${base}cualquier-cosa`, { waitUntil: 'networkidle' })
  const fallback = await page.locator('.nav').count()
  check('Una ruta desconocida cae en la app (no en un 404)', fallback === 1)
} finally {
  await browser.close()
  server.close()
  // Se limpia la carpeta temporal de la prueba.
  await rm(distDir, { recursive: true, force: true }).catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const failure of failed) console.log(`  - ${failure.name}${failure.detail ? `: ${failure.detail}` : ''}`)
  process.exit(1)
}
