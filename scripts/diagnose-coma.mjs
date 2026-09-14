/*
 * Reproduce el fallo de la coma decimal en los campos numericos.
 *
 * Sintoma: al escribir una distancia como "42,27" no se puede poner la coma.
 *
 * Se simula tecleo real, caracter a caracter, y se registra lo que aparece en el
 * campo despues de cada pulsacion. Asi se ve exactamente donde se pierde la coma.
 *
 * Uso:  node scripts/diagnose-coma.mjs
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const PORT = 5385
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
await esperarApp(page, 25000)

/** Escribe caracter a caracter y registra lo que queda en el campo. */
async function teclear(campo, texto, etiqueta) {
  await campo.click()
  await page.keyboard.press('Control+A')
  const traza = []
  for (const caracter of texto) {
    await page.keyboard.type(caracter)
    await page.waitForTimeout(120)
    const valor = await campo.inputValue()
    traza.push(`"${caracter}" -> campo: "${valor}"`)
  }
  console.log(`\n  ${etiqueta}`)
  for (const paso of traza) console.log(`    ${paso}`)
  const final = await campo.inputValue()
  const esperado = texto.replace('.', ',')
  console.log(`    RESULTADO: quería "${esperado}", quedó "${final}" ${final === esperado ? '✓' : '✗ FALLO'}`)
  return final
}

/* ---------- 1. Distancia en Cardio (el fallo que ha reportado el usuario) ---------- */
console.log('=== 1. Distancia de una sesion de cardio ===')
await page.getByRole('button', { name: /Cardio/ }).click()
await page.waitForTimeout(600)
await page.getByText('Añadir sesión de cardio').click()
await page.waitForSelector('.modal', { timeout: 12000 })

const distancia = page.locator('input[aria-label="Distancia en kilómetros"]')
await teclear(distancia, '42,27', 'Campo "Distancia (km)":')

/* ---------- 2. Peso de una serie en el gimnasio ---------- */
console.log('\n=== 2. Peso de una serie (decimal, en el gimnasio) ===')
await page.locator('.modal .icon-btn').first().click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Inicio/ }).click()
await page.waitForTimeout(400)
await page.getByText('Empezar entrenamiento').click()
await page.waitForSelector('.modal', { timeout: 12000 })
await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
await page.waitForSelector('.exercise-card', { timeout: 12000 })

const peso = page.locator('input[aria-label="Peso de la nueva serie"]').first()
await teclear(peso, '52,5', 'Campo "Peso" de una serie:')

/* ---------- 3. Repeticiones (entero): comprobar que no se rompe ---------- */
console.log('\n=== 3. Repeticiones (numero entero) ===')
const reps = page.locator('input[aria-label="Repeticiones de la nueva serie"]').first()
await teclear(reps, '12', 'Campo "Reps":')

/* ---------- 4. Desnivel y frecuencia cardiaca (enteros) ---------- */
console.log('\n=== 4. Otros campos enteros del cardio ===')
await page.getByRole('button', { name: /Cardio/ }).click()
await page.waitForTimeout(600)
await page.getByText('Añadir sesión de cardio').click()
await page.waitForSelector('.modal', { timeout: 12000 })
const desnivel = page.locator('input[aria-label="Desnivel en metros"]')
await teclear(desnivel, '190', 'Campo "Desnivel":')

await browser.close()
server.close()
