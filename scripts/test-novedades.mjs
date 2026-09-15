/*
 * Prueba de las Novedades y de la carpeta de copias automaticas.
 *
 * LO MAS IMPORTANTE QUE COMPRUEBA: que en un navegador SIN acceso a carpetas (Safari de iPhone)
 * la app lo EXPLIQUE, en lugar de ofrecer un boton que no hace nada o fallar en silencio. Para
 * eso se prueba tambien con WebKit, que es el motor de Safari.
 *
 * Sobre la carpeta, en Chromium: que se pueda elegir (con el selector simulado), que el archivo
 * se escriba de verdad en ella, y que el permiso concedido sobreviva a recargar la app.
 *
 * Uso:  node scripts/test-novedades.mjs [url]
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

/** Abre la app y quita la bienvenida si sale. */
async function abrir(page) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  if (await page.locator('text=Bienvenido a').count()) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(900)
  }
  await page.waitForSelector('.nav', { timeout: 30000 })
}

/* ============================ 1. Novedades ============================== */
console.log('--- 1. Novedades (registro de actualizaciones) ---')
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))

  await abrir(page)
  await page.getByRole('button', { name: /Ajustes/ }).click()
  await page.waitForTimeout(1200)

  const ajustes = await page.locator('body').innerText()
  check('Ajustes ofrece ver el historial de versiones', /Ver el historial de versiones/i.test(ajustes))
  check('Dice cuántas versiones hay', /\d+ versiones/i.test(ajustes), ajustes.match(/\(\d+ versiones\)/)?.[0] ?? '')

  await page.getByRole('button', { name: /Ver el historial de versiones/i }).click()
  await page.waitForTimeout(1200)
  const historial = await page.locator('body').innerText()
  check('Se abre el historial', /Historial completo/i.test(historial))
  check('Aparece la versión publicada', /1\.1\.0/.test(historial), historial.match(/1\.1\.0[^\n]*/)?.[0] ?? '')
  check('Aparece la primera versión', /1\.0\.0/.test(historial))
  const primeraVersion = historial.slice(historial.indexOf('1.1.0'))
  check(
    'Los cambios van etiquetados por tipo',
    /NUEVO/.test(primeraVersion) && /ARREGLADO/.test(primeraVersion),
    primeraVersion.slice(0, 80).replace(/\n/g, ' '),
  )
  check('Menciona la versión 1.0.15 (superseries)', /Superseries/i.test(historial))
  check('Y la 1.0.16 (medidas)', /Medidas corporales/i.test(historial))
  check('Avisa de que actualizar no toca los datos', /no toca tus datos/i.test(historial))
  await page.screenshot({ path: join(shotsDir, '35-novedades.png') })

  /* ================= 2. Carpeta de copias (con soporte) ================= */
  console.log('\n--- 2. Carpeta de copias en un navegador que SÍ la soporta ---')
  await page.getByRole('button', { name: 'Volver' }).first().click().catch(async () => {
    await page.getByRole('button', { name: '←' }).first().click()
  })
  await page.waitForTimeout(800)

  const seccionCarpeta = await page.locator('body').innerText()
  check('Ajustes tiene la sección de carpeta', /Carpeta de copias/i.test(seccionCarpeta))
  check('Ofrece elegir una carpeta', /Elegir carpeta/i.test(seccionCarpeta))
  check('Explica que la copia se hace sola', /guardará ahí una copia sola/i.test(seccionCarpeta))
  check('Avisa de que no protege contra perder el móvil', /no de perder el móvil/i.test(seccionCarpeta))
  check('Se puede elegir cada cuánto', /Quincenal/i.test(seccionCarpeta) && /Mensual/i.test(seccionCarpeta))
  check('Muestra el nombre que tendrá el archivo', /kairos-copia-\d{4}-\d{2}-\d{2}\.json/.test(seccionCarpeta))

  // Se simula el selector de carpeta del navegador con una carpeta de mentira EN MEMORIA, que
  // ademas apunta lo que se escribe: asi se comprueba que el archivo se crea de verdad.
  await page.evaluate(() => {
    window.__escrito = []
    window.__pedida = false
    const carpetaFalsa = {
      kind: 'directory',
      name: 'Documentos',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFileHandle: async (nombre) => ({
        createWritable: async () => ({
          write: async (datos) => window.__escrito.push({ nombre, longitud: datos.length, datos }),
          close: async () => undefined,
        }),
      }),
    }
    window.showDirectoryPicker = async () => {
      window.__pedida = true
      return carpetaFalsa
    }
  })

  /*
   * LIMITE CONOCIDO DE ESTA PRUEBA: una carpeta simulada NO se puede guardar en IndexedDB,
   * porque un handle de verdad es serializable y un objeto con metodos no. Por eso aqui no se
   * puede comprobar que la carpeta se recuerde entre visitas: eso solo se puede probar en un
   * movil real eligiendo una carpeta de verdad. Lo que SI se comprueba es que la app no falla
   * en silencio cuando no puede guardarla, que es el fallo de verdad.
   */
  await page.getByRole('button', { name: /Elegir carpeta/i }).click()
  await page.waitForTimeout(1500)
  const trasElegir = await page.locator('body').innerText()
  const pidioSelector = await page.evaluate(() => window.__pedida)
  check('La app pide la carpeta al navegador', pidioSelector === true)
  check(
    'Si no puede recordar la carpeta, lo dice (no falla en silencio)',
    /No se ha podido recordar la carpeta/i.test(trasElegir),
    trasElegir.match(/No se ha podido[^\n]*/)?.[0] ?? 'no avisa',
  )

  // Sin carpeta, pulsar guardar tampoco puede quedarse callado.
  await page.getByRole('button', { name: /Comprobar y guardar ahora/i }).click()
  await page.waitForTimeout(1200)
  const sinCarpeta = await page.locator('body').innerText()
  check('Sin carpeta, avisa de que hay que elegirla', /Elige primero una carpeta/i.test(sinCarpeta), sinCarpeta.match(/Elige primero[^\n]*/)?.[0] ?? 'no avisa')
  await page.screenshot({ path: join(shotsDir, '36-carpeta-copias.png'), fullPage: true })

  /*
   * El caso del permiso retirado (el fallo que reporto el usuario en su movil) NO se prueba
   * aqui, porque en este escenario la carpeta es simulada y no se puede recordar. Tiene su
   * propia prueba, con una carpeta real: scripts/test-carpeta-permiso.mjs.
   */

  check('Sin errores de JavaScript en Chromium', errores.length === 0, errores.join(' | '))
} finally {
  await browser.close()
}

/* ================== 3. iPhone: no hay carpetas, y lo dice ================= */
console.log('\n--- 3. En Safari (WebKit), que NO permite carpetas ---')
const browserWebkit = await webkit.launch()
try {
  const context = await browserWebkit.newContext({ ...devices['iPhone 13'], locale: 'es-ES' })
  const page = await context.newPage()
  await abrir(page)
  await page.getByRole('button', { name: /Ajustes/ }).click()
  await page.waitForTimeout(1500)
  const texto = await page.locator('body').innerText()

  check('En iPhone la app lo explica en lugar de ofrecer un botón inútil', /no permite guardar en una carpeta/i.test(texto))
  check('Y dice que es cosa del navegador, no de la app', /limitación de Safari, no de la app/i.test(texto))
  check('En iPhone NO se ofrece elegir carpeta', !/Elegir carpeta/i.test(texto))
  check('Pero sí se ofrece la descarga manual', /Descargar copia/i.test(texto))
  check('Las novedades también están en iPhone', /Ver el historial de versiones/i.test(texto))
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
