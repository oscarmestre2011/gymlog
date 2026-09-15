/*
 * Inspecciona la cache del service worker: que claves guarda exactamente.
 * Uso:  node scripts/diagnose-cache.mjs [url]
 */
import { chromium, devices } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5273/'

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(3000)

  const info = await page.evaluate(async () => {
    const nombres = await caches.keys()
    const detalle = []
    for (const nombre of nombres) {
      const cache = await caches.open(nombre)
      const claves = (await cache.keys()).map((p) => p.url)
      detalle.push({ nombre, total: claves.length, claves })
    }
    return detalle
  })

  for (const c of info) {
    console.log(`\n${c.nombre} (${c.total} entradas):`)
    for (const clave of c.claves) {
      const u = new URL(clave)
      console.log(`  ${u.pathname}${u.search}`)
    }
  }

  // Duplicados por ruta, que es lo que comprueba la prueba del aviso.
  for (const c of info) {
    const rutas = c.claves.map((clave) => new URL(clave).pathname)
    const duplicadas = rutas.filter((r, i) => rutas.indexOf(r) !== i)
    if (duplicadas.length) {
      console.log(`\nDUPLICADAS en ${c.nombre}: ${[...new Set(duplicadas)].join(', ')}`)
    }
  }
} finally {
  await browser.close()
}
