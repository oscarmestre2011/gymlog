/*
 * Prueba de la planificacion por dias.
 *
 * Lo que se comprueba: que se puedan elegir los dias de una rutina, que Inicio proponga el
 * entrenamiento que toca HOY (y que lo diga cuando no toca nada), y que el resumen de la semana
 * avise de los huecos. Antes los dias estaban escritos en el codigo y no se podian cambiar.
 *
 * Uso:  node scripts/test-planificacion.mjs [url]
 */
import { chromium, devices } from 'playwright'
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

/** Cambia los dias de una rutina directamente en la base de datos. */
async function ponerDias(page, nombre, dias) {
  await page.evaluate(
    async ({ nombre, dias }) => {
      const peticion = indexedDB.open('gymlog')
      const db = await new Promise((resolve) => {
        peticion.onsuccess = () => resolve(peticion.result)
      })
      const rutinas = db.transaction('routines', 'readwrite').objectStore('routines')
      const todas = await new Promise((resolve) => {
        const p = rutinas.getAll()
        p.onsuccess = () => resolve(p.result ?? [])
      })
      const objetivo = todas.find((r) => r.name.includes(nombre))
      if (!objetivo) return
      await new Promise((resolve) => {
        const p = rutinas.put({ ...objetivo, weekdays: dias, weekday: 'Cualquier día' })
        p.onsuccess = () => resolve()
      })
    },
    { nombre, dias },
  )
}

/**
 * Quita los dias de TODAS las rutinas: deja la semana entera vacia.
 *
 * Hace falta para poder probar el caso "hoy no toca entrenar". Mover una sola rutina no basta: en
 * este guion, para cuando se llega ahi, Fuerza A ya esta puesta en el dia de hoy por una
 * comprobacion anterior, asi que sigue tocando entrenar y la app hace lo correcto. La prueba se
 * estaba enganyando a si misma (paso el jueves 17-09-2026).
 */
async function vaciarSemana(page) {
  await page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve) => {
      peticion.onsuccess = () => resolve(peticion.result)
    })
    const rutinas = db.transaction('routines', 'readwrite').objectStore('routines')
    const todas = await new Promise((resolve) => {
      const p = rutinas.getAll()
      p.onsuccess = () => resolve(p.result ?? [])
    })
    for (const rutina of todas) {
      await new Promise((resolve) => {
        const p = rutinas.put({ ...rutina, weekdays: [], weekday: 'Cualquier día' })
        p.onsuccess = () => resolve()
      })
    }
  })
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))

  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2200)
  if (await page.locator('text=Bienvenido a').count()) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(800)
  }
  await page.waitForSelector('.nav', { timeout: 25000 })

  const hoy = await page.evaluate(() => new Date().getDay())

  /* ------------------- 1. Las rutinas vienen con sus días ----------------- */
  console.log('\n--- 1. Los días vienen puestos ---')
  await page.locator('.nav button', { hasText: 'Rutinas' }).click()
  await page.waitForTimeout(1400)
  const rutinas = await page.locator('body').innerText()
  check('Hay un resumen de la semana', /Tu semana/i.test(rutinas))
  check('Se ve qué toca cada día', /Lun[\s\S]{0,80}Fuerza A/i.test(rutinas), rutinas.match(/TU SEMANA[\s\S]{0,120}/i)?.[0]?.replace(/\n/g, ' ') ?? '')
  check('Los ejercicios de ejemplo tienen días asignados', /Lunes|Miércoles|Viernes/i.test(rutinas))
  await page.screenshot({ path: join(shotsDir, '45-plan-semana.png'), fullPage: true })

  /* -------------------- 2. Se pueden cambiar los días -------------------- */
  console.log('\n--- 2. Cambiar los días de una rutina ---')
  const tarjetaA = page.locator('.card.routine-card', { hasText: 'Fuerza A' }).first()
  await tarjetaA.getByRole('button', { name: /Editar/ }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  const editor = await page.locator('.modal').innerText()
  check('El editor deja elegir los días', /¿Qué días toca\?/i.test(editor))
  check('Con los siete días de la semana', ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].every((d) => editor.includes(d)))
  check('Y explica que puede ser más de uno', /varios días/i.test(editor))

  // Se marca el JUEVES (que no estaba) y se quita el LUNES.
  await page.locator('.modal .chip', { hasText: /^Jue$/ }).click()
  await page.locator('.modal .chip', { hasText: /^Lun$/ }).click()
  await page.waitForTimeout(500)
  const trasMarcar = await page.locator('.modal').innerText()
  /*
   * El editor no escribe la lista de dias elegidos en texto (se ve en los botones, marcados en
   * verde), asi que lo que se comprueba es que los dos chips han cambiado de estado.
   */
  const marcados = await page.locator('.modal .chip.active').allInnerTexts()
  check(
    'El editor refleja los días elegidos',
    marcados.includes('Jue') && !marcados.includes('Lun'),
    `marcados: ${marcados.join(', ')}`,
  )

  await page.getByRole('button', { name: 'Guardar rutina' }).click()
  await page.waitForTimeout(1600)
  const planTrasCambio = await page.locator('body').innerText()
  check('El plan de la semana refleja el cambio', /Jue[\s\S]{0,60}Fuerza A/i.test(planTrasCambio), planTrasCambio.match(/TU SEMANA[\s\S]{0,140}/i)?.[0]?.replace(/\n/g, ' ') ?? '')
  check('Y avisa del día que se ha quedado sin nada', /El lunes tienes 0|sin rutinas|—/i.test(planTrasCambio))

  /* ------------- 3. Inicio propone el entrenamiento de hoy -------------- */
  console.log('\n--- 3. Inicio propone el entrenamiento de hoy ---')
  // Se deja "Fuerza B" programada para HOY y el resto en otros días.
  await ponerDias(page, 'Fuerza B', [hoy])
  await ponerDias(page, 'Fuerza C', [(hoy + 2) % 7])

  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(1500)
  const inicio = await page.locator('body').innerText()
  check('Inicio dice qué día es', /Hoy es/i.test(inicio), inicio.match(/Hoy es [^\n]*/)?.[0] ?? '')
  check('Y propone el entrenamiento que toca hoy', /Fuerza B/i.test(inicio), inicio.match(/Hoy es [\s\S]{0,80}/)?.[0]?.replace(/\n/g, ' ') ?? '')
  check('Con sus ejercicios a la vista', /ejercicios/i.test(inicio))
  check('Y un botón para empezarlo', /Empezar/i.test(inicio))
  await page.screenshot({ path: join(shotsDir, '46-inicio-del-dia.png'), fullPage: true })

  /* ---------------- 4. Un día sin nada programado --------------------- */
  console.log('\n--- 4. Un día sin entrenamiento programado ---')
  /*
   * Se vacia la semana ENTERA, no solo una rutina: si queda cualquier otra programada para hoy, la
   * app debe proponerla (y hace bien), asi que el caso no se estaria probando de verdad.
   */
  await vaciarSemana(page)
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(800)
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(1500)
  const sinNada = await page.locator('body').innerText()
  check(
    'Si hoy no toca, lo dice claramente',
    /Hoy no toca entrenar/i.test(sinNada),
    sinNada.match(/Hoy no toca[^\n]*/)?.[0] ?? 'no lo dice',
  )
  check('Y ofrece entrenar igualmente', /Elegir rutina y entrenar/i.test(sinNada))
  check(
    'NO propone una rutina cualquiera',
    !/Fuerza [ABC]/i.test(sinNada),
    sinNada.match(/Fuerza [ABC][^\n]*/)?.[0] ?? 'no propone ninguna (correcto)',
  )

  /* ------------- 5. Y se puede empezar la que toque mañana ------------ */
  console.log('\n--- 5. Empezar una rutina que no toca hoy ---')
  // A Fuerza B se le da manana, para que hoy no toque pero si aparezca como opcion.
  await ponerDias(page, 'Fuerza B', [(hoy + 1) % 7])
  await page.locator('.nav button', { hasText: 'Rutinas' }).click()
  await page.waitForTimeout(600)
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza B' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })
  check('Se puede entrenar aunque hoy no toque', (await page.locator('.exercise-card').count()) > 0, `${await page.locator('.exercise-card').count()} ejercicios`)

  check('Sin errores de JavaScript en todo el recorrido', errores.length === 0, errores.join(' | '))
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
