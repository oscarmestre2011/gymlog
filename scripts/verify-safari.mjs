/*
 * Comprueba la app en el motor de SAFARI (WebKit), que es el que usa el iPhone.
 *
 * Motivo: en iPhone no se puede instalar Chrome como app; todo pasa por Safari.
 * Chrome en Android y Safari en iOS no se comportan igual, asi que probar solo con
 * Chromium no basta para afirmar que funciona en iPhone.
 *
 * Uso:  node scripts/verify-safari.mjs [url]
 * Con la direccion publicada por defecto.
 */
import { webkit, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.argv[2] ?? 'https://kairosentrena.com/app/'
const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log(`Probando en WebKit (motor de Safari), como un iPhone:\n${url}\n`)

const browser = await webkit.launch()
const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'es-ES' })
const page = await context.newPage()

const jsErrors = []
const failedRequests = []
page.on('pageerror', (e) => jsErrors.push(String(e).split('\n')[0]))
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`)
})

try {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  check('Safari carga la app', response?.status() === 200, `HTTP ${response?.status()}`)

  await esperarApp(page, 40000)
  await page.waitForTimeout(1200)
  const home = await page.locator('body').innerText()
  check('La app se monta en Safari', home.includes('Hoy es'))
  check('Sin errores de JavaScript en Safari', jsErrors.length === 0, jsErrors.join(' | '))
  check('Sin recursos que fallen', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '))

  /* ---------------------- altura de pantalla (dvh) ---------------------- */
  // Safari antiguo no entiende "dvh": si no hay respaldo en vh, la app se ve mal.
  const alturas = await page.evaluate(() => ({
    soportaDvh: CSS.supports('height', '100dvh'),
    soportaDvhMin: CSS.supports('min-height', '100dvh'),
    ventana: window.innerHeight,
    barraNavegacionVisible: (() => {
      const nav = document.querySelector('.nav')
      if (!nav) return null
      const r = nav.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight
    })(),
    alturaApp: document.querySelector('.app')?.getBoundingClientRect().height ?? 0,
  }))
  check('Safari entiende las unidades dvh', alturas.soportaDvh || alturas.soportaDvhMin, `dvh=${alturas.soportaDvh}, min-height dvh=${alturas.soportaDvhMin}`)
  check('La app ocupa la pantalla (no se queda a cero)', alturas.alturaApp > 200, `${Math.round(alturas.alturaApp)} px de alto`)
  check('La barra inferior queda visible dentro de la pantalla', alturas.barraNavegacionVisible === true)

  /* -------------------- zona segura del iPhone (notch) ------------------ */
  const seguro = await page.evaluate(() => ({
    soportaEnv: CSS.supports('padding-bottom', 'env(safe-area-inset-bottom, 0px)'),
  }))
  check('Safari entiende las zonas seguras (notch)', seguro.soportaEnv)

  /* -------------------- registrar una serie en Safari ------------------- */
  /*
   * OJO: esta prueba corre por defecto contra la DIRECCION PUBLICADA (no contra el build local), y
   * la publicada puede ser una version anterior. Al limpiar la portada cambio el texto del boton de
   * empezar y el sitio del selector de rutinas, asi que se admiten LAS DOS versiones: asi la prueba
   * vale antes y despues de publicar, y no da un fallo que parece de la app cuando solo es que la
   * version publicada todavia es la vieja.
   */
  const botonNuevo = page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i })
  const botonViejo = page.getByText('Empezar entrenamiento')
  if ((await botonNuevo.count()) > 0) {
    await botonNuevo.first().click({ timeout: 15000 })
  } else {
    await botonViejo.first().click({ timeout: 15000 })
  }
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 15000 })

  const primera = page.locator('.exercise-card').first()
  const peso = primera.locator('input[aria-label="Peso de la nueva serie"]')
  const reps = primera.locator('input[aria-label="Repeticiones de la nueva serie"]')

  // Se teclea con coma, como haria una persona en el teclado español.
  await peso.click()
  await peso.press('Control+A')
  await peso.pressSequentially('52,5', { delay: 80 })
  const pesoEscrito = await peso.inputValue()
  check('En Safari se puede escribir la coma decimal', pesoEscrito === '52,5', `quedó "${pesoEscrito}"`)

  await reps.click()
  await reps.press('Control+A')
  await reps.pressSequentially('8', { delay: 80 })
  await page.waitForTimeout(400)
  const guardar = primera.locator('button[aria-label="Guardar serie"]')
  check('El boton de guardar se habilita en Safari', await guardar.isEnabled())
  await guardar.click()
  await page.waitForTimeout(1200)

  const sesion = await page.locator('body').innerText()
  check('La serie queda registrada en Safari', /1 serie/.test(sesion), sesion.match(/\d+ serie[^\n]*/)?.[0] ?? '')
  check('El decimal se guarda bien', sesion.includes('52,5'))
  check('El cronometro de descanso funciona en Safari', await page.locator('.rest-bar').isVisible())
  await page.screenshot({ path: join(shotsDir, '18-safari-sesion.png') })

  /* ------------- aviso visible al terminar el descanso ------------------ */
  // En iPhone no hay sonido ni vibracion: el aviso tiene que verse.
  console.log('')
  console.log('Comprobando el aviso de fin de descanso (sin sonido en iPhone)...')
  await page.evaluate(() => {
    // Se adelanta el final del descanso para no esperar.
    localStorage.setItem('gymlog.restEndsAt', String(Date.now() + 300))
    localStorage.setItem('gymlog.restTotal', '90')
  })
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.rest-bar', { timeout: 15000 })
  await page.waitForTimeout(2500)
  const aviso = await page.locator('.rest-bar').innerText()
  check('Al terminar el descanso se avisa en pantalla', /Descanso terminado/i.test(aviso), aviso.replace(/\n/g, ' | '))
  const avisoVisible = await page.locator('.rest-done-text').isVisible().catch(() => false)
  check('El aviso es visible, no solo texto oculto', avisoVisible)
  await page.screenshot({ path: join(shotsDir, '19-safari-descanso-terminado.png') })
  await page.locator('.rest-bar .icon-btn').click()
  await page.waitForTimeout(400)

  /* --------------------- service worker y sin conexion ------------------ */
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3000)
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { soportado: false }
    const r = await navigator.serviceWorker.getRegistration()
    return {
      soportado: true,
      estado: r?.active?.state ?? null,
      ambito: r ? new URL(r.scope).pathname : null,
    }
  })
  check('El service worker funciona en Safari', sw.soportado && sw.estado === 'activated', `${sw.estado ?? '-'} ambito=${sw.ambito ?? '-'}`)

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null)
  let offlineOk = true
  try {
    await esperarApp(page, 30000)
  } catch {
    offlineOk = false
  }
  check('La app abre SIN CONEXION en Safari', offlineOk)
  if (offlineOk) {
    const texto = await page.locator('body').innerText()
    check('La sesion en curso sobrevive sin conexion en Safari', texto.includes('Terminar y guardar'))
  }
  await context.setOffline(false)

  /* ---------------------- cosas que Safari NO soporta ------------------- */
  const noSoportado = await page.evaluate(() => ({
    vibrate: 'vibrate' in navigator,
    audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
  }))
  console.log('')
  console.log('--- Lo que Safari no ofrece (para informar, no es un fallo) ---')
  console.log(`  vibracion al terminar el descanso: ${noSoportado.vibrate ? 'disponible' : 'NO disponible en iPhone'}`)
  console.log(`  sonido al terminar el descanso:    ${noSoportado.audioContext ? 'disponible' : 'NO disponible'}`)
} catch (error) {
  check('El recorrido completo termina sin excepciones en Safari', false, String(error).split('\n')[0])
  await page.screenshot({ path: join(shotsDir, 'error-safari.png') }).catch(() => null)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas en Safari`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
