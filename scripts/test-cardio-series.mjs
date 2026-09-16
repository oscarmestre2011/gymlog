/*
 * Prueba de los entrenamientos de cardio por series y fartlek.
 *
 * Antes solo se podia apuntar un bloque continuo (duracion y distancia). Ahora se pueden apuntar
 * series (tramos fuertes con recuperaciones) y fartlek (cambios de ritmo), tramo a tramo.
 *
 * Lo importante que se comprueba: que los TRAMOS se guarden, que los totales salgan de su suma (y
 * no de un total suelto que podria contradecirlos) y que lo de antes (continuo) siga funcionando
 * igual.
 *
 * Uso:  node scripts/test-cardio-series.mjs [url]
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

/** Abre el formulario de nuevo cardio. */
async function abrirFormulario(page) {
  await page.locator('.nav button', { hasText: 'Cardio' }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Nuevo cardio|Añadir cardio|＋/ }).first().click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.waitForTimeout(500)
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

  /* --------------------- 1. El tipo de entrenamiento -------------------- */
  console.log('\n--- 1. Se puede elegir series o fartlek ---')
  let abierto = true
  try {
    await abrirFormulario(page)
  } catch {
    abierto = false
  }
  check('Se abre el formulario de cardio', abierto)
  const formulario = await page.locator('.modal').innerText()
  check('Ofrece elegir el tipo', /Tipo de entrenamiento/i.test(formulario))
  check('Con continuo, series y fartlek', /Continuo/i.test(formulario) && /Series/i.test(formulario) && /Fartlek/i.test(formulario))
  check('Por defecto es continuo', /Un solo bloque al mismo ritmo/i.test(formulario))
  check('Y sigue pidiendo duración y distancia', /Duración/i.test(formulario) && /Distancia/i.test(formulario))

  /* ----------------------- 2. Series: plantilla ------------------------ */
  console.log('\n--- 2. Elegir "Series" propone una estructura ---')
  await page.locator('.modal .chip', { hasText: /^Series$/ }).click()
  await page.waitForTimeout(700)
  const conSeries = await page.locator('.modal').innerText()
  check('Explica qué son las series', /recuperaciones entre ellos/i.test(conSeries))
  check('Propone tramos para no empezar de cero', /Tramos \(\d+\)/.test(conSeries), conSeries.match(/Tramos \(\d+\)/)?.[0] ?? '')
  const tramos = await page.locator('.modal .tramo').count()
  check('Con calentamiento, series y vuelta a la calma', tramos >= 10, `${tramos} tramos`)
  check('Cada tramo tiene sus minutos y sus kilómetros', (await page.locator('.modal .tramo-fila').count()) === tramos)
  check('Y sus botones de intensidad', (await page.locator('.modal .tramo .chip').count()) === tramos * 5)
  check('Muestra el total sumado', /Total:/i.test(conSeries), conSeries.match(/Total:[^\n]*/)?.[0] ?? '')
  await page.screenshot({ path: join(shotsDir, '48-cardio-series.png'), fullPage: true })

  /* ----------------- 3. Apuntar un entrenamiento de series -------------- */
  console.log('\n--- 3. Apuntar el entrenamiento y guardarlo ---')
  // Se ajusta el primer tramo y se apunta una distancia en el segundo.
  const primerTramo = page.locator('.modal .tramo').first()
  await primerTramo.locator('input').first().fill('12')
  await page.waitForTimeout(400)
  const segundoTramo = page.locator('.modal .tramo').nth(1)
  await segundoTramo.locator('input').nth(1).fill('1,2')
  await page.waitForTimeout(500)

  const conDatos = await page.locator('.modal').innerText()
  /*
   * La plantilla de 6 series son 45 minutos (10 + 6x(3+2) + 5). Al cambiar el primer tramo de 10 a
   * 12, el total tiene que subir a 47: eso demuestra que se recalcula de verdad con los tramos.
   */
  check(
    'El total se recalcula al cambiar un tramo',
    /Total:\s*47m/.test(conDatos),
    conDatos.match(/Total:[^\n]*/)?.[0] ?? 'sin total',
  )
  check('Cuenta las series fuertes', /series fuertes/i.test(conDatos), conDatos.match(/\d+ series fuertes/)?.[0] ?? '')

  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1800)

  const lista = await page.locator('body').innerText()
  check('El entrenamiento queda en la lista', /series/i.test(lista), lista.match(/[^\n]*series[^\n]*/i)?.[0] ?? '')
  check('Con su resumen de series y tramos', /\d+ series · \d+ tramos|\d+ tramos/i.test(lista), lista.match(/\d+ series[^\n]*/)?.[0] ?? '')

  /* ------------------- 4. Los tramos se guardan de verdad --------------- */
  console.log('\n--- 4. Los tramos quedan guardados ---')
  const guardado = await page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve) => {
      peticion.onsuccess = () => resolve(peticion.result)
    })
    const entradas = await new Promise((resolve) => {
      const p = db.transaction('cardio', 'readonly').objectStore('cardio').getAll()
      p.onsuccess = () => resolve(p.result ?? [])
    })
    db.close()
    const conTramos = entradas.find((e) => (e.segmentos?.length ?? 0) > 0)
    if (!conTramos) return null
    return {
      tipo: conTramos.tipo,
      tramos: conTramos.segmentos.length,
      fuertes: conTramos.segmentos.filter((s) => s.intensidad === 'fuerte' || s.intensidad === 'maximo').length,
      minutosTramos: conTramos.segmentos.reduce((n, s) => n + (s.durationMin ?? 0), 0),
      minutosGuardados: conTramos.durationMin,
      kmTramos: conTramos.segmentos.reduce((n, s) => n + (s.distanceKm ?? 0), 0),
      totales: entradas.length,
    }
  })
  check('Se guardan los tramos en la base de datos', guardado !== null && guardado.tramos > 0, JSON.stringify(guardado))
  check('Con su tipo (series)', guardado?.tipo === 'series', guardado?.tipo ?? '')
  check('Cuenta bien los tramos fuertes', (guardado?.fuertes ?? 0) === 6, `${guardado?.fuertes} fuertes`)
  check(
    'El total guardado coincide con la suma de los tramos',
    Math.abs((guardado?.minutosGuardados ?? 0) - (guardado?.minutosTramos ?? -1)) < 0.01,
    `guardado ${guardado?.minutosGuardados} / suma ${guardado?.minutosTramos}`,
  )

  /* --------------------------- 5. Fartlek ---------------------------- */
  console.log('\n--- 5. Un fartlek ---')
  await abrirFormulario(page)
  await page.locator('.modal .chip', { hasText: /^Fartlek$/ }).click()
  await page.waitForTimeout(700)
  const conFartlek = await page.locator('.modal').innerText()
  check('Explica qué es un fartlek', /cambios de ritmo/i.test(conFartlek))
  check('Propone tramos alternos', /Tramos \(\d+\)/.test(conFartlek), conFartlek.match(/Tramos \(\d+\)/)?.[0] ?? '')

  const tiposDeTramo = await page.evaluate(() =>
    [...document.querySelectorAll('.modal .tramo')].map((t) => {
      const activo = [...t.querySelectorAll('.chip')].find((c) => c.classList.contains('active'))
      return activo?.textContent?.trim() ?? '?'
    }),
  )
  check(
    'Los tramos no son todos iguales (eso es un fartlek)',
    new Set(tiposDeTramo).size > 2,
    tiposDeTramo.join(', '),
  )

  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1600)
  check('El fartlek queda guardado', /fartlek/i.test(await page.locator('body').innerText()))

  /* ------------- 6. El cardio continuo sigue funcionando igual ---------- */
  console.log('\n--- 6. El continuo sigue igual ---')
  await abrirFormulario(page)
  const continuo = await page.locator('.modal').innerText()
  check('En continuo hay duración y distancia, sin tramos', /Duración/i.test(continuo) && !/Tramos \(/i.test(continuo))
  await page.locator('input[aria-label="Distancia en kilómetros"]').fill('25')
  await page.locator('#c-duration').fill('1h 10m')
  await page.locator('.modal').getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1800)
  const trasContinuo = await page.locator('body').innerText()
  check('El continuo se guarda como siempre', /25 km/.test(trasContinuo), trasContinuo.match(/[^\n]*25 km[^\n]*/)?.[0] ?? '')
  check('Y no se le pone etiqueta de series', !/· series ·/.test(trasContinuo))

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
