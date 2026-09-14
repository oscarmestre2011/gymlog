/*
 * Diagnostico dirigido: por que a veces no se registran las repeticiones al
 * rellenar el campo, y con que metodo de escritura si funciona.
 *
 * Uso:  node scripts/diagnose-input.mjs
 */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const PORT = 5387
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const server = createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const relative = raw.replace(/^[/\\]+/, '')
    let filePath = join(distDir, normalize(relative === '' ? 'index.html' : relative))
    try {
      if (!(await stat(filePath)).isFile()) filePath = join(distDir, 'index.html')
    } catch {
      filePath = join(distDir, 'index.html')
    }
    const body = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('404')
  }
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
const page = await context.newPage()
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const arranco = await page.locator('.nav').count()
console.log(`la app arranco: ${arranco > 0 ? 'SI' : 'NO'}`)
if (arranco === 0) {
  const html = await page.content()
  console.log(`AVISO: dist/ no parece un build valido. Rutas encontradas:`)
  console.log([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => `  ${m[1]}`).join('\n'))
  await browser.close()
  server.close()
  process.exit(1)
}

await page.getByText('Empezar entrenamiento').click()
await page.waitForSelector('.modal', { timeout: 10000 })
await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
await page.waitForSelector('.exercise-card', { timeout: 10000 })

const pesoNuevo = page.locator('input[aria-label="Peso de la nueva serie"]')
const repsNuevo = page.locator('input[aria-label="Repeticiones de la nueva serie"]')
const guardar = page.locator('button[aria-label="Guardar serie"]')

async function estado(etiqueta) {
  const info = await page.evaluate(() => {
    const p = document.querySelector('input[aria-label="Peso de la nueva serie"]')
    const r = document.querySelector('input[aria-label="Repeticiones de la nueva serie"]')
    const b = document.querySelector('button[aria-label="Guardar serie"]')
    return {
      peso: p instanceof HTMLInputElement ? p.value : '?',
      reps: r instanceof HTMLInputElement ? r.value : '?',
      guardarDeshabilitado: b instanceof HTMLButtonElement ? b.disabled : '?',
    }
  })
  console.log(`   ${etiqueta}: peso="${info.peso}" reps="${info.reps}" guardar=${info.guardarDeshabilitado ? 'DESHABILITADO' : 'activo'}`)
}

console.log('\nMetodo 1: fill() en peso y despues en reps')
await pesoNuevo.fill('50')
await repsNuevo.fill('10')
await estado('tras rellenar')

console.log('\nMetodo 2: borrar el campo de reps y escribir con teclado')
await repsNuevo.click()
await page.keyboard.press('Control+A')
await page.keyboard.type('10')
await estado('tras escribir con teclado')

console.log('\nMetodo 3: fill() en orden inverso (reps primero, luego peso)')
await repsNuevo.fill('')
await pesoNuevo.fill('')
await repsNuevo.fill('10')
await pesoNuevo.fill('50')
await estado('tras rellenar al reves')

console.log('\nMetodo 4: enfocar reps, seleccionar todo y escribir encima')
await repsNuevo.focus()
await page.keyboard.press('Control+A')
await page.keyboard.type('10')
await estado('tras escribir encima')

console.log('\nQue se guarda de verdad al pulsar el boton:')
if (await guardar.isEnabled()) {
  await guardar.click()
  await page.waitForTimeout(900)
  const guardadas = await page.evaluate(() =>
    [...document.querySelectorAll('.exercise-card .set-row')].map((fila) => fila.innerText.replace(/\n/g, ' ').trim()),
  )
  console.log(`   filas de series guardadas: ${JSON.stringify(guardadas)}`)
} else {
  const diag = await page.evaluate(() => {
    const r = document.querySelector('input[aria-label="Repeticiones de la nueva serie"]')
    return r instanceof HTMLInputElement ? r.value : '?'
  })
  console.log(`   no se puede guardar: el campo de reps contiene "${diag}"`)
}

await browser.close()
server.close()
