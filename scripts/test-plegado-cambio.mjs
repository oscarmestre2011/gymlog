/*
 * Prueba de las dos mejoras de la sesion:
 *   1. plegar los ejercicios ya hechos (para no tener que bajar por toda la sesion);
 *   2. sustituir un ejercicio por otro en mitad del entrenamiento.
 *
 * Lo mas importante que se comprueba del cambio de ejercicio: que NO se pierda nada de lo
 * apuntado. Las series del ejercicio anterior se quedan, con su nombre, y las nuevas se marcan
 * con "Cambiado desde X" para que despues se entienda.
 *
 * Uso:  node scripts/test-plegado-cambio.mjs [url]
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

  /* ------------------------ Empezar una sesión --------------------------- */
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })

  const tarjetas = page.locator('.exercise-card')
  const cuantas = await tarjetas.count()
  check('La sesión tiene varios ejercicios', cuantas >= 3, `${cuantas} ejercicios`)

  /* ------------------------- 1. Plegar y desplegar ------------------------ */
  console.log('\n--- 1. Plegar un ejercicio ya hecho ---')
  const primera = tarjetas.first()
  const nombrePrimera = (await primera.locator('.name').innerText()).replace(/\n/g, ' ')

  check('Al empezar, el ejercicio está abierto', (await primera.locator('.exercise-body').isVisible()))
  check('Se puede plegar', (await primera.getByRole('button', { name: /^Cerrar/ }).count()) > 0)

  await primera.getByRole('button', { name: /^Cerrar/ }).click()
  await page.waitForTimeout(600)
  check('Al plegarlo, el cuerpo se oculta', !(await primera.locator('.exercise-body').isVisible()))
  check('Y se ve un resumen en su lugar', (await primera.locator('.exercise-plegado').count()) > 0, (await primera.locator('.exercise-plegado').innerText()).trim())
  check('El nombre sigue a la vista', (await primera.locator('.name').innerText()).includes(nombrePrimera.split(' ')[0]))
  await page.screenshot({ path: join(shotsDir, '38-ejercicio-plegado.png') })

  await primera.getByRole('button', { name: /^Abrir/ }).click()
  await page.waitForTimeout(600)
  check('Se puede volver a abrir', await primera.locator('.exercise-body').isVisible())

  /* --------------- 2. Se pliega solo al terminar las series -------------- */
  console.log('\n--- 2. Se pliega sola al terminar ---')
  const objetivo = await primera.locator('.target').innerText()
  const seriesObjetivo = Number(/hechas \d+\/(\d+)/.exec(objetivo)?.[1] ?? /(\d+) ×/.exec(objetivo)?.[1] ?? 3)
  console.log(`   hay que apuntar ${seriesObjetivo} series para terminarlo`)

  for (let i = 0; i < seriesObjetivo; i += 1) {
    /*
     * OJO: el aria-label "Peso de la nueva serie" lo lleva tambien la fila de serie ya guardada,
     * asi que hay que quedarse con la ULTIMA (la de apuntar). Con un selector sin acotar se
     * rellenaban dos filas a la vez y se apuntaban el doble de series.
     */
    await primera.locator('input[aria-label="Peso de la nueva serie"]').last().fill('50')
    await primera.locator('input[aria-label="Repeticiones de la nueva serie"]').last().fill('10')
    await primera.locator('button[aria-label="Guardar serie"]').last().click()
    await page.waitForTimeout(900)
  }

  check(
    'Al completar las series, el ejercicio se pliega solo',
    !(await primera.locator('.exercise-body').isVisible()),
    'así no hay que bajar por toda la sesión',
  )
  check('El resumen dice cuántas series se han hecho', /Hechas \d+\/\d+/.test(await primera.locator('.exercise-plegado').innerText()), (await primera.locator('.exercise-plegado').innerText()).trim())
  check('Marca que está terminado', (await primera.locator('.badge.live').count()) > 0)

  // Y se puede abrir otra vez para apuntar una serie de más.
  await primera.getByRole('button', { name: /^Abrir/ }).click()
  await page.waitForTimeout(500)
  check('Aun terminado, se puede abrir para apuntar más', await primera.locator('.exercise-body').isVisible())

  /* ------------------- 3. Sustituir un ejercicio ------------------------- */
  console.log('\n--- 3. Sustituir un ejercicio a mitad del entrenamiento ---')
  const segunda = tarjetas.nth(1)
  const nombreViejo = (await segunda.locator('.name').innerText()).replace(/\n/g, ' ').trim()

  // Una serie apuntada antes de cambiarlo: no se puede perder.
  await segunda.locator('input[aria-label="Peso de la nueva serie"]').last().fill('45')
  await segunda.locator('input[aria-label="Repeticiones de la nueva serie"]').last().fill('8')
  await segunda.locator('button[aria-label="Guardar serie"]').last().click()
  await page.waitForTimeout(1000)
  // Se cuentan las filas YA GUARDADAS: la fila de apuntar tambien lleva la clase .set-row.
  const seriesAntes = await segunda.locator('.set-row.done').count()
  check('El ejercicio tiene una serie apuntada antes de cambiarlo', seriesAntes === 1, `${seriesAntes} series`)

  await segunda.getByRole('button', { name: /^Cambiar .* por otro/ }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  const modal = await page.locator('.modal').innerText()
  check('Se abre el selector para cambiar', /Cambiar/i.test(modal) && /en su lugar/i.test(modal), modal.split('\n').slice(0, 2).join(' · '))
  check('Explica que se está cambiando ese ejercicio', modal.includes(nombreViejo.split(' ')[0]))

  /*
   * Se comprueba que NO se puede elegir un ejercicio que ya esta en la sesion: dejaria dos
   * tarjetas iguales. Antes si se podia y la sesion acababa con el ejercicio repetido (se
   * descubrio con una prueba).
   */
  await page.locator('.modal input[aria-label="Buscar ejercicio"]').fill('remo')
  await page.waitForTimeout(800)
  const repetido = page.locator('.modal .list-item', { hasText: 'Remo con barra' }).first()
  check(
    'Los ejercicios que ya están en la sesión salen marcados y sin poder elegir',
    (await repetido.isDisabled()) || /ya en la sesión/i.test(await repetido.innerText()),
    (await repetido.innerText()).split('\n').slice(0, 2).join(' · '),
  )

  // Se elige otro ejercicio distinto.
  const opcion = page.locator('.modal .list-item:not([disabled])').first()
  const nombreNuevo = (await opcion.innerText()).split('\n')[0].replace('mío', '').trim()
  await opcion.click()
  await page.waitForTimeout(1800)

  const trasCambio = await page.locator('body').innerText()
  check('El ejercicio queda sustituido', trasCambio.includes(nombreNuevo), `${nombreViejo} → ${nombreNuevo}`)
  check('Avisa de lo que ha pasado con las series', /se quedan en el historial|series apuntadas/i.test(trasCambio), trasCambio.match(/[^\n]*→[^\n]*/)?.[0] ?? '')

  // Lo importante: las series anteriores NO se han perdido.
  const seriesDespues = await tarjetas.nth(1).locator('.set-row.done').count()
  check(
    'NO se ha perdido la serie apuntada antes del cambio',
    seriesDespues >= 1,
    `${seriesAntes} antes, ${seriesDespues} después`,
  )
  const cuerpoTrasCambio = await tarjetas.nth(1).innerText()
  check(
    'La serie conserva el nombre del ejercicio que se estaba haciendo',
    cuerpoTrasCambio.includes(nombreViejo.split(' ')[0]),
    cuerpoTrasCambio.split('\n').slice(0, 3).join(' | '),
  )
  check(
    'Y se marca de dónde viene',
    /Cambiado desde/i.test(cuerpoTrasCambio),
    cuerpoTrasCambio.match(/Cambiado desde[^\n·]*/)?.[0] ?? 'sin marca',
  )
  await page.screenshot({ path: join(shotsDir, '39-ejercicio-cambiado.png') })

  /* -------------------- 4. Se puede seguir apuntando ------------------- */
  console.log('\n--- 4. Se puede seguir entrenando ---')
  await tarjetas.nth(1).locator('input[aria-label="Peso de la nueva serie"]').last().fill('40')
  await tarjetas.nth(1).locator('input[aria-label="Repeticiones de la nueva serie"]').last().fill('12')
  await tarjetas.nth(1).locator('button[aria-label="Guardar serie"]').last().click()
  await page.waitForTimeout(1200)
  const seriesFinal = await tarjetas.nth(1).locator('.set-row.done').count()
  check('Se pueden apuntar series del ejercicio nuevo', seriesFinal > seriesDespues, `${seriesDespues} → ${seriesFinal}`)

  /* ------------------- 5. Todo sigue ahí tras recargar ----------------- */
  console.log('\n--- 5. Sigue tras recargar la app ---')
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.nav', { timeout: 25000 })
  await page.waitForTimeout(2000)
  const trasRecargar = await page.locator('body').innerText()
  check('El ejercicio cambiado sigue en la sesión', trasRecargar.includes(nombreNuevo))
  /*
   * Se comparan los TITULOS de los ejercicios, no el texto entero: la marca "Cambiado desde X"
   * menciona el ejercicio anterior a proposito, asi que buscarlo en toda la pantalla daria un
   * falso positivo.
   */
  const titulos = await page.locator('.exercise-card .name').allInnerTexts()
  const titulosLimios = titulos.map((n) => n.replace(/\s+/g, ' ').trim())
  check(
    'Y no ha vuelto como ejercicio de la sesión',
    !titulosLimios.some((n) => n === nombreViejo),
    titulosLimios.join(' | '),
  )
  const seriesTrasRecargar = await page.locator('.exercise-card').nth(1).locator('.set-row.done').count()
  check('Las series siguen ahí', seriesTrasRecargar === seriesFinal, `${seriesTrasRecargar} series`)

  // Ningun ejercicio dos veces: era el fallo que dejaba la sesion con tarjetas repetidas.
  const todosLosTitulos = (await page.locator('.exercise-card .name').allInnerTexts()).map((n) =>
    n.replace(/\s+/g, ' ').trim(),
  )
  const repetidos = todosLosTitulos.filter((n, i) => todosLosTitulos.indexOf(n) !== i)
  check(
    'No hay ningún ejercicio repetido en la sesión',
    repetidos.length === 0,
    repetidos.length ? [...new Set(repetidos)].join(', ') : `${todosLosTitulos.length} ejercicios distintos`,
  )

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
