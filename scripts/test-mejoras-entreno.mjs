/*
 * Prueba de las mejoras nuevas:
 *   1. Ayuda / FAQ, con busqueda y respuestas que se despliegan.
 *   2. Volumen por grupo muscular (equilibrio).
 *   3. Aviso de mejora en cada serie ("mejor que la ultima vez").
 *   4. Fuerza y cardio juntos, y compartir la copia desde Inicio.
 *
 * Uso:  node scripts/test-mejoras-entreno.mjs [url]
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

/** Apunta una serie en la tarjeta indicada (la ultima fila de apuntar). */
async function apuntar(page, tarjeta, peso, reps) {
  await tarjeta.locator('input[aria-label="Peso de la nueva serie"]').last().fill(String(peso))
  await tarjeta.locator('input[aria-label="Repeticiones de la nueva serie"]').last().fill(String(reps))
  await tarjeta.locator('button[aria-label="Guardar serie"]').last().click()
  await page.waitForTimeout(1100)
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

  /* =========================== 1. AYUDA / FAQ =========================== */
  console.log('--- 1. Ayuda e instrucciones ---')
  await page.getByRole('button', { name: /^📖 Ayuda$|Ayuda e instrucciones/ }).first().click()
  await page.waitForTimeout(1200)
  const ayuda = await page.locator('body').innerText()
  check('Se abre la ayuda', /Ayuda/i.test(ayuda) && /¿En qué te ayudo\?/i.test(ayuda))
  check('Dice cuántas preguntas hay', /\d+ preguntas con respuesta/i.test(ayuda), ayuda.match(/\d+ preguntas/)?.[0] ?? '')
  check('Está agrupada por temas', /Para empezar/i.test(ayuda) && /Mientras entrenas/i.test(ayuda))

  // Las respuestas estan plegadas: solo se ve la pregunta.
  check('Las respuestas empiezan plegadas', !/Añadir a pantalla de inicio/.test(ayuda))

  const primera = page.locator('.faq-pregunta').first()
  const textoPregunta = await primera.innerText()
  await primera.click()
  await page.waitForTimeout(600)
  const desplegada = await page.locator('body').innerText()
  check('Al tocar una pregunta se despliega su respuesta', desplegada.length > ayuda.length, textoPregunta.replace(/\n/g, ' ').slice(0, 40))
  check('Y dice qué hay que hacer, con detalle', /pantalla de inicio/i.test(desplegada))

  // Se vuelve a plegar.
  await primera.click()
  await page.waitForTimeout(500)

  // La busqueda con palabras del usuario.
  await page.locator('input[aria-label="Buscar en la ayuda"]').fill('alarma')
  await page.waitForTimeout(700)
  const buscado = await page.locator('body').innerText()
  check('La búsqueda encuentra por palabras del usuario ("alarma")', /respuestas? para «alarma»/i.test(buscado), buscado.match(/\d+ respuestas? para [^\n]*/)?.[0] ?? '')
  check('Y llevan a lo del aviso del descanso', /descanso/i.test(buscado))

  await page.locator('input[aria-label="Buscar en la ayuda"]').fill('cintura')
  await page.waitForTimeout(700)
  check('También encuentra por "cintura"', /medidas|cintura/i.test(await page.locator('body').innerText()))

  await page.locator('input[aria-label="Buscar en la ayuda"]').fill('xyzabc')
  await page.waitForTimeout(700)
  check('Si no encuentra nada, lo dice y sugiere', /No encuentro nada/i.test(await page.locator('body').innerText()))

  await page.locator('input[aria-label="Buscar en la ayuda"]').fill('')
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(shotsDir, '42-ayuda.png'), fullPage: true })

  await page.getByRole('button', { name: 'Volver' }).first().click()
  await page.waitForTimeout(900)

  /* ================== 2. Entrenar dos veces, para comparar ============== */
  console.log('\n--- 2. Entrenar: primera vez y segunda vez ---')
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })

  // Primera sesion: dos series de 60 kg.
  const primera1 = page.locator('.exercise-card').first()
  await apuntar(page, primera1, 60, 10)
  await apuntar(page, primera1, 60, 10)

  check(
    'La primera vez no hay con qué comparar',
    (await primera1.locator('.set-mejora').count()) === 0,
    'no se inventa una comparación',
  )

  // Se termina la sesion.
  await page.getByRole('button', { name: /Terminar y guardar/ }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal').getByRole('button', { name: /Guardar|Terminar/ }).first().click()
  await page.waitForTimeout(2500)

  // Segunda sesion del mismo ejercicio, con mas peso.
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })

  const primera2 = page.locator('.exercise-card').first()
  await apuntar(page, primera2, 62.5, 10)
  const conMejora = await page.locator('body').innerText()
  check(
    'Al subir el peso, avisa de que va mejor que la última vez',
    /▲/.test(conMejora) && /2,5 kg/.test(conMejora),
    conMejora.match(/▲[^\n]*/)?.[0] ?? 'sin aviso',
  )

  await apuntar(page, primera2, 60, 10)
  const igual = await page.locator('body').innerText()
  check('Con el mismo peso y reps, dice que igual', /= igual que la última vez/.test(igual))
  await page.screenshot({ path: join(shotsDir, '43-mejora-serie.png') })

  // Y la ayuda tambien esta a mano durante la sesion.
  check('Hay acceso a la ayuda durante el entrenamiento', (await page.getByRole('button', { name: 'Ayuda' }).count()) > 0)

  /* ============ 3. Progresión: grupos musculares y cardio junto ========= */
  console.log('\n--- 3. Progresión: equilibrio y semana completa ---')
  await page.getByRole('button', { name: /Terminar y guardar/ }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal').getByRole('button', { name: /Guardar|Terminar/ }).first().click()
  await page.waitForTimeout(2500)

  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1500)
  const progreso = await page.locator('body').innerText()
  check('Progresión muestra el volumen por grupo muscular', /Volumen por grupo muscular/i.test(progreso))
  check('Con los grupos y sus series', /Cuadriceps|Pecho|Espalda/i.test(progreso), progreso.match(/Cuadriceps[^\n]*/)?.[0] ?? '')
  check('Explica para qué sirve', /equilibrio/i.test(progreso))
  check('Avisa de que las de aproximación no cuentan', /aproximación no cuentan/i.test(progreso))
  check('Da una referencia de series por semana', /10 y 20 series/i.test(progreso))
  check('Muestra fuerza y cardio juntos', /Fuerza y cardio, juntos/i.test(progreso))
  check('Con la semana y sus sesiones', /series/i.test(progreso))
  await page.screenshot({ path: join(shotsDir, '44-progreso-grupos.png'), fullPage: true })

  /* ================= 4. Compartir la copia desde Inicio ================ */
  console.log('\n--- 4. Compartir la copia desde Inicio ---')
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(1200)
  const inicio = await page.locator('body').innerText()
  check('Inicio ofrece compartir la copia', /Compartir copia/i.test(inicio))
  /*
   * Antes de la primera copia el texto es "Todavía no has hecho ninguna copia", y despues
   * "Última copia: ...". Las dos formas son correctas: lo que importa es que diga en que punto
   * esta, no que use una frase concreta.
   */
  check(
    'Dice en qué punto está la copia',
    /Última copia|Todavía no has hecho ninguna copia/i.test(inicio),
    inicio.match(/(Última copia|Todavía no has hecho)[^\n]*/)?.[0] ?? '',
  )
  check('Y hay acceso a la ayuda desde Inicio', /Ayuda/i.test(inicio), inicio.match(/[^\n]*Ayuda[^\n]*/)?.[0] ?? '')

  // En este navegador de pruebas no hay funcion de compartir: debe descargar el archivo.
  const descargas = []
  page.on('download', (d) => descargas.push(d.suggestedFilename()))
  await page.getByRole('button', { name: /Compartir copia/i }).click()
  await page.waitForTimeout(2500)
  check(
    'Si el navegador no sabe compartir, descarga el archivo (nunca se queda sin copia)',
    descargas.length > 0,
    descargas.join(', ') || 'no descargó nada',
  )
  check('El archivo lleva la fecha en el nombre', /^kairos-copia-\d{4}-\d{2}-\d{2}\.json$/.test(descargas[0] ?? ''), descargas[0] ?? '')

  /*
   * Que la copia quede anotada se comprueba en AJUSTES, que es el sitio fiable: en la portada el
   * aviso DESAPARECE al hacer la copia (que es lo correcto: ya no hay nada que recordar).
   */
  await page.waitForTimeout(1500)
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(1500)
  const enAjustes = await page.locator('body').innerText()
  check(
    'Y la app anota que la copia está hecha',
    /Última copia[\s\S]{0,20}hoy/i.test(enAjustes),
    enAjustes.match(/Última copia[\s\S]{0,20}/)?.[0]?.replace(/\n/g, ': ') ?? 'no lo anota',
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
