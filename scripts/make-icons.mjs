/*
 * Genera los PNG del icono a partir del SVG, sin dependencias externas.
 * Se ejecuta una sola vez: `node scripts/make-icons.mjs`
 *
 * Dibuja la misma mancuerna que icon.svg (fondo redondeado + barra y discos)
 * rasterizando a mano en un bufer RGBA y codificando el PNG con zlib.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public')

const BG = [0x0f, 0x11, 0x15]
const FG = [0x4a, 0xde, 0x80]

/** Distancia de un punto a un segmento, para dibujar las barras redondeadas. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

const ROUNDED = 110 / 512
const STROKE = 34 / 512
const SEGMENTS = [
  [150, 256, 362, 256],
  [126, 196, 126, 316],
  [386, 196, 386, 316],
  [92, 216, 92, 296],
  [420, 216, 420, 296],
]

function render(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const radius = ROUNDED * size
  const stroke = (STROKE * size) / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = x + 0.5
      const cy = y + 0.5

      // Esquinas redondeadas: distancia al rectangulo interior.
      const inset = radius
      const qx = Math.max(inset - cx, cx - (size - inset), 0)
      const qy = Math.max(inset - cy, cy - (size - inset), 0)
      const insideSquare = Math.hypot(qx, qy) <= radius

      let color = null
      if (insideSquare) {
        color = BG
        for (const [x1, y1, x2, y2] of SEGMENTS) {
          const d = distToSegment(
            cx,
            cy,
            (x1 / 512) * size,
            (y1 / 512) * size,
            (x2 / 512) * size,
            (y2 / 512) * size,
          )
          if (d <= stroke) {
            // Suavizado simple en el borde.
            const edge = Math.min(1, stroke - d)
            color = [
              Math.round(BG[0] + (FG[0] - BG[0]) * edge),
              Math.round(BG[1] + (FG[1] - BG[1]) * edge),
              Math.round(BG[2] + (FG[2] - BG[2]) * edge),
            ]
            break
          }
        }
      }

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
  const typeBuffer = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuffer, data])
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
  ihdr[8] = 8 // profundidad de bit
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

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
