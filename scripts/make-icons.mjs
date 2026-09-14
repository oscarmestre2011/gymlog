/*
 * Genera los iconos de la app a partir del LOGO REAL de Kairós.
 *
 * Por que asi: el logo es una imagen (PNG de 1254x1254), no un dibujo vectorial, y
 * aqui no hay librerias de imagen instaladas. En lugar de añadir dependencias se usa
 * el propio motor de Chromium (que ya esta para las pruebas) para recortar y escalar
 * la imagen con buena calidad.
 *
 * Genera:
 *   icon-192.png / icon-512.png   el logo completo
 *   icon-maskable-512.png         el logo al 78% sobre fondo carbon, porque Android
 *                                 recorta el icono con formas y se comeria los discos
 *   logo-mark.png (192)           solo el emblema, sin texto, para la interfaz
 *
 * Uso:  node scripts/make-icons.mjs [ruta-del-logo]
 */
import { chromium } from 'playwright'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const outDir = join(projectDir, 'public')
// El logo de origen se guarda en marca/ y NO en public/: si estuviera en public/ se
// subiria a la web (1,2 MB) sin que la app lo use, porque solo sirve de fuente.
const logoPath = process.argv[2] ?? join(projectDir, 'marca', 'logo-kairos.png')

const CARBON = '#1A1A1A'
/** Porcentaje del lienzo que ocupa el logo en el icono recortable (zona segura de Android). */
const ESCALA_SEGURA = 0.78

/**
 * Zona del emblema, MEDIDA sobre la imagen (ver scripts/measure-logo.mjs) y no a ojo:
 *   x: 147 - 1106    y: 73 - 851
 *
 * El limite inferior es 851 y no 901 a proposito: los pixeles del texto "KAIROS"
 * empiezan en la fila 851, asi que cortar ahi deja el emblema completo (incluidas las
 * zapatillas del corredor) sin colar ni una letra.
 */
const EMBLEMA_PX = { x: 147, y: 73, ancho: 959, alto: 778 }

const existe = await stat(logoPath).catch(() => null)
if (!existe) {
  console.error(`No encuentro el logo en: ${logoPath}`)
  process.exit(1)
}

const tipo = extname(logoPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
const logoDataUrl = `data:${tipo};base64,${(await readFile(logoPath)).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()

const generado = await page.evaluate(
  async ({ logoDataUrl, carbon, escalaSegura, zona }) => {
    const imagen = new Image()
    imagen.src = logoDataUrl
    await imagen.decode()

    const nuevoLienzo = (size) => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.fillStyle = carbon
      ctx.fillRect(0, 0, size, size)
      return { canvas, ctx }
    }

    /** Logo completo, escalado y centrado (con margen opcional). */
    const logoCompleto = (size, escala = 1) => {
      const { canvas, ctx } = nuevoLienzo(size)
      const lado = size * escala
      const margen = (size - lado) / 2
      ctx.drawImage(imagen, margen, margen, lado, lado)
      return canvas.toDataURL('image/png')
    }

    /**
     * Zonas a tapar dentro del recorte del emblema, medidas en tanto por uno.
     *
     * Justo debajo del anillo asoma el borde superior del texto "KAIROS": el acento
     * de la O y las puntas de las letras. El emblema ahi esta vacio (fondo carbon),
     * asi que se tapan con rectangulos del color de fondo. Se hace asi en lugar de
     * recortar mas por abajo porque recortando se cortarian las zapatillas del corredor.
     */
    const tapar = [
      { x: 0.78, y: 0.86, ancho: 0.22, alto: 0.14 }, // acento de la O
      { x: 0.0, y: 0.9, ancho: 0.22, alto: 0.1 }, // punta de la K
      { x: 0.3, y: 0.94, ancho: 0.45, alto: 0.06 }, // puntas centrales
    ]

    /** Emblema recortado, encajado en un cuadrado y centrado sobre fondo carbon. */
    const emblema = (size) => {
      const { canvas, ctx } = nuevoLienzo(size)
      const relacion = zona.ancho / zona.alto
      let anchoDestino = size
      let altoDestino = size / relacion
      if (altoDestino > size) {
        altoDestino = size
        anchoDestino = size * relacion
      }
      const x = (size - anchoDestino) / 2
      const y = (size - altoDestino) / 2
      // Se recortan las esquinas inferiores por donde entraba el texto.
      ctx.save()
      ctx.beginPath()
      const corte = size * 0.3
      ctx.moveTo(0, 0)
      ctx.lineTo(size, 0)
      ctx.lineTo(size, size - corte)
      ctx.lineTo(size - corte, size)
      ctx.lineTo(corte, size)
      ctx.lineTo(0, size - corte)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(imagen, zona.x, zona.y, zona.ancho, zona.alto, x, y, anchoDestino, altoDestino)
      ctx.restore()

      // Se tapan los restos de texto que quedan dentro del recorte.
      ctx.fillStyle = carbon
      for (const zonaTapar of tapar) {
        ctx.fillRect(
          zonaTapar.x * size,
          zonaTapar.y * size,
          zonaTapar.ancho * size,
          zonaTapar.alto * size,
        )
      }
      return canvas.toDataURL('image/png')
    }

    return {
      logo192: logoCompleto(192),
      logo512: logoCompleto(512),
      maskable512: logoCompleto(512, escalaSegura),
      emblema192: emblema(192),
      emblema512: emblema(512),
      medidas: { ancho: imagen.width, alto: imagen.height },
    }
  },
  { logoDataUrl, carbon: CARBON, escalaSegura: ESCALA_SEGURA, zona: EMBLEMA_PX },
)

await browser.close()

async function guardar(dataUrlTexto, nombre) {
  const buffer = Buffer.from(dataUrlTexto.split(',')[1], 'base64')
  await writeFile(join(outDir, nombre), buffer)
  console.log(`escrito ${nombre} (${Math.round(buffer.length / 1024)} KB)`)
}

console.log(`Logo de origen: ${generado.medidas.ancho}x${generado.medidas.alto}`)
await guardar(generado.logo192, 'icon-192.png')
await guardar(generado.logo512, 'icon-512.png')
await guardar(generado.maskable512, 'icon-maskable-512.png')
await guardar(generado.emblema192, 'logo-mark.png')
await guardar(generado.emblema512, 'logo-mark-grande.png')
