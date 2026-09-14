/*
 * Mide con precision la zona del logo que ocupa el emblema redondo, para poder
 * recortarlo sin cortar el dibujo ni colar el texto "KAIROS".
 *
 * Metodo: se buscan los pixeles del anillo (terracota y blanco calido) y se calcula
 * su caja envolvente. Los pesos dorados laterales tambien cuentan, porque forman
 * parte del emblema.
 *
 * Uso:  node scripts/measure-logo.mjs
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const logoPath = join(projectDir, 'public', 'logo-kairos.png')

const base64 = (await readFile(logoPath)).toString('base64')

const browser = await chromium.launch()
const page = await browser.newPage()

const medidas = await page.evaluate(async (logoDataUrl) => {
  const imagen = new Image()
  imagen.src = logoDataUrl
  await imagen.decode()

  const canvas = document.createElement('canvas')
  canvas.width = imagen.width
  canvas.height = imagen.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(imagen, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, imagen.width, imagen.height)

  /** Colores del emblema: terracota, blanco calido y dorado. Se descarta el carbon. */
  const esDelEmblema = (r, g, b) => {
    const claro = r > 90 || g > 90 || b > 90
    if (!claro) return false // fondo carbon: fuera
    // Blanco calido de la corona inferior y de las letras
    const esBlancoCalido = r > 190 && g > 180 && b > 150
    // Terracota del meandro superior y del corredor
    const esTerracota = r > 120 && g < 120 && b < 110
    // Dorado de los pesos
    const esDorado = r > 140 && g > 110 && b < 120
    return esBlancoCalido || esTerracota || esDorado
  }

  /** Caja envolvente de una zona horizontal (para separar emblema de texto). */
  const caja = (yDesde, yHasta) => {
    let xMin = width
    let xMax = -1
    let yMin = height
    let yMax = -1
    for (let y = yDesde; y < yHasta; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        if (esDelEmblema(data[i], data[i + 1], data[i + 2])) {
          if (x < xMin) xMin = x
          if (x > xMax) xMax = x
          if (y < yMin) yMin = y
          if (y > yMax) yMax = y
        }
      }
    }
    return { xMin, xMax, yMin, yMax }
  }

  // El emblema esta en la parte de arriba del logo; el texto, debajo. Se mide el
  // conjunto y tambien la mitad de arriba, que seguro es solo emblema.
  const total = caja(0, height)
  const soloArriba = caja(0, Math.floor(height * 0.72))

  // Perfil por filas: donde hay pixeles del emblema, para ver donde acaba.
  const filas = []
  for (let y = 0; y < height; y += 1) {
    let cuenta = 0
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (esDelEmblema(data[i], data[i + 1], data[i + 2])) cuenta += 1
    }
    filas.push(cuenta)
  }
  // Primera fila vacia por debajo del emblema (separacion antes del texto).
  let primeraVacia = -1
  let haHabladoEmblema = false
  for (let y = 0; y < height; y += 1) {
    if (filas[y] > 3) haHabladoEmblema = true
    else if (haHabladoEmblema && y > height * 0.5) {
      primeraVacia = y
      break
    }
  }

  return { width, height, total, soloArriba, primeraVacia }
}, `data:image/png;base64,${base64}`)

await browser.close()

const { width, height, total, soloArriba, primeraVacia } = medidas
const pc = (v, base) => (v / base).toFixed(4)

console.log(`Logo: ${width}x${height}\n`)
console.log('Caja del emblema (arriba, sin texto):')
console.log(`  x: ${soloArriba.xMin} - ${soloArriba.xMax}   ->  x=${pc(soloArriba.xMin, width)}, ancho=${pc(soloArriba.xMax - soloArriba.xMin, width)}`)
console.log(`  y: ${soloArriba.yMin} - ${soloArriba.yMax}   ->  y=${pc(soloArriba.yMin, height)}, alto=${pc(soloArriba.yMax - soloArriba.yMin, height)}`)
console.log(`\nPrimera fila sin emblema (donde empieza el texto): ${primeraVacia}  ->  ${pc(primeraVacia, height)}`)
console.log('\nCaja de TODO el logo (emblema + texto):')
console.log(`  x: ${total.xMin} - ${total.xMax}`)
console.log(`  y: ${total.yMin} - ${total.yMax}`)
console.log('\nCopia estos valores en ZONA_EMBLEMA de scripts/make-icons.mjs')
