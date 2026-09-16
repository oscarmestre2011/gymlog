/*
 * Prueba de la pantalla de bienvenida.
 *
 * No basta con que se vea: tambien se comprueba que lo que promete es verdad
 * (que las rutinas existen, que la coma decimal funciona y que la progresion
 * esta donde dice), para que nadie encuentre una promesa incumplida al segundo
 * de instalar la app.
 *
 * Uso:  node scripts/test-welcome.mjs [url]
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:5273/'
const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
try {
  /* ===================== 1. Primera visita ===================== */
  console.log('--- Primera visita (movil recien instalado) ---\n')
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)

  const bienvenida = await page.locator('body').innerText()
  check('La bienvenida aparece la primera vez', /Bienvenido a Kairós/i.test(bienvenida))
  check('Explica que es y que funciona sin conexión', /sin conexión/i.test(bienvenida))
  check('Dice donde van los datos (su móvil, sin servidor)', /Se guardan solo en tu móvil/i.test(bienvenida) && /No hay servidor/i.test(bienvenida))
  check('Avisa de hacer copia de seguridad', /copia/i.test(bienvenida))
  check('Menciona las rutinas que trae', /Fuerza A, B y C/i.test(bienvenida))
  check('Explica que sugiere subir de peso', /subir de peso/i.test(bienvenida))
  check('Enseña cómo apuntar una serie', /apuntar una serie/i.test(bienvenida) || /peso y repeticiones/i.test(bienvenida))
  check('Menciona la coma decimal', /52,5/.test(bienvenida))
  check('Ofrece empezar ya o dejarlo para luego', /Empezar el entrenamiento de hoy/i.test(bienvenida) && /Ya lo veré luego/i.test(bienvenida))
  check('No aparece la barra de navegación (no distrae)', (await page.locator('.nav').count()) === 0)

  await page.screenshot({ path: join(shotsDir, '22-bienvenida.png'), fullPage: true })

  /* --------------- 2. Que lo que promete sea verdad --------------- */
  console.log('\n--- Comprobando que lo prometido es verdad ---')

  // "Ya viene con rutinas Fuerza A, B y C"
  await page.getByText('Ya lo veré luego').click()
  await page.waitForTimeout(900)
  await page.locator('.nav button', { hasText: 'Rutinas' }).click()
  await page.waitForTimeout(700)
  const rutinas = await page.locator('body').innerText()
  check('Las rutinas Fuerza A, B y C existen de verdad', /Fuerza A/.test(rutinas) && /Fuerza B/.test(rutinas) && /Fuerza C/.test(rutinas))
  check('Y también la de movilidad para casa', /Movilidad/i.test(rutinas))

  // "Escribe peso y repeticiones, admite coma: 52,5"
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 15000 })

  const primera = page.locator('.exercise-card').first()
  const peso = primera.locator('input[aria-label="Peso de la nueva serie"]')
  const reps = primera.locator('input[aria-label="Repeticiones de la nueva serie"]')
  await peso.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('52,5')
  await reps.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('10')
  await page.waitForTimeout(400)
  const pesoEscrito = await peso.inputValue()
  check('La coma decimal funciona como promete la bienvenida', pesoEscrito === '52,5', `quedó "${pesoEscrito}"`)

  // "El cronómetro de descanso arranca solo"
  await primera.locator('button[aria-label="Guardar serie"]').click()
  await page.waitForTimeout(1000)
  check('El cronómetro de descanso arranca solo, como promete', await page.locator('.rest-bar').isVisible())

  // "La sesión queda en Progresión"
  await page.getByText('Terminar y guardar').click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal').getByRole('button', { name: 'Terminar', exact: true }).click()
  await page.waitForTimeout(1600)
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(900)
  const progreso = await page.locator('body').innerText()
  check('La sesión aparece en Progresión, como promete', /Back squat/.test(progreso) && /Historial/i.test(progreso))

  /* ---------------- 3. No vuelve a salir la bienvenida ------------ */
  console.log('\n--- Segunda visita (ya la ha visto) ---')
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await esperarApp(page, 20000)
  await page.waitForTimeout(1200)
  const segundaVisita = await page.locator('body').innerText()
  check('La bienvenida NO vuelve a aparecer', !/Bienvenido a Kairós/i.test(segundaVisita))
  check('Se entra directamente a la app', segundaVisita.includes('Hoy es'))
  /*
   * Los datos guardados se comprueban en PROGRESION: la portada solo propone el entrenamiento del
   * dia, asi que el historial no esta ahi. Se navega, que es lo que haria el usuario.
   */
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1500)
  const progresoTrasRecargar = await page.locator('body').innerText()
  check('Los datos guardados siguen ahí', /Back squat|Fuerza A/.test(progresoTrasRecargar), progresoTrasRecargar.match(/SESIONES GUARDADAS[\s\S]{0,60}/i)?.[0]?.replace(/\n/g, ' ') ?? 'sin sección')

  await context.close()

  /* -------- 4. Si hay una sesión a medias, no interrumpe --------- */
  console.log('\n--- Con una sesión a medias y la bienvenida sin ver ---')
  const context2 = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page2 = await context2.newPage()
  await page2.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page2.waitForTimeout(2000)
  // Se descarta la bienvenida, se empieza una sesión y se borra la marca de "vista".
  await page2.getByText('Ya lo veré luego').click()
  await page2.waitForTimeout(800)
  await page2.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page2.waitForSelector('.modal', { timeout: 15000 })
  await page2.locator('.modal .list-item', { hasText: 'Fuerza C' }).first().click()
  await page2.waitForSelector('.exercise-card', { timeout: 15000 })
  await page2.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve) => {
      peticion.onsuccess = () => resolve(peticion.result)
    })
    const guardar = db.transaction('settings', 'readwrite').objectStore('settings')
    const actual = await new Promise((resolve) => {
      const p = guardar.get('app')
      p.onsuccess = () => resolve(p.result)
    })
    guardar.put({ ...actual, hasSeenWelcome: false })
  })
  await page2.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await esperarApp(page2, 20000)
  await page2.waitForTimeout(1500)
  const conSesion = await page2.locator('body').innerText()
  check(
    'Con una sesión a medias NO interrumpe con la bienvenida',
    !/Bienvenido a Kairós/i.test(conSesion) && /Terminar y guardar/.test(conSesion),
    conSesion.slice(0, 90).replace(/\n/g, ' '),
  )
  await context2.close()
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
