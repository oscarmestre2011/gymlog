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

    /**
     * Emblema recortado, con FONDO TRANSPARENTE.
     *
     * El fondo del logo es carbon: se vuelve transparente para poder poner el emblema
     * sobre la interfaz sin que se vea el recuadro. Antes se dejaba el fondo opaco y en
     * la pantalla de bienvenida se notaba un cuadrado mas claro que el fondo de la app.
     *
     * Las zonas "tapar" ya no hacen falta: al hacer transparente el carbon desaparecen
     * solas las motas de texto que quedaban dentro del recorte.
     */
    const emblema = (size) => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const relacion = zona.ancho / zona.alto
      let anchoDestino = size
      let altoDestino = size / relacion
      if (altoDestino > size) {
        altoDestino = size
        anchoDestino = size * relacion
      }
      const x = (size - anchoDestino) / 2
      const y = (size - altoDestino) / 2

      // Se recortan las esquinas inferiores: justo debajo del anillo queda el borde
      // superior del texto "KAIROS". El emblema es redondo, asi que esas esquinas
      // estan vacias y no se pierde nada.
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

      // Se borra lo que quede FUERA del anillo en la mitad inferior del recorte.
      //
      // Justo debajo del anillo asoma el borde superior del texto "KAIROS" (el acento
      // de la O y las puntas de las letras). Recortar mas por abajo cortaria las
      // zapatillas del corredor, asi que en su lugar se calcula el circulo del anillo
      // y se hace transparente todo lo que caiga fuera de el en esa zona: por ahi solo
      // hay fondo y restos de texto.
      //
      // El centro y el radio salen de los datos medidos (ver scripts/measure-logo.mjs):
      // el emblema ocupa de x=147 a x=1106, asi que el centro esta en x=626,5.
      const centroX = (147 + 1106) / 2
      const centroY = 456 // centro vertical del anillo dentro de la imagen original
      // El radio se amplia un 18% sobre el del anillo: asi se borra tambien la franja
      // inmediatamente exterior, donde caen las puntas de las letras del texto, sin
      // tocar el anillo.
      const radioAnillo = ((1106 - 147) / 2) * 1.18

      const datos = ctx.getImageData(0, 0, size, size)
      const px = datos.data
      const UMBRAL_BAJO = 34
      const UMBRAL_ALTO = 48

      // Como se proyecta el recorte en el lienzo cuadrado, para pasar de un pixel del
      // lienzo a su posicion en la imagen original.
      const escala = altoDestino / zona.alto
      const aOriginalX = (x0) => zona.x + (x0 - x) / escala
      const aOriginalY = (y0) => zona.y + (y0 - y) / escala

      for (let py2 = 0; py2 < size; py2 += 1) {
        for (let px2 = 0; px2 < size; px2 += 1) {
          const i = (py2 * size + px2) * 4

          // 1) El carbon del fondo pasa a transparente, con transicion suave para que
          //    no quede un halo gris alrededor del anillo.
          const claridad = Math.max(px[i], px[i + 1], px[i + 2])
          if (claridad < UMBRAL_ALTO) {
            const alfa =
              claridad <= UMBRAL_BAJO ? 0 : 1 - (claridad - UMBRAL_BAJO) / (UMBRAL_ALTO - UMBRAL_BAJO)
            px[i + 3] = Math.round(px[i + 3] * (1 - alfa))
          }

          // 2) Restos del texto "KAIROS" que asoman por debajo del anillo.
          //
          //    a) La tilde de la O: al medirla resulta estar MAS CERCA del centro que el
          //       anillo, asi que la mascara radial no la alcanza. Se borra con una banda
          //       horizontal en la zona donde empieza el texto, por encima del borde
          //       inferior del recorte para no rozar el anillo.
          //    b) Fuera del anillo en la mitad inferior: puntas de las letras.
          const oy = aOriginalY(py2 + 0.5)
          const ox = aOriginalX(px2 + 0.5)
          const enBandaDeTexto = py2 / size > 0.845 && py2 / size < 0.97
          if (enBandaDeTexto) {
            px[i + 3] = 0
          } else if (oy > centroY) {
            const distancia = Math.hypot(ox - centroX, oy - centroY)
            if (distancia > radioAnillo) px[i + 3] = 0
          }
        }
      }
      ctx.putImageData(datos, 0, 0)
      return canvas.toDataURL('image/png')
    }

    void tapar

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
