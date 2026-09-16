/*
 * Prueba de humo con navegador real (Playwright).
 *
 * No sustituye a las pruebas unitarias: comprueba lo que solo se ve con la app
 * montada, sobre todo el flujo completo de registrar una serie.
 *
 * Uso:  node scripts/smoke.mjs [url]
 * Por defecto usa http://localhost:5273 (el servidor de `npm run preview`).
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const baseUrl = process.argv[2] ?? 'http://localhost:5273'
const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * Volumen que se espera al final del recorrido, calculado a partir de lo que se
 * registra: 50x10 (primera serie) + 52,5x8 (prueba de la coma) + 52,5x8 (repetir).
 * Se calcula en vez de escribirlo a mano, para que anadir una serie no obligue a
 * adivinar el total.
 */
const VOLUMEN_TOTAL = 50 * 10 + 52.5 * 8 + 52.5 * 8

/**
 * Formato espanol de un numero: punto de millares y coma decimal.
 * Se construye a mano porque toLocaleString('es-ES') en Node no pone el separador de
 * millares, y la app SI lo pone: 1340 se muestra como "1.340".
 */
function formatoEspanol(n, decimales = 2) {
  const redondeado = Number(n.toFixed(decimales))
  const [entero, dec] = String(Math.abs(redondeado)).split('.')
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? `,${dec}` : '')
}

/** El volumen tal y como lo muestra la app. */
const VOLUMEN_TEXTO = `${formatoEspanol(VOLUMEN_TOTAL)} kg`
const VOLUMEN_ESPERADO = new RegExp(`(${VOLUMEN_TOTAL}|${formatoEspanol(VOLUMEN_TOTAL)}) kg`)

const browser = await chromium.launch()
const context = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
})
const page = await context.newPage()

const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

async function shot(name) {
  await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true })
}

/**
 * La primera vez que se abre la app sale la pantalla de bienvenida. Se cierra para
 * poder probar el resto. Se comprueba aqui mismo que aparece, porque forma parte
 * de lo que ve alguien que instala la app.
 */
async function pasarBienvenida() {
  const hayBienvenida = (await page.locator('text=Bienvenido a').count()) > 0
  check('La primera vez aparece la bienvenida', hayBienvenida)
  if (hayBienvenida) {
    await shot('00-bienvenida')
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(800)
  }
}

try {
  /* ------------------------- 1. arranque y sembrado ------------------------ */
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  // Se espera a que aparezca la app o la bienvenida (lo que llegue antes).
  await page.waitForTimeout(2500)
  await pasarBienvenida()
  await esperarApp(page, 20000)
  await page.waitForTimeout(600)

  check('La app carga sin errores de JavaScript', errors.length === 0, errors.join(' | '))
  /*
   * La portada es SOLO el entrenamiento del dia. Antes tenia los totales, las ultimas sesiones y
   * el cardio reciente, que ya estan en sus apartados: se quitaron para no tener que bajar por
   * media pantalla para empezar a entrenar.
   */
  const portada = await page.locator('body').innerText()
  check('La portada dice qué día es hoy', /Hoy es (lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i.test(portada), portada.match(/Hoy es [^\n]*/)?.[0] ?? '')
  check(
    'La portada propone el entrenamiento del día',
    /Fuerza [ABC]|no toca entrenar|Elegir rutina y entrenar/i.test(portada),
    portada.match(/(Fuerza [ABC][^\n]*|Hoy no toca entrenar)/)?.[0] ?? '',
  )
  check('Y hay un botón para empezar', await page.getByRole('button', { name: /Empezar/i }).first().isVisible())
  await shot('01-inicio')

  /* --------------------------- 2. rutinas sembradas ----------------------- */
  await page.locator('.nav button', { hasText: 'Rutinas' }).click()
  await page.waitForTimeout(500)
  const routineCards = await page.locator('.card').count()
  check('Hay rutinas sembradas del programa A/B/C', routineCards >= 3, `${routineCards} tarjetas`)
  const bodyText = await page.locator('body').innerText()
  check('Aparece la rutina Fuerza A', bodyText.includes('Fuerza A'))
  check('Aparece la rutina Fuerza B', bodyText.includes('Fuerza B'))
  check('Aparece la rutina Fuerza C', bodyText.includes('Fuerza C'))
  check('Los ejercicios son los del vault (Back squat, Press banca)', bodyText.includes('Back squat') && bodyText.includes('Press banca'))
  await shot('02-rutinas')

  /* ------------------------ 3. empezar una sesión ------------------------- */
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 8000 })
  await shot('03-selector-rutina')

  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForTimeout(900)

  const sessionHeading = await page.locator('.topbar h1').innerText()
  check('La sesión arranca con la rutina elegida', sessionHeading.includes('Fuerza A'), sessionHeading)
  check('Se ve el cronómetro de la sesión', await page.getByText('Terminar y guardar').isVisible())

  const exerciseCards = await page.locator('.exercise-card').count()
  check('Se cargan los ejercicios de la rutina', exerciseCards >= 7, `${exerciseCards} tarjetas de ejercicio`)
  const sessionText = await page.locator('body').innerText()
  check('El primer ejercicio es Back squat', sessionText.indexOf('Back squat') < sessionText.indexOf('Press banca'))
  check('Se avisa de que no hay referencia previa', sessionText.includes('Sin referencia previa'))
  await shot('04-sesion-inicio')

  /* --------------------------- 4. registrar series ------------------------ */
  const firstCard = page.locator('.exercise-card').first()
  const weightInput = firstCard.locator('.set-row .input').nth(0)
  const repsInput = firstCard.locator('.set-row .input').nth(1)
  const saveButton = firstCard.locator('.set-row .icon-btn').last()

  await weightInput.fill('50')
  await repsInput.fill('10')
  await saveButton.click()
  await page.waitForTimeout(700)

  const afterFirst = await page.locator('body').innerText()
  check('La primera serie queda registrada', afterFirst.includes('1 serie'))
  check('Aparece el cronómetro de descanso', await page.locator('.rest-bar').isVisible())
  const restClock = await page.locator('.rest-bar .clock').innerText()
  check('El descanso arranca con la cuenta atrás', /^\d{2}:\d{2}$/.test(restClock), restClock)

  /* ------------- 4b. la coma decimal (regresión de un fallo real) --------- */
  // El campo convertía a número en cada pulsación, así que la coma se perdía y
  // "52,5" acababa siendo "525". Se teclea carácter a carácter para comprobarlo.
  const pesoNuevo = firstCard.locator('input[aria-label="Peso de la nueva serie"]')
  await pesoNuevo.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('52,5')
  const pesoEscrito = await pesoNuevo.inputValue()
  check('Se puede escribir un decimal con coma en el peso', pesoEscrito === '52,5', `quedó "${pesoEscrito}"`)

  const repsNuevo = firstCard.locator('input[aria-label="Repeticiones de la nueva serie"]')
  await repsNuevo.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('8')
  const guardarNueva = firstCard.locator('button[aria-label="Guardar serie"]')
  await guardarNueva.click()
  await page.waitForTimeout(900)
  const conDecimal = await page.locator('body').innerText()
  check('El decimal se guarda correctamente', conDecimal.includes('52,5'), conDecimal.match(/[\d,]+×52,5kg/)?.[0] ?? conDecimal.match(/52,5[^\n]{0,20}/)?.[0] ?? '')

  // Repetir la última serie (el gesto más habitual).
  await firstCard.getByText('Repetir última').click()
  await page.waitForTimeout(700)
  const afterRepeat = await page.locator('body').innerText()
  check('El botón de repetir añade otra serie', /3 series/.test(afterRepeat), afterRepeat.match(/\d+ series/)?.[0] ?? '')

  await shot('05-sesion-con-series')

  /* ------------------------- 5. cronómetro de descanso -------------------- */
  const before = await page.locator('.rest-bar .clock').innerText()
  await page.locator('.rest-bar').getByText('+30s').click()
  await page.waitForTimeout(400)
  const after = await page.locator('.rest-bar .clock').innerText()
  check('El botón +30s alarga el descanso', toSeconds(after) > toSeconds(before), `${before} -> ${after}`)

  /* ---------------------------- 6. progresión ---------------------------- */
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(800)
  const progressText = await page.locator('body').innerText()
  check('Salir a otra pantalla NO cierra la sesión', progressText.includes('Entrenamiento abierto'), progressText.slice(0, 120).replace(/\n/g, ' '))
  check('La progresión muestra el ejercicio trabajado', progressText.includes('Back squat'))
  check('La progresión muestra la tabla de historial', /HISTORIAL/i.test(progressText))
  check('La progresión calcula el 1RM estimado', progressText.includes('1RM'))
  await shot('06-progresion')

  // Volver a la sesión desde el aviso de "en curso".
  await page.getByRole('button', { name: 'Volver' }).click()
  await page.waitForSelector('.exercise-card', { timeout: 8000 })
  const backText = await page.locator('body').innerText()
  check('Se puede volver a la sesión desde el aviso', backText.includes('Back squat') && backText.includes('3 series'))
  await page.getByText('☰').click()
  await page.waitForTimeout(400)

  /* ------------------------------ 7. cardio ------------------------------ */
  await page.locator('.nav button', { hasText: 'Cardio' }).click()
  await page.waitForTimeout(400)
  await page.getByText('Añadir sesión de cardio').click()
  await page.waitForSelector('.modal', { timeout: 8000 })
  await page.getByPlaceholder('1h 23m').fill('1h 50m')
  await page.getByPlaceholder('42,27').fill('42,27')
  await page.getByPlaceholder('190').fill('190')
  await page.waitForTimeout(300)
  const cardioModalText = await page.locator('.modal').innerText()
  check('El cardio calcula el ritmo medio', /min\/km/.test(cardioModalText), cardioModalText.match(/[\d:]+ min\/km/)?.[0] ?? '')
  check('El cardio calcula la velocidad media', /km\/h/.test(cardioModalText))
  await shot('07-cardio-modal')

  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(700)
  const cardioText = await page.locator('body').innerText()
  check('El registro de cardio se guarda', cardioText.includes('Bici') && cardioText.includes('42,27 km'))

  /* ------------- 7b. totales de cardio: exactos y por periodos -------------- */
  // Se piden los totales con la distancia EXACTA (con metros) y el tiempo EXACTO, mas
  // el total de la semana. Antes se redondeaba a kilometros y horas enteras, asi que
  // sumando salidas largas en bici se perdian cientos de metros y decenas de minutos.
  //
  // Para que la comprobacion sea fiable se parten de cero: se borran las entradas de
  // cardio y se dejan tres con valores conocidos, dos de esta semana y una de hace mas
  // de un mes (que no debe contar ni en la semana ni en el mes).
  const hoy = new Date()
  const iso = (diasAtras) => {
    const fecha = new Date(hoy)
    fecha.setDate(fecha.getDate() - diasAtras)
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
  }
  const salidas = [
    { id: 'prueba_1', fecha: iso(0), km: 42.27, minutos: 110 }, // hoy
    { id: 'prueba_2', fecha: iso(1), km: 49.1, minutos: 125 }, // ayer
    { id: 'prueba_3', fecha: iso(40), km: 30.5, minutos: 90 }, // fuera de mes y semana
  ]
  await page.evaluate(async (entradas) => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve) => {
      peticion.onsuccess = () => resolve(peticion.result)
    })
    const almacen = db.transaction('cardio', 'readwrite').objectStore('cardio')
    almacen.clear()
    for (const [indice, entrada] of entradas.entries()) {
      almacen.put({
        id: entrada.id,
        activity: 'Bici',
        date: entrada.fecha,
        durationMin: entrada.minutos,
        distanceKm: entrada.km,
        createdAt: Date.now() + indice,
      })
    }
    await new Promise((resolve) => {
      almacen.transaction.oncomplete = resolve
    })
  }, salidas)

  await page.reload({ waitUntil: 'networkidle' })
  await esperarApp(page)
  await page.locator('.nav button', { hasText: 'Cardio' }).click()
  await page.waitForTimeout(1300)
  const totales = await page.locator('body').innerText()

  // 42,27 + 49,1 + 30,5 = 121,87 km   y   110 + 125 + 90 = 325 min = 5 h 25 min
  const kmPeriodo = (indices) =>
    `${Math.round(indices.reduce((a, i) => a + salidas[i].km, 0) * 100) / 100}`.replace('.', ',') + ' km'
  const minPeriodo = (indices) => indices.reduce((a, i) => a + salidas[i].minutos, 0)

  const filas = await page.evaluate(() =>
    [...document.querySelectorAll('table.data tbody tr')].map((f) => f.innerText.replace(/\s+/g, ' ').trim()),
  )
  const filaSemana = filas.find((f) => /Esta semana/i.test(f)) ?? ''
  const filaMes = filas.find((f) => /Este mes/i.test(f)) ?? ''
  const filaTotal = filas.find((f) => /\bTotal\b/i.test(f)) ?? ''

  console.log(`   semana: ${filaSemana}`)
  console.log(`   mes:    ${filaMes}`)
  console.log(`   total:  ${filaTotal}`)

  check(
    'El total de distancia es exacto, con metros (no redondeado a km)',
    filaTotal.includes('121,87 km'),
    filaTotal,
  )
  check(
    'El total de tiempo es exacto, en horas y minutos',
    filaTotal.includes('5 h 25 min'),
    filaTotal,
  )
  check('Hay total de esta semana', /Esta semana/i.test(totales))
  check('Hay total de este mes', /Este mes/i.test(totales))
  /*
   * OJO con la semana: "ayer" solo esta en la misma semana si hoy no es lunes. Se
   * calcula que salidas caen en la semana actual en lugar de darlo por supuesto; si no,
   * la prueba falla los lunes (que es justo lo que paso la primera vez).
   */
  const lunesDeEstaSemana = (() => {
    const fecha = new Date(hoy)
    fecha.setDate(fecha.getDate() - ((fecha.getDay() + 6) % 7))
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
  })()
  const enEstaSemana = salidas.map((s) => s.fecha >= lunesDeEstaSemana)
  const enEsteMes = salidas.map((s) => s.fecha.slice(0, 7) === salidas[0].fecha.slice(0, 7))

  const indicesDe = (mascara) => mascara.map((dentro, i) => (dentro ? i : -1)).filter((i) => i >= 0)

  check(
    'La semana suma solo las salidas de esta semana',
    filaSemana.includes(kmPeriodo(indicesDe(enEstaSemana))),
    `esperado ${kmPeriodo(indicesDe(enEstaSemana))} (lunes ${lunesDeEstaSemana}) -> ${filaSemana}`,
  )
  check(
    'El mes no incluye la salida de hace 40 días',
    !filaMes.includes('121,87') && filaMes.includes(kmPeriodo(indicesDe(enEsteMes))),
    `esperado ${kmPeriodo(indicesDe(enEsteMes))} -> ${filaMes}`,
  )
  check('El total sí incluye las tres salidas', filaTotal.includes(kmPeriodo([0, 1, 2])), filaTotal)
  check('No se redondea a kilómetros enteros', !/\b122 km\b/.test(totales), totales.match(/\b12\d km\b/)?.[0] ?? '')
  void minPeriodo
  await shot('07b-totales-cardio')

  /*
   * Regresion de un fallo reportado: la portada mostraba 5 km de cardio acumulado mientras la hoja
   * de cardio mostraba 4,5 km, porque en la portada se redondeaba a kilometros enteros. Los
   * totales ya NO estan en la portada (se quitaron al limpiarla), asi que la comprobacion se hace
   * donde viven ahora: en Progresion.
   */
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1500)
  const progreso = await page.locator('body').innerText()

  const kmTotalTexto = kmPeriodo([0, 1, 2]) // "121,87 km"
  check(
    'La hoja de cardio y el resto de la app dan la misma distancia exacta',
    progreso.includes(kmTotalTexto) || progreso.includes(kmTotalTexto.replace(' km', '')),
    `esperado ${kmTotalTexto} -> ${progreso.match(/[\d.,]+ km/g)?.slice(0, 3).join(' / ') ?? '?'}`,
  )
  check(
    'En ningún sitio se redondea a kilómetros enteros',
    !progreso.includes('122 km'),
    progreso.match(/\b12\d km\b/)?.[0] ?? 'no aparece ningún 12X km',
  )
  check(
    'El volumen lleva separador de millares',
    /1\.\d{3} kg|1\.\d{3},\d+ kg/.test(progreso),
    progreso.match(/[\d.,]+ kg/g)?.slice(0, 3).join(' / ') ?? '?',
  )

  // Y se vuelve a la hoja de cardio para dejar la prueba donde estaba.
  await page.locator('.nav button', { hasText: 'Cardio' }).click()
  await page.waitForTimeout(800)

  /* ------------------------------ 8. ajustes ----------------------------- */
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(400)
  const settingsText = await page.locator('body').innerText()
  check('Los ajustes explican dónde viven los datos', settingsText.includes('IndexedDB'))
  check('Hay copia de seguridad en JSON', settingsText.includes('.json'))
  check('Hay exportación a Markdown para el vault', settingsText.includes('Markdown'))
  await shot('08-ajustes')

  /* --------------------- 9. persistencia tras recargar -------------------- */
  // Se recarga directamente: la sesión abierta debe recuperarse sola.
  await page.reload({ waitUntil: 'networkidle' })
  await esperarApp(page, 15000)
  await page.waitForTimeout(900)
  const afterReload = await page.locator('body').innerText()
  check('La sesión en curso sobrevive a recargar', afterReload.includes('Terminar y guardar') && afterReload.includes('3 series'), afterReload.slice(0, 130).replace(/\n/g, ' '))
  check('Tras recargar se vuelve directamente a la sesión', afterReload.includes('Back squat'))
  await shot('09-tras-recargar')

  /* --------------------- 10. terminar y guardar sesión -------------------- */
  await page.getByText('Terminar y guardar').click()
  await page.waitForSelector('.modal', { timeout: 8000 })
  const confirmText = await page.locator('.modal').innerText()
  check('La confirmación resume lo que se va a guardar', /3 series/.test(confirmText) && VOLUMEN_ESPERADO.test(confirmText), confirmText.replace(/\n/g, ' '))
  await page.locator('.modal').getByRole('button', { name: 'Terminar', exact: true }).click()
  await page.waitForTimeout(1400)

  /*
   * Se mira en PROGRESION: la sesion guardada y los totales viven alli. La portada solo propone el
   * entrenamiento del dia, asi que ya no hay que buscar estos datos en ella.
   */
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1800)
  const progresoText = await page.locator('body').innerText()
  check(
    'La sesión guardada aparece en el historial',
    /Sesiones guardadas/i.test(progresoText) && progresoText.includes('Fuerza A') && progresoText.includes('3 series'),
    progresoText.match(/SESIONES GUARDADAS[^\n]*/i)?.[0] ?? 'sin sección de sesiones',
  )
  check(
    'El volumen se refleja en los totales',
    progresoText.includes(VOLUMEN_TEXTO),
    `esperado ${VOLUMEN_TEXTO} -> ${progresoText.match(/[\d.,]+ kg/g)?.slice(0, 4).join(' / ') ?? ''}`,
  )
  await shot('10-inicio-con-historial')

  check('No ha habido errores de JavaScript en todo el recorrido', errors.length === 0, errors.join(' | '))
} catch (error) {
  check('El recorrido completo termina sin excepciones', false, String(error))
  await shot('error')
} finally {
  await browser.close()
}

function toSeconds(clock) {
  const [m, s] = clock.split(':').map(Number)
  return m * 60 + s
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const failure of failed) console.log(`  - ${failure.name}${failure.detail ? `: ${failure.detail}` : ''}`)
  process.exit(1)
}
