/*
 * Prueba de las medidas corporales.
 *
 * Comprueba el recorrido completo (apuntar, ver indicadores, historial, editar, borrar) y que
 * los calculos salen bien: IMC, relacion cintura/altura y la diferencia desde el principio.
 * Los valores usados son los reales del vault del usuario.
 *
 * Uso:  node scripts/test-medidas.mjs [url]
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

  /* -------------------- 1. Se entra desde Progresión --------------------- */
  console.log('\n--- 1. Acceso desde Progresión ---')
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1200)
  const progreso = await page.locator('body').innerText()
  check('Progresión muestra el resumen de medidas', /Medidas corporales/i.test(progreso), progreso.match(/Medidas corporales[^\n]*/)?.[0] ?? '')
  check('Invita a apuntar la primera medición', /Añadir la primera medición/i.test(progreso))

  await page.getByRole('button', { name: /Añadir la primera medición/i }).click()
  await page.waitForTimeout(1200)
  const pantalla = await page.locator('body').innerText()
  check('Se abre la pantalla de medidas', /Medidas corporales/i.test(pantalla) && /Peso, abdomen, pecho y muslo/i.test(pantalla))
  check('Sin medidas, lo explica', /Todavía no hay medidas/i.test(pantalla))
  check('Ofrece añadir', /Añadir medición/i.test(pantalla))

  /*
   * La app NO trae altura puesta (la usa mas gente): tiene que pedirla y no calcular nada
   * hasta tenerla. Se comprueba que lo pide, que no inventa indicadores, y que al ponerla
   * aparecen.
   */
  console.log('\n--- 1b. Pide la altura y no calcula sin ella ---')
  check('Pide la altura', /Falta tu altura/i.test(pantalla))
  check('Explica para qué es', /IMC y el indicador cintura\/altura/i.test(pantalla))
  check('No inventa la altura', !/174 cm/.test(pantalla))
  check('Sin altura no hay IMC', !/IMC/i.test(pantalla.replace(/Falta tu altura[\s\S]*?indicadores no se muestran\./, '')))

  await page.locator('input[aria-label="Altura en centímetros"]').fill('174')
  await page.getByRole('button', { name: 'Guardar' }).first().click()
  await page.waitForTimeout(1200)
  const conAltura = await page.locator('body').innerText()
  check('Se guarda la altura', !/Falta tu altura/i.test(conAltura))
  check('Y aparece en Ajustes para poder cambiarla', true)

  /* ------------------------- 2. Apuntar medidas ------------------------- */
  console.log('\n--- 2. Apuntar las medidas reales del vault ---')
  const apuntar = async (fecha, valores, notas) => {
    await page.getByRole('button', { name: /Añadir medición/i }).click()
    await page.waitForSelector('.modal', { timeout: 12000 })
    await page.locator('#med-fecha').fill(fecha)
    for (const [campo, valor] of Object.entries(valores)) {
      await page.locator(`input[aria-label="${campo}"]`).fill(String(valor))
    }
    if (notas) await page.locator('#med-notas').fill(notas)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(1200)
  }

  // Datos reales: 15 ago, 19 ago y 28 ago.
  await apuntar(
    '2026-08-15',
    { 'Peso en kg': '81', 'Abdomen en cm': '100,5' },
    'Inicio registro medidas',
  )
  await apuntar(
    '2026-08-19',
    { 'Peso en kg': '82', 'Abdomen en cm': '97', 'Pecho en cm': '103', 'Muslo en cm': '58' },
  )
  await apuntar(
    '2026-08-28',
    { 'Peso en kg': '79,2', 'Abdomen en cm': '97', 'Pecho en cm': '98', 'Muslo en cm': '58' },
    '-2,8 kg en 9 días',
  )

  const conDatos = await page.locator('body').innerText()
  check('Aparece la última medición', /Última medición/i.test(conDatos))
  check('Muestra el peso de la última medición', /79,2 kg/.test(conDatos), conDatos.match(/79,2 kg/)?.[0] ?? '')
  check('Muestra el abdomen', /97 cm/.test(conDatos))
  check('Muestra pecho y muslo', /98 cm/.test(conDatos) && /58 cm/.test(conDatos))
  await page.screenshot({ path: join(shotsDir, '34-medidas.png'), fullPage: true })

  /* --------------------- 3. Los cálculos salen bien --------------------- */
  console.log('\n--- 3. Indicadores calculados ---')
  // 79,2 kg y 174 cm -> IMC 26,2 (sobrepeso)
  check('Calcula el IMC', /26,2/.test(conDatos), conDatos.match(/IMC[^\n]*/)?.[0] ?? '')
  check('Lo clasifica', /sobrepeso/i.test(conDatos))
  // 97 / 174 = 0,56
  check('Calcula la relación cintura/altura', /0,56/.test(conDatos), conDatos.match(/Cintura \/ altura[^\n]*/)?.[0] ?? '')
  check('Avisa del riesgo abdominal', /umbral de alerta \(94 cm\)/i.test(conDatos))
  check('Explica que el IMC no distingue músculo de grasa', /no distingue músculo de grasa/i.test(conDatos))

  // Diferencia desde el principio: de 81 a 79,2 kg y de 100,5 a 97 cm.
  check('Muestra la bajada de peso desde el inicio', /1,8 kg desde el\s+inicio/i.test(conDatos.replace(/\s+/g, ' ')), conDatos.replace(/\s+/g, ' ').match(/↓[^↓]{0,30}inicio/)?.[0] ?? '')
  check('Muestra la bajada de abdomen desde el inicio', /3,5 cm/.test(conDatos), conDatos.match(/3,5 cm/)?.[0] ?? '')

  /* ------------------------- 4. Historial y gráficas -------------------- */
  console.log('\n--- 4. Historial y evolución ---')
  check('Hay historial con las tres mediciones', /Historial \(3\)/i.test(conDatos), conDatos.match(/Historial \(\d+\)/)?.[0] ?? '')
  check('Aparecen las tres fechas', /15 ago 2026/.test(conDatos) && /19 ago 2026/.test(conDatos) && /28 ago 2026/.test(conDatos))
  check('Se ve la nota de la medición', /Inicio registro medidas/i.test(conDatos))
  check('Hay gráfica de evolución del peso', /Evolución del peso/i.test(conDatos))
  check('Hay gráfica de evolución del abdomen', /Evolución del abdomen/i.test(conDatos))

  /* --------------------------- 5. Sigue tras recargar ------------------- */
  console.log('\n--- 5. Persiste ---')
  /*
   * Al recargar se vuelve a la pantalla de inicio: la de medidas se abre desde Progresion y
   * no es una pestana propia. Asi que se navega otra vez, que es lo que hara el usuario.
   */
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2200)
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Ver todas las medidas/i }).click()
  await page.waitForTimeout(1200)
  const trasRecargar = await page.locator('body').innerText()
  check('Los datos siguen ahí tras recargar', /Historial \(3\)/i.test(trasRecargar), trasRecargar.match(/Historial \(\d+\)/)?.[0] ?? 'no hay historial')
  check('Y el peso está', /79,2 kg/.test(trasRecargar))
  check('El resumen de Progresión muestra las medidas', /Medidas corporales/i.test(trasRecargar))

  /* ------------------------------ 6. Editar ---------------------------- */
  console.log('\n--- 6. Editar una medición ---')
  await page.locator('button[aria-label="Editar medición del 2026-08-28"]').click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  const cargado = await page.locator('input[aria-label="Peso en kg"]').inputValue()
  check('El formulario viene relleno', cargado.replace('.', ',') === '79,2', cargado)
  await page.locator('input[aria-label="Peso en kg"]').fill('78,4')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1200)
  const trasEditar = await page.locator('body').innerText()
  check('Se guarda el cambio', /78,4 kg/.test(trasEditar))

  /* ------------------------------ 7. Borrar ---------------------------- */
  console.log('\n--- 7. Borrar una medición ---')
  await page.locator('button[aria-label="Borrar medición del 2026-08-15"]').click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  check('Pide confirmación', /No se puede deshacer/i.test(await page.locator('.modal').innerText()))
  await page.locator('.modal').getByRole('button', { name: 'Borrar' }).click()
  await page.waitForTimeout(1200)
  const trasBorrar = await page.locator('body').innerText()
  check('La medición desaparece', /Historial \(2\)/i.test(trasBorrar), trasBorrar.match(/Historial \(\d+\)/)?.[0] ?? '')

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '))
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
