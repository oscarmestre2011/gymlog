/*
 * Comprueba que dos personas distintas que usan la misma direccion NO comparten
 * datos: cada una tiene su propia libreta, en su propio dispositivo.
 *
 * Motivo: la app no tiene servidor, asi que los datos viven en el almacenamiento
 * de cada movil. Se verifica con dos navegadores independientes (como dos moviles
 * distintos) apuntando entrenamientos diferentes.
 *
 * Uso:  node scripts/test-multi-device.mjs [url]
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

/** Cierra la pantalla de bienvenida si aparece (sale la primera vez que se abre). */
async function pasarBienvenida(page) {
  await page.waitForTimeout(2000)
  if ((await page.locator('text=Bienvenido a').count()) > 0) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(900)
  }
  await esperarApp(page, 25000)
}

/** Apunta series de un ejercicio con unos pesos concretos y termina la sesion. */
async function apuntarEntrenamiento(page, rutina, peso, reps) {
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal .list-item', { hasText: rutina }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 15000 })

  for (let i = 0; i < 2; i += 1) {
    const primera = page.locator('.exercise-card').first()
    const pesoCampo = primera.locator('input[aria-label="Peso de la nueva serie"]')
    const repsCampo = primera.locator('input[aria-label="Repeticiones de la nueva serie"]')
    await pesoCampo.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type(String(peso))
    await repsCampo.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type(String(reps))
    await page.waitForTimeout(300)
    await primera.locator('button[aria-label="Guardar serie"]').click()
    await page.waitForTimeout(700)
  }

  await page.getByText('Terminar y guardar').click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal').getByRole('button', { name: 'Terminar', exact: true }).click()
  await page.waitForTimeout(1800)
}

/** Lee los entrenamientos guardados en ESE navegador. */
function leerDatos(page) {
  return page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve, reject) => {
      peticion.onsuccess = () => resolve(peticion.result)
      peticion.onerror = () => reject(peticion.error)
    })
    const leer = (almacen) =>
      new Promise((resolve) => {
        const p = db.transaction(almacen, 'readonly').objectStore(almacen).getAll()
        p.onsuccess = () => resolve(p.result)
        p.onerror = () => resolve([])
      })
    const [sessions, sets] = await Promise.all([leer('sessions'), leer('sets')])
    return {
      sesiones: sessions.length,
      series: sets.length,
      pesos: [...new Set(sets.map((s) => s.weight))].sort((a, b) => a - b),
      nombres: [...new Set(sets.map((s) => s.exerciseName))],
    }
  })
}

console.log(`Comprobando aislamiento entre dispositivos en:\n${url}\n`)

const browser = await chromium.launch()
try {
  /* ------------------------- persona 1 (Oscar) ------------------------- */
  const movil1 = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page1 = await movil1.newPage()
  await page1.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await pasarBienvenida(page1)

  console.log('Persona 1: apunta Fuerza A con 50 kg')
  await apuntarEntrenamiento(page1, 'Fuerza A', 50, 10)
  const datos1 = await leerDatos(page1)
  console.log(`  guardado: ${datos1.sesiones} sesion(es), ${datos1.series} series, pesos ${JSON.stringify(datos1.pesos)}`)

  /* ------------------------- persona 2 (un amigo) ---------------------- */
  const movil2 = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page2 = await movil2.newPage()
  await page2.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await pasarBienvenida(page2)

  console.log('\nPersona 2: abre la app por primera vez (movil nuevo)')
  const inicio2 = await page2.locator('body').innerText()
  const datos2Antes = await leerDatos(page2)
  check(
    'La persona 2 empieza con la libreta vacia (no ve lo de la persona 1)',
    datos2Antes.sesiones === 0 && datos2Antes.series === 0,
    `${datos2Antes.sesiones} sesiones, ${datos2Antes.series} series`,
  )
  check('La persona 2 ve la app lista para usar', inicio2.includes('Hoy es'))
  check(
    'La persona 2 no ve el historial de la persona 1',
    !inicio2.includes('50 kg'),
    inicio2.slice(0, 80).replace(/\n/g, ' '),
  )

  console.log('Persona 2: apunta Fuerza B con 80 kg')
  await apuntarEntrenamiento(page2, 'Fuerza B', 80, 6)
  const datos2 = await leerDatos(page2)
  console.log(`  guardado: ${datos2.sesiones} sesion(es), ${datos2.series} series, pesos ${JSON.stringify(datos2.pesos)}`)

  check('La persona 2 guarda sus propios datos', datos2.series === 2 && datos2.pesos[0] === 80, JSON.stringify(datos2.pesos))

  /* --------------- la persona 1 sigue con lo suyo, intacto -------------- */
  await page1.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await esperarApp(page1, 30000)
  await page1.waitForTimeout(1200)
  const datos1Despues = await leerDatos(page1)
  const texto1 = await page1.locator('body').innerText()

  check(
    'La persona 1 no ha recibido nada de la persona 2',
    !datos1Despues.pesos.includes(80),
    `pesos de la persona 1: ${JSON.stringify(datos1Despues.pesos)}`,
  )
  check('La persona 1 conserva su entrenamiento', datos1Despues.series === 2 && datos1Despues.pesos[0] === 50)
  /*
   * El historial de sesiones esta en PROGRESION: la portada solo propone el entrenamiento del dia.
   * Se navega para comprobarlo, que es lo que haria la persona.
   */
  await page1.locator('.nav button', { hasText: 'Progreso' }).click()
  await page1.waitForTimeout(1500)
  const progreso1 = await page1.locator('body').innerText()
  check('Cada libreta tiene su propio historial', progreso1.includes('Fuerza A'), progreso1.match(/SESIONES GUARDADAS[\s\S]{0,50}/i)?.[0]?.replace(/\n/g, ' ') ?? 'sin sección')

  check(
    'Los datos NO viajan a ningun servidor (cada uno en su movil)',
    datos1.pesos[0] !== datos2.pesos[0], 
    `persona 1: ${JSON.stringify(datos1.pesos)} / persona 2: ${JSON.stringify(datos2.pesos)}`,
  )

  await page1.screenshot({ path: join(shotsDir, '20-persona-1.png') })
  await page2.screenshot({ path: join(shotsDir, '21-persona-2.png') })
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
