/*
 * Prueba del modo offline (service worker) y de la instalabilidad.
 *
 * Escenarios:
 *  A) http://localhost — contexto seguro por definicion (el caso del ordenador).
 *  B) http://<ip-de-red> — contexto NO seguro (el caso del movil por wifi sin HTTPS).
 *
 * Uso:  node scripts/pwa.mjs
 */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

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

/** Sirve dist/ con el comportamiento de un hosting estatico. */
function serve(host, port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`)
      const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
      const filePath = join(distDir, relative === '' ? 'index.html' : relative)
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403).end('prohibido')
        return
      }
      const body = await readFile(filePath)
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Service-Worker-Allowed': '/',
      })
      res.end(body)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('no encontrado')
    }
  })
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)))
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')) {
        return item.address
      }
    }
  }
  return null
}

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}
function info(message) {
  console.log(`     · ${message}`)
}

/** Intenta cargar la app y devuelve el texto visible, o null si no llego a montarse. */
async function readApp(page, timeout = 25000) {
  try {
    await page.waitForSelector('.nav', { timeout })
  } catch {
    return null
  }
  await page.waitForTimeout(600)
  return page.locator('body').innerText().catch(() => null)
}

async function serviceWorkerState(page) {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no-soportado'
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return 'sin-registro'
    return registration.active?.state ?? registration.installing?.state ?? 'registrado'
  })
}

/** Recarga tolerante: en modo offline la navegacion puede resolverse de forma rara. */
async function reloadOffline(page) {
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    return null
  } catch (error) {
    return String(error).split('\n')[0]
  }
}

/**
 * Espera a que el service worker tenga TODO en cache.
 *
 * Sin esto la prueba es inestable: si se corta la conexion mientras el service
 * worker aun esta precargando, la recarga offline puede quedarse sin responder.
 * Es una condicion de carrera real, no un capricho de la prueba.
 */
async function waitForCacheReady(page, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const state = await page.evaluate(async () => {
      const cache = await caches.open('gymlog-v2')
      const keys = await cache.keys()
      const paths = keys.map((request) => new URL(request.url).pathname)
      const hasHtml = paths.some((path) => path.endsWith('/') || path.endsWith('index.html'))
      const hasJs = paths.some((path) => path.endsWith('.js'))
      const hasCss = paths.some((path) => path.endsWith('.css'))
      return { total: keys.length, listo: hasHtml && hasJs && hasCss, hasHtml, hasJs, hasCss }
    })
    if (state.listo) return state
    await page.waitForTimeout(400)
  }
  return page.evaluate(async () => {
    const cache = await caches.open('gymlog-v2')
    const keys = await cache.keys()
    const paths = keys.map((request) => new URL(request.url).pathname)
    return {
      total: keys.length,
      listo: false,
      hasHtml: paths.some((path) => path.endsWith('/') || path.endsWith('index.html')),
      hasJs: paths.some((path) => path.endsWith('.js')),
      hasCss: paths.some((path) => path.endsWith('.css')),
    }
  })
}

/* ============================== escenario A ============================== */
const serverA = await serve('127.0.0.1', 5399)
const browserA = await chromium.launch({ args: ['--allow-file-access-from-files'] })
try {
  const context = await browserA.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('http://localhost:5399/', { waitUntil: 'networkidle' })
  check('A · La app arranca desde el build de produccion', (await readApp(page)) !== null)

  // El service worker se registra en el evento load: hace falta recargar para que tome el control.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  check('A · El service worker se activa', (await serviceWorkerState(page)) === 'activated', await serviceWorkerState(page))
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
  check('A · La pagina queda controlada por el service worker', controlled)

  const manifestHref = await page.getAttribute('link[rel=manifest]', 'href')
  const manifest = await page.evaluate(async (href) => (await fetch(href)).json(), manifestHref)
  check('A · El manifiesto declara modo aplicacion', manifest.display === 'standalone', manifest.display)
  check('A · El manifiesto lleva iconos de 192 y 512', manifest.icons?.length >= 2, `${manifest.icons?.length} iconos`)
  check('A · Nombre corto para el icono del movil', Boolean(manifest.short_name), manifest.short_name)
  const iconsOk = await page.evaluate(async (icons) => {
    const responses = await Promise.all(icons.map((i) => fetch(i.src)))
    return responses.every((r) => r.ok)
  }, manifest.icons)
  check('A · Los iconos del manifiesto existen', iconsOk)

  /* ------------------------- preparar una sesion ------------------------- */
  await page.getByText('Empezar entrenamiento').click()
  await page.waitForSelector('.modal', { timeout: 8000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza B' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 8000 })

  const card = page.locator('.exercise-card').first()
  await card.locator('.set-row .input').nth(0).fill('65')
  await card.locator('.set-row .input').nth(1).fill('10')
  await card.locator('.set-row .icon-btn').last().click()
  await page.waitForTimeout(900)

  /* ----------------------------- MODO OFFLINE ---------------------------- */
  // Se comprueba que el service worker ya tiene todo cacheado antes de cortar la red.
  const cacheState = await waitForCacheReady(page)
  check(
    'A · El service worker precarga la app completa (HTML, JS y CSS)',
    cacheState.listo,
    `${cacheState.total} recursos (html=${cacheState.hasHtml}, js=${cacheState.hasJs}, css=${cacheState.hasCss})`,
  )

  await context.setOffline(true)
  const navError = await reloadOffline(page)
  if (navError) info(`la navegacion offline avisa: ${navError}`)

  const offlineText = await readApp(page)
  check('A · La app abre SIN CONEXION (recarga en modo offline)', offlineText !== null)
  if (offlineText) {
    check(
      'A · La sesion en curso sobrevive sin conexion',
      offlineText.includes('Terminar y guardar') && offlineText.includes('65'),
      offlineText.slice(0, 90).replace(/\n/g, ' '),
    )
  } else {
    const html = await page.content().catch(() => '')
    info(`HTML recibido sin conexion: ${html.length} caracteres`)
  }

  // Y se puede seguir apuntando series sin conexion.
  const cardOffline = page.locator('.exercise-card').first()
  if (await cardOffline.count()) {
    await cardOffline.locator('.set-row .input').nth(0).fill('67,5')
    await cardOffline.locator('.set-row .input').nth(1).fill('8')
    await cardOffline.locator('.set-row .icon-btn').last().click()
    await page.waitForTimeout(900)
    const after = await page.locator('body').innerText()
    check('A · Se puede seguir registrando series sin conexion', after.includes('2 series'), after.match(/\d+ series/)?.[0] ?? '')
  } else {
    check('A · Se puede seguir registrando series sin conexion', false, 'no se monto la pantalla de sesion')
  }

  check('A · No hay errores de JavaScript en todo el recorrido', errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: join(shotsDir, '11-offline.png'), fullPage: false }).catch(() => {})
  await context.setOffline(false)
} finally {
  await browserA.close()
  serverA.close()
}

/* ============================== escenario B ============================== */
const ip = lanAddress()
if (!ip) {
  check('B · Hay una IP de red local para probar', false, 'no se encontro ninguna')
} else {
  const origin = `http://${ip}:5398`
  const serverB = await serve(ip, 5398)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
    const secure = await page.evaluate(() => ({
      secure: window.isSecureContext,
      swApi: 'serviceWorker' in navigator,
    }))
    check(
      'B · Por http en red local la app se ve y funciona',
      (await readApp(page)) !== null,
    )
    check(
      'B · Pero NO es contexto seguro: sin service worker ni instalacion',
      secure.secure === false && secure.swApi === false,
      `isSecureContext=${secure.secure}, serviceWorker=${secure.swApi}`,
    )
    await page.close()
  } finally {
    await browser.close()
    serverB.close()
  }
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const failure of failed) console.log(`  - ${failure.name}${failure.detail ? `: ${failure.detail}` : ''}`)
  process.exit(1)
}
