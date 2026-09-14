/*
 * Genera los PNG del icono (192 y 512) SIN dependencias externas.
 *
 * Dibuja el mismo simbolo que public/icon.svg: fondo carbon redondeado, marco
 * circular, barra vertical en terracota, discos dorados, la omega griega en blanco
 * calido y meandro arriba y abajo. Paleta del brief de identidad de Kairós:
 * carbon #1A1A1A, oro #C9A84C, terracota #C85A3E, blanco calido #F5F0E8.
 *
 * Se dibuja con distancias con signo (SDF) y se rasteriza a mano para no depender
 * de librerias de imagen. Uso:  node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public')

/* Paleta del brief de identidad */
const CARBON = [0x1a, 0x1a, 0x1a]
const ORO = [0xc9, 0xa8, 0x4c]
const TERRACOTA = [0xc8, 0x5a, 0x3e]
const BLANCO = [0xf5, 0xf0, 0xe8]
const FONDO_PAGINA = [0x0f, 0x11, 0x15]

/** Escala: el dibujo se define sobre un lienzo de 512 para que coincida con el SVG. */
const BASE = 512

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mezclar = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

/* ---------------------------- primitivas SDF ---------------------------- */

function sdCirculo(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r
}

function sdAnillo(px, py, cx, cy, r, grosor) {
  return Math.abs(sdCirculo(px, py, cx, cy, r)) - grosor / 2
}

function sdCapsula(px, py, x1, y1, x2, y2, grosor) {
  const dx = x2 - x1
  const dy = y2 - y1
  const largoSq = dx * dx + dy * dy
  const t = largoSq === 0 ? 0 : clamp01(((px - x1) * dx + (py - y1) * dy) / largoSq)
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy) - grosor / 2
}

/** Rectangulo con esquinas redondeadas (para el fondo del icono). */
function sdRectanguloRedondeado(px, py, ancho, alto, radio) {
  const dx = Math.abs(px - ancho / 2) - (ancho / 2 - radio)
  const dy = Math.abs(py - alto / 2) - (alto / 2 - radio)
  const fuera = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return fuera + Math.min(Math.max(dx, dy), 0) - radio
}

/**
 * Segmento de la omega, aproximado con puntos.
 * El contorno del SVG es:
 *   M206 214 h33  a52 52 0 0 0 34 88  a52 52 0 0 0 34 -88  h33
 * Se muestrea en puntos para poder medir la distancia a la polilinea.
 */
function puntosOmega() {
  const puntos = []
  puntos.push([206, 214], [239, 214])
  // Primer arco: de (239,214) a (273,302), radio 52, barrido en sentido horario negativo.
  const a1 = { cx: 239, cy: 258, r: 44, desde: -Math.PI / 2, hasta: Math.PI / 2 }
  for (let i = 0; i <= 16; i += 1) {
    const t = a1.desde + ((a1.hasta - a1.desde) * i) / 16
    puntos.push([a1.cx + a1.r * Math.cos(t), a1.cy + a1.r * Math.sin(t)])
  }
  // Segundo arco: simetrico.
  const a2 = { cx: 273, cy: 258, r: 44, desde: Math.PI / 2, hasta: (3 * Math.PI) / 2 }
  for (let i = 0; i <= 16; i += 1) {
    const t = a2.desde + ((a2.hasta - a2.desde) * i) / 16
    puntos.push([a2.cx + a2.r * Math.cos(t), a2.cy + a2.r * Math.sin(t)])
  }
  puntos.push([307, 214], [339, 214])
  return puntos
}

function sdPolilinea(px, py, puntos, grosor) {
  let mejor = Infinity
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const [x1, y1] = puntos[i]
    const [x2, y2] = puntos[i + 1]
    const d = sdCapsula(px, py, x1, y1, x2, y2, grosor)
    if (d < mejor) mejor = d
  }
  return mejor
}

const OMEGA = puntosOmega()

/**
 * Meandro griego: NO se usa en el icono.
 *
 * Se probo y queda tapado por el marco circular: a tamaño de icono solo añadia
 * ruido y lineas cortadas. Se conserva la funcion por si algun dia se quiere el
 * simbolo grande con el meandro, pero el icono se queda con lo que se lee bien:
 * anillo, barra, discos y omega.
 */
function sdMeandro(px, py, espejo) {
  const y = espejo ? 420 : 92
  const signo = espejo ? -1 : 1
  let d = sdCapsula(px, py, 150, y, 362, y, 6)
  d = Math.min(d, sdCapsula(px, py, 150, y, 150, y + 16 * signo, 6))
  d = Math.min(d, sdCapsula(px, py, 150, y + 16 * signo, 346, y + 16 * signo, 6))
  d = Math.min(d, sdCapsula(px, py, 346, y + 16 * signo, 346, y + 32 * signo, 6))
  d = Math.min(d, sdCapsula(px, py, 346, y + 32 * signo, 166, y + 32 * signo, 6))
  return d
}

void sdMeandro

/**
 * Devuelve el color del pixel (o null si es transparente).
 * Se evalua de fondo a primer plano, como se apilarian las capas del SVG.
 */
function colorDelPixel(x, y) {
  const escala = BASE / 512
  const px = x * escala
  const py = y * escala

  const fueraDelIcono = sdRectanguloRedondeado(px, py, BASE, BASE, 112)
  if (fueraDelIcono > 0) return null

  // Se empieza por el fondo y se va pintando lo que quede por encima (menor distancia).
  let color = CARBON
  let profundidad = Infinity

  const capas = [
    [sdAnillo(px, py, 256, 256, 168, 10), BLANCO, 0, 0.92],
    [sdCapsula(px, py, 256, 140, 256, 372, 23), TERRACOTA, 0, 1],
    [sdCapsula(px, py, 196, 180, 316, 180, 23), ORO, 0, 1],
    [sdCapsula(px, py, 196, 332, 316, 332, 23), ORO, 0, 1],
    [sdPolilinea(px, py, OMEGA, 19), BLANCO, 0, 1],
  ]

  for (const [distancia, tono, suavizado, opacidad] of capas) {
    const cobertura = suavizado > 0 ? 1 - clamp01((distancia + suavizado) / (suavizado * 2)) : 1 - clamp01(distancia + 0.5)
    if (cobertura <= 0 || distancia >= profundidad) continue
    if (cobertura >= 1) {
      color = mezclar(color, tono, opacidad)
      profundidad = distancia
    } else if (cobertura > 0) {
      // Borde suavizado: se mezcla solo lo justo para no dejar escalones.
      color = mezclar(color, mezclar(color, tono, opacidad), cobertura)
      if (cobertura > 0.5) profundidad = distancia
    }
  }

  return color
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = colorDelPixel(x + 0.5, y + 0.5)
      const offset = (y * size + x) * 4
      if (color) {
        pixels[offset] = color[0]
        pixels[offset + 1] = color[1]
        pixels[offset + 2] = color[2]
        pixels[offset + 3] = 255
      }
    }
  }
  return pixels
}

/* ------------------------------- codificacion PNG ------------------------------- */

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePNG(pixels, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0 // filtro "none"
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  const png = encodePNG(render(size), size)
  const target = join(outDir, `icon-${size}.png`)
  writeFileSync(target, png)
  console.log(`escrito ${target} (${png.length} bytes)`)
}

// Referencia para saber de que color es el fondo fuera del icono redondeado.
void FONDO_PAGINA
