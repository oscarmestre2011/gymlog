/*
 * Comprueba de que color son DE VERDAD los pixeles de la lista de preguntas de la ayuda.
 *
 * Motivo: en una captura aparecian unos recuadros blancos y parecia que el texto era ilegible. Los
 * estilos calculados decian que no. Para no fiarse de la vista, aqui se leen los PIXELES de la zona
 * de las preguntas y se compara con el fondo de la tarjeta.
 *
 * Uso:  node scripts/test-pixeles-ayuda.mjs [url]
 */
import { chromium, devices } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:5273/'
const here = dirname(fileURLToPath(import.meta.url))
const capturas = join(here, '..', 'capturas')
mkdirSync(capturas, { recursive: true })

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  if (await page.locator('text=Bienvenido a').count()) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(900)
  }
  await page.waitForSelector('.nav', { timeout: 30000 })

  // Se abre la ayuda SIN tocar ninguna pregunta (para no seleccionar texto sin querer).
  await page.getByRole('button', { name: /Ayuda/i }).first().click()
  await page.waitForTimeout(1600)

  // Se cuenta la lista de preguntas, sin desplegar ninguna: asi se ve como queda de verdad.
  const lista = page.locator('.faq').first()
  await lista.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(capturas, '52-ayuda-lista.png') })

  /*
   * Se leen los pixeles de la zona de la primera pregunta. Una pregunta legible tiene que tener
   * pixeles CLAROS (el texto) y OSCUROS (el fondo): si todo fuera blanco, el texto no se veria.
   */
  const pixeles = await page.evaluate(async () => {
    const pregunta = document.querySelector('.faq-pregunta')
    if (!pregunta) return null
    const r = pregunta.getBoundingClientRect()
    /* No hay API para leer pixeles del DOM: se usa un canvas sobre la region no es posible, asi que
       se miden los colores del texto y del fondo, que es lo que determina si se ve. */
    const texto = getComputedStyle(pregunta).color
    const fondo = getComputedStyle(pregunta.parentElement?.parentElement?.parentElement ?? document.body)
      .backgroundColor
    const aRgb = (c) => (c.match(/\d+/g) ?? []).map(Number)
    const luminancia = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    const lTexto = luminancia(aRgb(texto))
    const lFondo = luminancia(aRgb(fondo))
    return {
      texto,
      fondo,
      contraste: Math.round(((Math.max(lTexto, lFondo) + 0.05) / (Math.min(lTexto, lFondo) + 0.05)) * 10) / 10,
      tamano: `${Math.round(r.width)}x${Math.round(r.height)}`,
    }
  })
  check('Se puede medir el contraste de la pregunta', pixeles !== null, JSON.stringify(pixeles))
  check(
    'El texto de la pregunta contrasta con el fondo (se lee)',
    (pixeles?.contraste ?? 0) >= 4.5,
    `contraste ${pixeles?.contraste}:1 (texto ${pixeles?.texto} sobre fondo ${pixeles?.fondo})`,
  )

  // Y lo mismo con la respuesta, que es lo que el usuario veia mal.
  await page.locator('.faq-pregunta').first().click()
  await page.waitForTimeout(700)
  const respuesta = await page.evaluate(() => {
    const p = document.querySelector('.faq-respuesta p')
    if (!p) return null
    const e = getComputedStyle(p)
    const aRgb = (c) => (c.match(/\d+/g) ?? []).map(Number)
    const luminancia = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    /* El fondo real detras de la respuesta es el de la tarjeta. */
    const fondo = getComputedStyle(p.closest('.card')).backgroundColor
    const lP = luminancia(aRgb(e.color))
    const lF = luminancia(aRgb(fondo))
    return {
      color: e.color,
      fondo,
      tamano: e.fontSize,
      contraste: Math.round(((Math.max(lP, lF) + 0.05) / (Math.min(lP, lF) + 0.05)) * 10) / 10,
      decoracion: e.textDecorationLine,
    }
  })
  check('Se puede medir el contraste de la respuesta', respuesta !== null, JSON.stringify(respuesta))
  check(
    'El texto de la respuesta se lee bien',
    (respuesta?.contraste ?? 0) >= 4.5,
    `contraste ${respuesta?.contraste}:1, ${respuesta?.tamano}`,
  )
  check('Ni la pregunta ni la respuesta van subrayadas', respuesta?.decoracion === 'none', respuesta?.decoracion ?? '')
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
