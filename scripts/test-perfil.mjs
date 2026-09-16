/*
 * Prueba del perfil del deportista.
 *
 * Comprueba que los datos se pueden rellenar, que la edad se calcula sola desde la fecha de
 * nacimiento (dato que caduca: por eso no se guarda como numero), que el peso se coge de las
 * medidas corporales sin pedirlo dos veces, y que los calculos aparecen.
 *
 * Uso:  node scripts/test-perfil.mjs [url]
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

  /* ------------- 0. Se apunta un peso en las medidas (de donde sale) -------- */
  console.log('--- 0. Preparando: peso en las medidas corporales ---')
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /Añadir la primera medición|Ver todas las medidas/ }).click()
  await page.waitForTimeout(1200)
  if (await page.locator('input[aria-label="Altura en centímetros"]').count()) {
    await page.locator('input[aria-label="Altura en centímetros"]').fill('174')
    await page.getByRole('button', { name: 'Guardar' }).first().click()
    await page.waitForTimeout(1000)
  }
  await page.getByRole('button', { name: /Añadir medición/ }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('#med-fecha').fill('2026-09-04')
  await page.locator('input[aria-label="Peso en kg"]').fill('78,4')
  await page.locator('input[aria-label="Abdomen en cm"]').fill('96')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1200)
  check('Hay un peso apuntado en las medidas', /78,4 kg/.test(await page.locator('body').innerText()))

  /* --------------------- 1. Acceso desde Progresión ---------------------- */
  console.log('\n--- 1. El resumen del perfil en Progresión ---')
  await page.getByRole('button', { name: 'Volver' }).first().click()
  await page.waitForTimeout(1000)
  const progreso = await page.locator('body').innerText()
  check('Progresión muestra el resumen del perfil', /Perfil del deportista/i.test(progreso))
  check('Invita a completarlo', /Completar mi perfil|Ver mi perfil/i.test(progreso))

  await page.getByRole('button', { name: /Completar mi perfil|Ver mi perfil/ }).click()
  await page.waitForTimeout(1200)
  const perfil = await page.locator('body').innerText()
  check('Se abre la pantalla del perfil', /Perfil del deportista/i.test(perfil) && /Tus datos/i.test(perfil))

  /* ------------------------- 2. Rellenar los datos ---------------------- */
  console.log('\n--- 2. Rellenar los datos del perfil ---')
  check('Pide la altura', /Altura \(cm\)/i.test(perfil))
  check('Pide la fecha de nacimiento', /Fecha de nacimiento/i.test(perfil))
  check('Pide el sexo', /Sexo/i.test(perfil))
  check('Pide cuánto se mueve', /Cuánto te mueves al día/i.test(perfil))
  check('Ofrece el porcentaje de grasa como opcional', /Porcentaje de grasa \(opcional\)/i.test(perfil))

  await page.locator('input[aria-label="Tu altura en centímetros"]').fill('174')
  await page.locator('#perfil-nacimiento').fill('1975-06-15')
  await page.getByRole('button', { name: 'Hombre' }).click()
  await page.getByRole('button', { name: 'Moderado' }).click()
  await page.waitForTimeout(1500)

  const conDatos = await page.locator('body').innerText()
  check('Calcula la edad sola desde la fecha', /5\d\s*años|\b5\d\b/.test(conDatos), conDatos.match(/Se calcula la edad[^\n]*|\d+ años/)?.[0] ?? '')
  check('Muestra el peso cogido de las medidas', /78,4 kg/.test(conDatos), conDatos.match(/78,4 kg/)?.[0] ?? '')
  check('Calcula el IMC', /25,\d/.test(conDatos), conDatos.match(/25,\d/)?.[0] ?? '')
  check('Estima las kcal del día', /kcal al día/i.test(conDatos), conDatos.match(/[\d.,]+\s*kcal al día/)?.[0] ?? '')
  check('Da el rango de proteína', /Proteína al día/i.test(conDatos), conDatos.match(/Proteína al día[^\n]*/)?.[0] ?? '')
  check('Dice de qué fecha es el peso usado', /peso del/i.test(conDatos))
  await page.screenshot({ path: join(shotsDir, '40-perfil.png'), fullPage: true })

  /* ------------------- 3. Explica cómo se calcula ----------------------- */
  console.log('\n--- 3. Explica los cálculos ---')
  /*
   * La explicacion ya viene desplegada al abrir. Para probar el boton se pliega y se vuelve a
   * desplegar: se comprueba que funciona en los dos sentidos.
   */
  await page.getByRole('button', { name: /cómo se calcula/i }).click()
  await page.waitForTimeout(600)
  const plegado = await page.locator('body').innerText()
  check('El botón pliega la explicación', /Ver cómo se calcula/i.test(plegado) && !/Mifflin-St Jeor/i.test(plegado))

  await page.getByRole('button', { name: /cómo se calcula/i }).click()
  await page.waitForTimeout(600)
  const detalle = await page.locator('body').innerText()
  check('Explica la fórmula del gasto en reposo', /Mifflin-St Jeor/i.test(detalle))
  check('Explica el factor de actividad', /multiplicado por/i.test(detalle))
  check('Explica el rango de proteína', /1,6 y 2,2 g por kilo/i.test(detalle))
  check('Avisa de que no es un diagnóstico médico', /no un diagnóstico médico/i.test(detalle))
  check('Avisa de que el IMC no distingue músculo de grasa', /no distingue músculo de grasa/i.test(detalle))

  /* ------------- 4. Con porcentaje de grasa cambia la fórmula ----------- */
  console.log('\n--- 4. Con porcentaje de grasa usa la fórmula mejor ---')
  const kcalAntes = await page.locator('.kv', { hasText: 'En reposo' }).innerText()
  await page.locator('input[aria-label="Porcentaje de grasa corporal"]').fill('22')
  await page.waitForTimeout(1500)
  const kcalDespues = await page.locator('.kv', { hasText: 'En reposo' }).innerText()
  check('Al indicar la grasa, cambia el cálculo', kcalAntes !== kcalDespues, `${kcalAntes.replace(/\n/g, ' ')} → ${kcalDespues.replace(/\n/g, ' ')}`)
  check('Y explica que ahora usa Katch-McArdle', /Katch-McArdle/i.test(await page.locator('body').innerText()))

  /* ---------------------- 5. Los datos persisten ----------------------- */
  console.log('\n--- 5. Los datos se guardan ---')
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2200)
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1200)
  const trasRecargar = await page.locator('body').innerText()
  check('Tras recargar, el perfil sigue con datos', /\d+\s*años|IMC|kcal al día/i.test(trasRecargar), trasRecargar.match(/(\d+)\s*años/)?.[0] ?? '')

  /* ------------------- 6. Y en Ajustes hay acceso -------------------- */
  console.log('\n--- 6. Acceso desde Ajustes ---')
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(1200)
  const ajustes = await page.locator('body').innerText()
  check('Ajustes remite al perfil del deportista', /Perfil del deportista/i.test(ajustes))
  check('Y explica de dónde sale el peso', /peso se coge de las medidas/i.test(ajustes))

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
