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

/** Acepta "1340" y "1.340" (el formato español lleva punto de millares). */
const VOLUMEN_ESPERADO = new RegExp(
  `(${VOLUMEN_TOTAL}|${VOLUMEN_TOTAL.toLocaleString('es-ES')}) kg`,
)

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
  const hayBienvenida = (await page.locator('text=Bienvenido a GymLog').count()) > 0
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
  check('Aparece el botón de empezar', await page.getByText('Empezar entrenamiento').isVisible())
  const streak = await page.locator('.stat').count()
  check('Se muestran las estadísticas de la portada', streak >= 4, `${streak} tarjetas`)
  await shot('01-inicio')

  /* --------------------------- 2. rutinas sembradas ----------------------- */
  await page.getByRole('button', { name: /Rutinas/ }).click()
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
  await page.getByRole('button', { name: /Inicio/ }).click()
  await page.waitForTimeout(300)
  await page.getByText('Empezar entrenamiento').click()
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
  await page.getByRole('button', { name: /Progreso/ }).click()
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
  await page.getByRole('button', { name: /Cardio/ }).click()
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

  /* ------------------------------ 8. ajustes ----------------------------- */
  await page.getByRole('button', { name: /Ajustes/ }).click()
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

  const homeText = await page.locator('body').innerText()
  check('La sesión guardada aparece en el historial', homeText.includes('Fuerza A') && homeText.includes('3 series'))
  check('El volumen se refleja en las estadísticas', VOLUMEN_ESPERADO.test(homeText), homeText.match(/[\d.,]+ kg/g)?.slice(0, 4).join(' / ') ?? '')
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
