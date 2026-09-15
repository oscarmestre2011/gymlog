/*
 * Extrae texto de paginas que se cargan con JavaScript (las de soporte de Google, por
 * ejemplo, no devuelven el contenido con una peticion normal).
 *
 * Uso:  node scripts/leer-pagina.mjs <url> [texto-a-buscar ...]
 */
import { chromium } from 'playwright'

const url = process.argv[2]
const patrones = process.argv.slice(3)
if (!url) {
  console.error('Falta la URL')
  process.exit(1)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ locale: 'es-ES' })
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ')

  console.log(`URL: ${url}`)
  console.log(`texto: ${texto.length} caracteres\n`)

  if (patrones.length === 0) {
    console.log(texto.slice(0, 4000))
  } else {
    for (const patron of patrones) {
      const i = texto.toLowerCase().indexOf(patron.toLowerCase())
      if (i >= 0) {
        console.log(`--- "${patron}" ---`)
        console.log(texto.slice(Math.max(0, i - 200), i + 900))
        console.log('')
      } else {
        console.log(`--- "${patron}": no encontrado ---\n`)
      }
    }
  }
} finally {
  await browser.close()
}
