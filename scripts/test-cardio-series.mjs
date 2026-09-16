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
  /*
   * La plantilla por defecto son CUATRO tramos: calentamiento, serie, recuperacion y vuelta a la
   * calma. Antes se proponian 14 y el deportista tenia que borrar la mitad antes de empezar.
   */
  check('Propone tramos para no empezar de cero', /Tramos \(\d+\)/.test(conSeries), conSeries.match(/Tramos \(\d+\)/)?.[0] ?? '')
  const tramos = await page.locator('.modal .tramo').count()
  check('La plantilla por defecto son CUATRO tramos', tramos === 4, `${tramos} tramos`)
  const textosTramos = await page.evaluate(() =>
    [...document.querySelectorAll('.modal .tramo')].map((t) => {
      const activo = [...t.querySelectorAll('.chip')].find((c) => c.classList.contains('active'))
      return activo?.textContent?.trim() ?? '?'
    }),
  )
  check(
    'Con la estructura pedida: calentamiento, serie, recuperación y vuelta',
    textosTramos.join(',') === 'Suave,Fuerte,Rec,Suave',
    textosTramos.join(', '),
  )
  check('Cada tramo tiene sus minutos y sus kilómetros', (await page.locator('.modal .tramo-fila').count()) === tramos)
  check('Y sus botones de intensidad', (await page.locator('.modal .tramo .chip').count()) === tramos * 5)
  check('Se pueden apuntar por tiempo, metros o km', /Por tiempo/i.test(conSeries) && /Por metros/i.test(conSeries) && /Por km/i.test(conSeries))
  check('Ofrece añadir más series', /\+ Serie/i.test(conSeries))
  check('Muestra el total sumado', /Total:/i.test(conSeries), conSeries.match(/Total:[^\n]*/)?.[0] ?? '')
  await page.screenshot({ path: join(shotsDir, '48-cardio-series.png'), fullPage: true })

  /* ----------------- 3. Apuntar un entrenamiento de series -------------- */
  console.log('\n--- 3. Apuntar el entrenamiento y guardarlo ---')
  // Se ajusta la serie (tramo 2) a 6 minutos y su recuperacion (tramo 3) a 3.
  await page.locator('.modal .tramo').nth(1).locator('input').first().fill('6')
  await page.waitForTimeout(400)
  await page.locator('.modal .tramo').nth(2).locator('input').first().fill('3')
  await page.waitForTimeout(500)

  const conDatos = await page.locator('.modal').innerText()
  /*
   * La plantilla base son 20 minutos (10 + 3 + 2 + 5). Al pasar la serie a 6 y la recuperacion a 3,
   * el total tiene que subir a 24: eso demuestra que se recalcula de verdad con los tramos.
   */
  check(
    'El total se recalcula al cambiar un tramo',
    /Total:\s*24m/.test(conDatos),
    conDatos.match(/Total:[^\n]*/)?.[0] ?? 'sin total',
  )
  check('Cuenta las series fuertes', /series fuertes/i.test(conDatos), conDatos.match(/\d+ series fuertes/)?.[0] ?? '')

  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1800)

  const lista = await page.locator('body').innerText()
  check('El entrenamiento queda en la lista', /series/i.test(lista), lista.match(/[^\n]*series[^\n]*/i)?.[0] ?? '')
  check('Con su resumen de series y tramos', /1 serie · 4 tramos|\d+ tramos/i.test(lista), lista.match(/\d+ series?[^\n]*/)?.[0] ?? '')

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
  check('Cuenta bien los tramos fuertes', (guardado?.fuertes ?? 0) === 1, `${guardado?.fuertes} fuertes`)
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

  /*
   * El fartlek tiene la MISMA plantilla base de cuatro tramos (a peticion del usuario: es mas
   * comodo empezar con cuatro y añadir), lo que cambia es como se llaman los tramos y que se
   * apuntan los cambios de ritmo que salgan.
   */
  const tramosFartlek = await page.locator('.modal .tramo').count()
  check('El fartlek tambien empieza con cuatro tramos', tramosFartlek === 4, `${tramosFartlek} tramos`)

  // El atajo "+ Serie" anade una serie con su recuperacion, ANTES de la vuelta a la calma.
  await page.locator('.modal').getByRole('button', { name: /\+ Serie/i }).click()
  await page.waitForTimeout(600)
  const trasAnadir = await page.locator('.modal .tramo').count()
  check('El atajo "+ Serie" añade una serie con su recuperación', trasAnadir === tramosFartlek + 2, `${tramosFartlek} -> ${trasAnadir} tramos`)
  const ordenTrasAnadir = await page.evaluate(() =>
    [...document.querySelectorAll('.modal .tramo')].map((t) => {
      const activo = [...t.querySelectorAll('.chip')].find((c) => c.classList.contains('active'))
      return activo?.textContent?.trim() ?? '?'
    }),
  )
  check(
    'Y la añade antes de la vuelta a la calma',
    ordenTrasAnadir[ordenTrasAnadir.length - 1] === 'Suave' && ordenTrasAnadir[ordenTrasAnadir.length - 2] === 'Rec',
    ordenTrasAnadir.join(', '),
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

  /* ---------------- 7. Apuntar una serie en METROS (pista) ---------------- */
  console.log('\n--- 7. Series en metros, para pista ---')
  await abrirFormulario(page)
  await page.locator('.modal .chip', { hasText: /^Carrera$/ }).click()
  await page.locator('.modal .chip', { hasText: /^Series$/ }).click()
  await page.waitForTimeout(700)
  await page.locator('.modal .chip', { hasText: /Por metros/i }).click()
  await page.waitForTimeout(600)

  const enMetros = await page.locator('.modal').innerText()
  check('Se puede elegir apuntar en metros', /Series cortas de pista/i.test(enMetros))

  // La serie (tramo 2) a 400 metros.
  const campoSerie = page.locator('.modal .tramo').nth(1).locator('input').first()
  const etiqueta = await campoSerie.getAttribute('aria-label')
  check('El campo pide metros, no minutos', /Metros del tramo 2/i.test(etiqueta ?? ''), etiqueta ?? '')
  await campoSerie.fill('400')
  await page.waitForTimeout(500)
  const conMetros = await page.locator('.modal').innerText()
  check('Y el total se muestra en metros', /400 m/.test(conMetros), conMetros.match(/Total:[^\n]*/)?.[0] ?? '')

  await page.locator('.modal').getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1800)

  const guardadoMetros = await page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve) => {
      peticion.onsuccess = () => resolve(peticion.result)
    })
    const entradas = await new Promise((resolve) => {
      const p = db.transaction('cardio', 'readonly').objectStore('cardio').getAll()
      p.onsuccess = () => resolve(p.result ?? [])
    })
    db.close()
    // El ultimo apuntado.
    const ultima = entradas.sort((a, b) => b.createdAt - a.createdAt)[0]
    return {
      unidad: ultima?.unidadTramos,
      // 400 metros tienen que quedar guardados como 0,4 km, para que los totales sumen bien.
      kmPrimerTramo: ultima?.segmentos?.[1]?.distanceKm,
      kmTotales: ultima?.distanceKm,
    }
  })
  check('La unidad se guarda con el entrenamiento', guardadoMetros.unidad === 'metros', guardadoMetros.unidad ?? '')
  check(
    'Los 400 m se guardan como 0,4 km (para que los totales sumen bien)',
    guardadoMetros.kmPrimerTramo === 0.4,
    `${guardadoMetros.kmPrimerTramo} km`,
  )

  // Y al volver a abrirlo, sigue en metros.
  await page.locator('.card', { hasText: 'Carrera' }).first().getByRole('button', { name: 'Editar' }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.waitForTimeout(700)
  const reabierto = await page.locator('.modal').innerText()
  const chipMetros = await page.locator('.modal .chip', { hasText: /Por metros/i }).first().getAttribute('class')
  check('Al reeditarlo sigue en metros', /active/.test(chipMetros ?? ''), `clase: ${chipMetros}`)
  check('Y el valor sigue siendo 400', /400/.test(reabierto), reabierto.match(/400/)?.[0] ?? '')
  await page.locator('.modal').getByRole('button', { name: 'Cancelar' }).click()
  await page.waitForTimeout(500)

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
