/*
 * Comprueba como se ve el emblema transparente sobre el fondo real de la app.
 *
 * Motivo: el emblema se recorta de un logo cuyo fondo es carbon. Si la transparencia
 * no se hace bien, queda un halo gris alrededor del anillo que se nota en la pantalla
 * de bienvenida. Aqui se compara el resultado sobre el fondo real.
 *
 * Uso:  node scripts/check-mark.mjs
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const markPath = join(projectDir, 'public', 'logo-mark.png')
const mark = (await readFile(markPath)).toString('base64')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 420, height: 300 } })

await page.setContent(`
  <body style="margin:0;background:#0f1115;font-family:sans-serif;color:#eef1f6">
    <div style="display:flex;align-items:center;gap:24px;padding:20px">
      <div style="text-align:center">
        <img src="data:image/png;base64,${mark}" width="104" height="104" alt="">
        <div style="font-size:11px;color:#9aa3b2">104 px (bienvenida)</div>
      </div>
      <div style="text-align:center">
        <img src="data:image/png;base64,${mark}" width="58" height="58" alt="">
        <div style="font-size:11px;color:#9aa3b2">58 px (ajustes)</div>
      </div>
      <div style="text-align:center">
        <img src="data:image/png;base64,${mark}" width="26" height="26" alt="">
        <div style="font-size:11px;color:#9aa3b2">26 px (cabecera)</div>
      </div>
      <div style="background:#171a21;padding:10px;text-align:center">
        <img src="data:image/png;base64,${mark}" width="58" height="58" alt="">
        <div style="font-size:11px;color:#9aa3b2">sobre tarjeta clara</div>
      </div>
    </div>
  </body>
`)

await page.screenshot({ path: join(projectDir, 'capturas', '23-emblema-fondos.png') })

// Se mide el color de los pixeles del borde para detectar halo gris.
const analisis = await page.evaluate(async (datos) => {
  const imagen = new Image()
  imagen.src = `data:image/png;base64,${datos}`
  await imagen.decode()
  const canvas = document.createElement('canvas')
  canvas.width = imagen.width
  canvas.height = imagen.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(imagen, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, imagen.width, imagen.height)

  let transparentes = 0
  let semitransparentes = 0
  let opacos = 0
  const claridadesBorde = []
  for (let i = 0; i < data.length; i += 4) {
    const alfa = data[i + 3]
    if (alfa === 0) transparentes += 1
    else if (alfa < 250) {
      semitransparentes += 1
      claridadesBorde.push(Math.max(data[i], data[i + 1], data[i + 2]))
    } else opacos += 1
  }
  return { width, height, transparentes, semitransparentes, opacos, claridadesBorde }
}, mark)

await browser.close()

const total = analisis.width * analisis.height
const pc = (v) => `${((v / total) * 100).toFixed(1)}%`
console.log(`Emblema: ${analisis.width}x${analisis.height}`)
console.log(`  transparentes:    ${pc(analisis.transparentes)}`)
console.log(`  opacos:           ${pc(analisis.opacos)}`)
console.log(`  borde suavizado:  ${pc(analisis.semitransparentes)}`)
const media = analisis.claridadesBorde.length
  ? Math.round(analisis.claridadesBorde.reduce((a, b) => a + b, 0) / analisis.claridadesBorde.length)
  : 0
console.log(`  claridad media del borde: ${media} (cuanto mas alta, mas claro; un halo gris daria ~60-100)`)
console.log(`\nCaptura para mirar: capturas/23-emblema-fondos.png`)
