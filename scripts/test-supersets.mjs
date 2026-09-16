/*
 * Prueba de las superseries.
 *
 * Lo esencial que comprueba: que se puedan crear en el editor, que la sesion las muestre
 * agrupadas con sus etiquetas, y sobre todo EL DESCANSO: corto al pasar de un ejercicio al
 * siguiente dentro de la ronda y completo al acabar la ronda.
 *
 * Uso:  node scripts/test-supersets.mjs [url]
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

/** Lee el reloj del cronometro y su etiqueta. */
async function leerCronometro(page) {
  const visible = await page.locator('.rest-bar').count()
  if (!visible) return { segundos: null, etiqueta: '' }
  const reloj = await page.locator('.rest-bar .clock').innerText()
  const etiqueta = await page.locator('.rest-bar .rest-label').count()
    ? await page.locator('.rest-bar .rest-label').innerText()
    : ''
  const [m, s] = reloj.split(':').map(Number)
  return { segundos: m * 60 + s, etiqueta }
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

  /* ---------------------- 1. Crear una superserie ------------------------ */
  console.log('\n--- 1. Crear una superserie en el editor ---')
  await page.locator('.nav button', { hasText: 'Rutinas' }).click()
  await page.waitForTimeout(900)
  await page.locator('.card.routine-card', { hasText: 'Fuerza A' }).first().getByRole('button', { name: /Editar/ }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.waitForTimeout(600)

  const antesDeAgrupar = await page.locator('.modal').innerText()
  check('El editor ofrece enlazar ejercicios', /Enlazar con el siguiente/i.test(antesDeAgrupar))
  check('Aún no hay ninguna superserie', !/Superserie A/i.test(antesDeAgrupar))

  // Se enlazan los dos primeros ejercicios (Back squat + Press banca).
  await page.getByRole('button', { name: /Enlazar con el siguiente/i }).first().click()
  await page.waitForTimeout(700)
  const trasAgrupar = await page.locator('.modal').innerText()
  check('Aparece la superserie con su letra', /Superserie A/i.test(trasAgrupar), trasAgrupar.match(/Superserie A[^\n]*/)?.[0] ?? '')
  check('Los ejercicios se etiquetan A1 y A2', /A1\./.test(trasAgrupar) && /A2\./.test(trasAgrupar))
  check('Explica cómo funciona el descanso', /entre ejercicios/i.test(trasAgrupar) && /al acabar la ronda/i.test(trasAgrupar))
  check('Se puede separar la superserie', /Separar la superserie/i.test(trasAgrupar))
  await page.screenshot({ path: join(shotsDir, '32-superserie-editor.png') })

  // Se pone un descanso corto entre ejercicios (5 s) para poder probarlo sin esperar.
  await page.getByRole('button', { name: '5 s', exact: true }).click()
  await page.waitForTimeout(500)
  // Y un descanso de ronda de 20 s, para que la prueba sea rápida.
  /*
   * El descanso de ronda se pone en 45 s (el mas corto de los disponibles): dentro de una
   * tarjeta de la superserie, el descanso es "al acabar la ronda", no el de transicion.
   * OJO: las opciones de ronda empiezan en 45 s, no hay 5 ni 20.
   */
  const tarjetaGrupo = page.locator('.modal .card.inside-superset').first()
  await tarjetaGrupo.getByRole('button', { name: '45 s', exact: true }).click()
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: 'Guardar rutina' }).click()
  await page.waitForTimeout(1500)
  const rutinas = await page.locator('body').innerText()
  // En la tarjeta de la rutina no se detalla la superserie; lo que importa es que al
  // empezar la sesion aparezca agrupada, que se comprueba mas abajo.
  check('La rutina se guarda', /Fuerza A/.test(rutinas), rutinas.match(/Fuerza A[^\n]*/)?.[0] ?? '')

  /* ------------------- 2. La sesión la muestra agrupada ------------------ */
  console.log('\n--- 2. La sesión muestra la superserie ---')
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 15000 })

  const sesion = await page.locator('body').innerText()
  check('La sesión agrupa la superserie', /Superserie A/i.test(sesion), sesion.match(/Superserie A[^\n]*/)?.[0] ?? '')
  check('Los dos ejercicios llevan su etiqueta', /A1/.test(sesion) && /A2/.test(sesion))
  const enBloque = await page.locator('.superset-block .exercise-card').count()
  check('Los ejercicios de la superserie van juntos en pantalla', enBloque >= 2, `${enBloque} tarjetas dentro del bloque`)
  await page.screenshot({ path: join(shotsDir, '33-superserie-sesion.png') })

  /* ------------------- 3. El descanso: corto y largo -------------------- */
  console.log('\n--- 3. El descanso según la ronda ---')

  /** Apunta una serie del ejercicio indicado (por su posición en la lista). */
  const apuntar = async (indice) => {
    const tarjeta = page.locator('.exercise-card').nth(indice)
    await tarjeta.locator('input[aria-label="Peso de la nueva serie"]').fill('50')
    await tarjeta.locator('input[aria-label="Repeticiones de la nueva serie"]').fill('10')
    await tarjeta.locator('button[aria-label="Guardar serie"]').click()
    await page.waitForTimeout(1200)
  }

  // Primera serie del primer ejercicio: toca pasar al siguiente → descanso corto.
  await apuntar(0)
  const primerDescanso = await leerCronometro(page)
  check(
    'Tras el primer ejercicio, descanso CORTO (va el siguiente)',
    primerDescanso.etiqueta === 'Siguiente ejercicio',
    `etiqueta: "${primerDescanso.etiqueta}", ${primerDescanso.segundos} s`,
  )
  check(
    'El descanso corto usa la transición configurada (5 s), no el de 15 por defecto',
    (primerDescanso.segundos ?? 99) <= 7,
    `${primerDescanso.segundos} s (si fueran 15 s, no se estaría aplicando lo configurado)`,
  )

  // Serie del segundo ejercicio: la ronda ha terminado → descanso completo.
  await apuntar(1)
  const segundoDescanso = await leerCronometro(page)
  check(
    'Tras el segundo ejercicio, descanso COMPLETO (fin de ronda)',
    segundoDescanso.etiqueta === 'Fin de ronda',
    `etiqueta: "${segundoDescanso.etiqueta}", ${segundoDescanso.segundos} s`,
  )
  check(
    'El descanso de ronda es más largo que el de transición',
    (segundoDescanso.segundos ?? 0) > (primerDescanso.segundos ?? 0),
    `${primerDescanso.segundos} s vs ${segundoDescanso.segundos} s`,
  )

  // Segunda ronda: vuelve a empezar, así que otra vez corto.
  await apuntar(0)
  const terceraRonda = await leerCronometro(page)
  check(
    'La segunda ronda vuelve a descansar corto',
    terceraRonda.etiqueta === 'Siguiente ejercicio',
    `etiqueta: "${terceraRonda.etiqueta}"`,
  )

  /* -------------------- 4. Un ejercicio suelto no cambia ----------------- */
  console.log('\n--- 4. Un ejercicio suelto sigue igual ---')
  // El tercer ejercicio de Fuerza A va suelto (Press militar).
  const suelto = page.locator('.exercise-card').nth(2)
  await suelto.locator('input[aria-label="Peso de la nueva serie"]').fill('15')
  await suelto.locator('input[aria-label="Repeticiones de la nueva serie"]').fill('10')
  await suelto.locator('button[aria-label="Guardar serie"]').click()
  await page.waitForTimeout(1300)
  const descansoSuelto = await leerCronometro(page)
  check(
    'Un ejercicio suelto descansa lo suyo, sin etiqueta',
    descansoSuelto.etiqueta === '',
    `etiqueta: "${descansoSuelto.etiqueta}", ${descansoSuelto.segundos} s`,
  )

  /* ------------------ 5. La superserie sobrevive a recargar -------------- */
  console.log('\n--- 5. Sigue ahí tras recargar la sesión ---')
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForSelector('.nav', { timeout: 25000 })
  await page.waitForTimeout(1800)
  const trasRecargar = await page.locator('body').innerText()
  check('La superserie sigue en la sesión tras recargar', /Superserie A/i.test(trasRecargar), trasRecargar.match(/Superserie A[^\n]*/)?.[0] ?? '')
  check('Y los ejercicios siguen etiquetados', /A1/.test(trasRecargar) && /A2/.test(trasRecargar))

  // Y el descanso sigue calculándose bien: hay que igualar la ronda para acabar.
  await page.getByText('Terminar y guardar').click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.getByRole('button', { name: 'Cancelar' }).click()
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
