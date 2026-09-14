/*
 * Verificacion de la app PUBLICADA, no del codigo local.
 *
 * Abre la direccion real en un navegador simulando un movil y comprueba que no
 * basta con que el servidor responda: que la app arranque, que se pueda registrar
 * una serie, que el service worker se active y que funcione sin conexion.
 *
 * Uso:  node scripts/verify-live.mjs [url]
 */
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.argv[2] ?? 'https://oscarmestre2011.github.io/gymlog/'
const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log(`Comprobando: ${url}\n`)

const browser = await chromium.launch()
const context = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
})
const page = await context.newPage()

const jsErrors = []
const failedRequests = []
page.on('pageerror', (e) => jsErrors.push(String(e).split('\n')[0]))
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`)
})

try {
  /* -------------------------- 1. la app arranca -------------------------- */
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  check('El servidor responde 200', response?.status() === 200, `HTTP ${response?.status()}`)

  await page.waitForSelector('.nav', { timeout: 40000 })
  await page.waitForTimeout(1000)
  const home = await page.locator('body').innerText()
  check('La app se monta y muestra la portada', home.includes('Empezar entrenamiento'))
  check('Carga sin errores de JavaScript', jsErrors.length === 0, jsErrors.join(' | '))
  check('No hay recursos que devuelvan error', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '))

  /* ----------------------- 2. las rutinas del vault --------------------- */
  check('Estan las rutinas del vault (Fuerza A/B/C)', home.includes('Fuerza A') || home.includes('Empuje'), home.slice(0, 60).replace(/\n/g, ' '))
  await page.screenshot({ path: join(shotsDir, '12-publicada-inicio.png') })

  /* ------------------- 3. registrar una serie de verdad ----------------- */
  await page.getByText('Empezar entrenamiento').click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 15000 })

  const card = page.locator('.exercise-card').first()
  await card.locator('.set-row .input').nth(0).fill('50')
  await card.locator('.set-row .input').nth(1).fill('10')
  await card.locator('.set-row .icon-btn').last().click()
  await page.waitForTimeout(1200)

  const session = await page.locator('body').innerText()
  check('Se registra una serie', session.includes('1 serie'))
  check('El cronometro de descanso arranca', await page.locator('.rest-bar').isVisible())
  await page.screenshot({ path: join(shotsDir, '13-publicada-sesion.png') })

  /* --------------------- 4. service worker y cache ------------------- */
  await page.reload({ waitUntil: 'networkidle', timeout: 40000 })
  await page.waitForTimeout(2500)
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { soportado: false }
    const registration = await navigator.serviceWorker.getRegistration()
    return {
      soportado: true,
      controlada: Boolean(navigator.serviceWorker.controller),
      estado: registration?.active?.state,
      ambito: registration ? new URL(registration.scope).pathname : null,
      cache: (await caches.keys()).join(','),
    }
  })
  check('El service worker esta activo', sw.soportado && sw.estado === 'activated', `${sw.estado ?? '-'} ambito=${sw.ambito ?? '-'}`)
  check('El ambito es la subcarpeta /gymlog/', sw.ambito === '/gymlog/', String(sw.ambito))
  check('Hay cache creada', Boolean(sw.cache), String(sw.cache))

  /* --------------------------- 5. sin conexion ---------------------- */
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null)
  let offlineOk = true
  try {
    await page.waitForSelector('.nav', { timeout: 30000 })
  } catch {
    offlineOk = false
  }
  check('La app abre SIN CONEXION desde la direccion publicada', offlineOk)
  if (offlineOk) {
    const text = await page.locator('body').innerText()
    check('La sesion en curso sobrevive sin conexion', text.includes('Terminar y guardar'))
    await page.screenshot({ path: join(shotsDir, '14-publicada-offline.png') })
  }
  await context.setOffline(false)

  /* -------------------------- 6. el manifiesto --------------------- */
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href')
    if (!href) return null
    const response = await fetch(href)
    return response.ok ? response.json() : null
  })
  check('El manifiesto esta accesible', manifest !== null)
  if (manifest) {
    check('Declara modo aplicacion', manifest.display === 'standalone', manifest.display)
    check('Tiene nombre corto para el icono', Boolean(manifest.short_name), manifest.short_name)
    const iconsOk = await page.evaluate(async (icons) => {
      const responses = await Promise.all(icons.map((i) => fetch(i.src)))
      return responses.every((r) => r.ok)
    }, manifest.icons)
    check('Los iconos existen en la direccion publicada', iconsOk)
  }
} catch (error) {
  check('El recorrido completo termina sin excepciones', false, String(error).split('\n')[0])
  await page.screenshot({ path: join(shotsDir, 'error-publicada.png') }).catch(() => null)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
