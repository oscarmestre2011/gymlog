/*
 * Prueba de que las copias de seguridad son UN SOLO apartado.
 *
 * Motivo: al anadir la copia automatica en carpeta quedaron dos apartados en Ajustes ("Copia de
 * seguridad" y "Carpeta de copias") que hacian lo mismo con nombres distintos. El usuario lo
 * noto. Esta prueba vigila que no vuelva a pasar: que haya un unico apartado, que dentro esten
 * las dos formas de copiar (el archivo y la carpeta), que el importar siga ahi, y que la carpeta
 * no aparezca por separado.
 *
 * Uso:  node scripts/test-copias-unificadas.mjs [url]
 */
import { chromium, webkit, devices } from 'playwright'
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

async function abrir(page) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  if (await page.locator('text=Bienvenido a').count()) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(900)
  }
  await page.waitForSelector('.nav', { timeout: 30000 })
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(1500)
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))
  await abrir(page)

  /* ---------------------- 1. Un solo apartado de copias ------------------- */
  console.log('--- 1. Un solo apartado ---')
  const titulos = await page.evaluate(() =>
    [...document.querySelectorAll('.card-title')].map((t) => t.textContent?.trim() ?? ''),
  )
  console.log(`   apartados de Ajustes: ${titulos.join(' · ')}`)

  const deCopias = titulos.filter((t) => /copia|copias/i.test(t))
  check(
    'Hay UN solo apartado de copias',
    deCopias.length === 1,
    deCopias.length ? deCopias.join(' + ') : 'ninguno',
  )
  check(
    'Ya no existe el apartado suelto "Carpeta de copias"',
    !titulos.some((t) => /^carpeta de copias$/i.test(t)),
    titulos.filter((t) => /carpeta/i.test(t)).join(', ') || 'ninguno',
  )
  check('El apartado se llama "Copia de seguridad"', deCopias[0] === 'Copia de seguridad', deCopias[0] ?? '')

  /* ------------- 2. Dentro están las dos formas, numeradas ------------- */
  console.log('\n--- 2. Las dos formas, dentro del mismo apartado ---')
  const cuerpo = await page.locator('body').innerText()
  const pasos = await page.evaluate(() =>
    [...document.querySelectorAll('.sub-title')].map((t) => t.textContent?.trim() ?? ''),
  )
  console.log(`   pasos: ${pasos.join(' · ')}`)

  check('Está la forma 1: descargar el archivo', /1 · Descargar el archivo/i.test(cuerpo))
  check('Está la forma 2: la carpeta automática', /2 · Copia automática en una carpeta/i.test(cuerpo))
  check('Está el recordatorio como paso 3', /3 · Recordatorio/i.test(cuerpo))
  check('Los pasos están numerados como subtítulos', pasos.length >= 3, pasos.join(' · '))

  /* ---------------- 3. Sigue estando todo lo de antes ---------------- */
  console.log('\n--- 3. No se ha perdido nada por el camino ---')
  check('Se puede descargar la copia', /Descargar copia \(\.json\)/i.test(cuerpo))
  check('Se puede importar una copia', /Importar copia/i.test(cuerpo))
  check('Se ve cuándo fue la última copia', /Última copia/i.test(cuerpo), cuerpo.match(/Última copia[^\n]*\n?[^\n]*/)?.[0]?.replace(/\n/g, ': ') ?? '')
  check('Se puede elegir la carpeta', /Elegir carpeta/i.test(cuerpo))
  check('Se elige cada cuánto copiar sola', /Cada cuánto copiar sola/i.test(cuerpo))
  check('Y se puede recordar que toque copia', /Cada 14 días/i.test(cuerpo))
  check('Se avisa de que la carpeta no protege de perder el móvil', /no de perder el móvil/i.test(cuerpo))
  await page.screenshot({ path: join(shotsDir, '41-copias-unificadas.png'), fullPage: true })

  /* ---------- 4. El orden enseña lo importante primero ---------------- */
  console.log('\n--- 4. El orden tiene sentido ---')
  const posiciones = await page.evaluate(() => {
    const texto = document.body.innerText
    return {
      estado: texto.indexOf('Última copia'),
      descargar: texto.indexOf('1 · Descargar el archivo'),
      carpeta: texto.indexOf('2 · Copia automática'),
      recordar: texto.indexOf('3 · Recordatorio'),
    }
  })
  check(
    'Primero el estado, luego las formas de copiar, y al final el recordatorio',
    posiciones.estado >= 0 &&
      posiciones.estado < posiciones.descargar &&
      posiciones.descargar < posiciones.carpeta &&
      posiciones.carpeta < posiciones.recordar,
    JSON.stringify(posiciones),
  )

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '))
} finally {
  await browser.close()
}

/* ------------------- 5. En iPhone, un solo apartado también ----------------- */
console.log('\n--- 5. En Safari (sin carpetas) sigue habiendo un solo apartado ---')
const browserWebkit = await webkit.launch()
try {
  const context = await browserWebkit.newContext({ ...devices['iPhone 13'], locale: 'es-ES' })
  const page = await context.newPage()
  await abrir(page)
  const titulos = await page.evaluate(() =>
    [...document.querySelectorAll('.card-title')].map((t) => t.textContent?.trim() ?? ''),
  )
  const cuerpo = await page.locator('body').innerText()
  check('En iPhone también hay un solo apartado de copias', titulos.filter((t) => /copia|copias/i.test(t)).length === 1, titulos.filter((t) => /copia/i.test(t)).join(' + '))
  /*
   * OJO: la comprobacion tiene que buscar el texto DE LA CARPETA, no cualquier mencion a iPhone
   * (hay varias en Ajustes, por ejemplo la del sonido del descanso). Buscar solo "iPhone" daria
   * un acierto falso.
   */
  check(
    'Y se explica que la carpeta no existe en iPhone',
    /Este navegador no permite guardar en una carpeta[\s\S]{0,120}iPhone/.test(cuerpo.replace(/\s+/g, ' ')),
    cuerpo.replace(/\s+/g, ' ').match(/Este navegador no permite[^.]*\./)?.[0] ?? 'no lo explica',
  )
  check('Pero la descarga sigue disponible', /Descargar copia/i.test(cuerpo))
} finally {
  await browserWebkit.close()
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
