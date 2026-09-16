/*
 * Prueba de la biblioteca de ejercicios: crear uno propio con nombre, descripción y parte
 * del cuerpo, y que quede disponible al apuntar una sesión.
 *
 * Uso:  node scripts/test-exercise-library.mjs [url]
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

const NOMBRE = 'Remo invertido en mesa'
const DESCRIPCION = 'Cuerpo recto, pecho hacia la mesa y codos pegados al torso.'

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))

  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2200)
  if ((await page.locator('text=Bienvenido a').count()) > 0) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(800)
  }
  await page.waitForSelector('.nav', { timeout: 25000 })

  /* --------------------- 1. La pestaña existe y se abre -------------------- */
  console.log('\n--- 1. Biblioteca de ejercicios ---')
  await page.locator('.nav button', { hasText: 'Ejercicios' }).click()
  await page.waitForTimeout(1200)
  const inicial = await page.locator('body').innerText()
  check('Hay una pestaña de Ejercicios', /ejercicios en la biblioteca/i.test(inicial), inicial.match(/\d+ ejercicios en la biblioteca[^\n]*/)?.[0] ?? '')
  check('Ofrece añadir un ejercicio', /Añadir ejercicio/i.test(inicial))
  const totalInicial = Number(/^(\d+) ejercicios/m.exec(inicial)?.[1] ?? 0)
  check('La biblioteca viene con ejercicios', totalInicial > 20, `${totalInicial} ejercicios`)

  /* --------------------------- 2. Crear uno nuevo ------------------------- */
  console.log('\n--- 2. Crear un ejercicio propio ---')
  await page.getByRole('button', { name: /Añadir ejercicio/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  const formulario = await page.locator('.modal').innerText()
  check('El formulario pide el nombre', /Nombre del ejercicio/i.test(formulario))
  check('El formulario pide la descripción', /Descripción/i.test(formulario))
  check('El formulario pide la parte del cuerpo', /Parte del cuerpo/i.test(formulario))
  check('Pide también material y salto de peso', /Material/i.test(formulario) && /Salto de peso/i.test(formulario))

  await page.locator('#ej-nombre').fill(NOMBRE)
  await page.locator('#ej-desc').fill(DESCRIPCION)
  // Parte del cuerpo: Espalda.
  await page.locator('.modal .chip', { hasText: 'Espalda' }).first().click()
  await page.locator('.modal .chip', { hasText: 'Peso corporal' }).first().click()
  await page.screenshot({ path: join(shotsDir, '27-nuevo-ejercicio.png') })
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1500)

  const trasCrear = await page.locator('body').innerText()
  check('El ejercicio queda en la biblioteca', trasCrear.includes(NOMBRE))
  check('Se ve marcado como propio', /mío/i.test(trasCrear))
  check('Se ve la parte del cuerpo elegida', /Espalda · Peso corporal/.test(trasCrear), trasCrear.match(/Espalda · [^\n]*/)?.[0] ?? '')
  check('Se ve la descripción', trasCrear.includes('codos pegados'))
  const totalTras = Number(/^(\d+) ejercicios/m.exec(trasCrear)?.[1] ?? 0)
  check('La biblioteca crece en uno', totalTras === totalInicial + 1, `${totalInicial} -> ${totalTras}`)

  /* ---------------------------- 3. Se puede buscar ------------------------ */
  console.log('\n--- 3. Buscar en la biblioteca ---')
  await page.locator('input[aria-label="Buscar ejercicio"]').first().fill('invertido')
  await page.waitForTimeout(700)
  const buscado = await page.locator('body').innerText()
  check('Se encuentra por el nombre', buscado.includes(NOMBRE))
  await page.locator('input[aria-label="Buscar ejercicio"]').first().fill('codos')
  await page.waitForTimeout(700)
  check('Se encuentra también por la descripción', (await page.locator('body').innerText()).includes(NOMBRE))
  await page.locator('input[aria-label="Buscar ejercicio"]').first().fill('')
  await page.waitForTimeout(600)

  /* ---------------- 4. Disponible al apuntar una sesión ------------------- */
  console.log('\n--- 4. Disponible durante una sesión ---')
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })
  await page.getByText('＋ Añadir ejercicio').click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal input[aria-label="Buscar ejercicio"]').fill('invertido')
  await page.waitForTimeout(800)
  const enSelector = await page.locator('.modal').innerText()
  check('El ejercicio propio aparece en el selector de la sesión', enSelector.includes(NOMBRE))
  check('Y se ve su descripción al elegirlo', enSelector.includes('codos pegados'), enSelector.match(/Cuerpo recto[^\n]*/)?.[0] ?? '')

  await page.locator('.modal .list-item', { hasText: NOMBRE }).first().click()
  await page.waitForTimeout(1200)
  const enSesion = await page.locator('body').innerText()
  check('Se añade a la sesión', enSesion.includes(NOMBRE))
  check('Con su parte del cuerpo correcta', /3 × 8-12 reps/.test(enSesion), enSesion.match(/3 × [^\n]*/)?.[0] ?? '')
  check('Y su descripción a la vista mientras entrenas', enSesion.includes('Cómo se hace'))

  /* ------------------------------ 5. Persiste ---------------------------- */
  console.log('\n--- 5. Sigue ahí tras recargar ---')
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.nav', { timeout: 25000 })
  await page.waitForTimeout(1500)
  await page.locator('.nav button', { hasText: 'Ejercicios' }).click()
  await page.waitForTimeout(1200)
  check('El ejercicio sigue en la biblioteca', (await page.locator('body').innerText()).includes(NOMBRE))

  /* ------------------------------ 6. Editarlo ---------------------------- */
  console.log('\n--- 6. Editar el ejercicio ---')
  await page.locator('input[aria-label="Buscar ejercicio"]').first().fill('invertido')
  await page.waitForTimeout(700)
  await page.locator(`button[aria-label="Editar ${NOMBRE}"]`).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  const cargado = await page.locator('#ej-nombre').inputValue()
  check('El formulario viene relleno con sus datos', cargado === NOMBRE, cargado)
  check('Y con su descripción', (await page.locator('#ej-desc').inputValue()).includes('codos pegados'))

  await page.locator('#ej-nombre').fill(`${NOMBRE} (en casa)`)
  await page.locator('#ej-desc').fill('Igual pero con los pies en una silla.')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1500)
  const trasEditar = await page.locator('body').innerText()
  check('Se guarda el cambio', trasEditar.includes(`${NOMBRE} (en casa)`))
  check('No se duplica el ejercicio', (trasEditar.match(/Remo invertido/g) ?? []).length <= 2, `${(trasEditar.match(/Remo invertido/g) ?? []).length} apariciones`)

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
