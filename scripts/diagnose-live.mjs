/*
 * Diagnostico de "pantalla en negro" en la app publicada.
 *
 * Prueba los escenarios reales de un usuario y explica que falla en cada uno:
 *   A) Visita nueva, sin nada en cache (como un movil recien estrenado)
 *   B) Visita repetida, con service worker ya instalado
 *   C) Usuario que YA tenia la version anterior (el caso mas delicado)
 *
 * Uso:  node scripts/diagnose-live.mjs [url]
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.argv[2] ?? 'https://kairosentrena.com/app/'
const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

const browser = await chromium.launch({ args: ['--disable-application-cache'] })

async function escenario(nombre, preparar) {
  console.log(`\n${'='.repeat(70)}\n${nombre}\n${'='.repeat(70)}`)
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()

  const errores = []
  const fallos = []
  const peticiones = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`[consola] ${m.text()}`)
  })
  page.on('requestfailed', (r) => fallos.push(`${r.failure()?.errorText} ${r.url()}`))
  page.on('response', (r) => {
    peticiones.push(`${r.status()} ${r.url().replace('https://oscarmestre2011.github.io', '')}`)
    if (r.status() >= 400) fallos.push(`${r.status()} ${r.url()}`)
  })

  try {
    if (preparar) await preparar(page, context)

    let navegacion = 'ok'
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
    } catch (e) {
      navegacion = String(e).split('\n')[0]
    }

    let monto = true
    try {
      await esperarApp(page, 20000)
    } catch {
      monto = false
    }
    await page.waitForTimeout(1200)

    const visible = (await page.locator('body').innerText().catch(() => '')).trim()
    const raiz = await page.locator('#root').innerHTML().catch(() => '')
    const html = await page.content().catch(() => '')

    console.log(`navegacion:            ${navegacion}`)
    console.log(`la app se monto:       ${monto ? 'SI' : 'NO'}`)
    console.log(`texto visible:         ${visible ? `${visible.length} caracteres` : 'VACIO'}`)
    console.log(`#root tiene contenido: ${raiz.length > 0 ? `SI (${raiz.length} caracteres)` : 'NO, esta vacio'}`)
    console.log(`HTML recibido:         ${html.length} caracteres`)
    if (visible) console.log(`  primeras lineas: ${visible.slice(0, 120).replace(/\n/g, ' | ')}`)

    console.log(`\nrespuestas HTTP: ${peticiones.length}`)
    for (const p of peticiones.slice(0, 12)) console.log(`  ${p}`)

    if (fallos.length > 0) {
      console.log(`\nFALLOS DE RED (${fallos.length}):`)
      for (const f of [...new Set(fallos)].slice(0, 10)) console.log(`  ${f}`)
    } else {
      console.log('\nsin fallos de red')
    }

    if (errores.length > 0) {
      console.log(`\nERRORES DE JAVASCRIPT (${errores.length}):`)
      for (const e of [...new Set(errores)].slice(0, 10)) console.log(`  ${e}`)
    } else {
      console.log('sin errores de JavaScript')
    }

    if (!monto && html.length < 2000) {
      console.log('\n--- HTML recibido (completo) ---')
      console.log(html.slice(0, 1200))
    }

    const sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'no soportado'
      const r = await navigator.serviceWorker.getRegistration()
      return JSON.stringify({
        estado: r?.active?.state ?? null,
        ambito: r ? new URL(r.scope).pathname : null,
        controla: Boolean(navigator.serviceWorker.controller),
        caches: await caches.keys(),
      })
    })
    console.log(`\nservice worker: ${sw}`)

    await page.screenshot({ path: join(shotsDir, `diag-${nombre.split(')')[0].trim()}.png`), fullPage: false })
  } catch (error) {
    console.log(`EXCEPCION en el escenario: ${String(error).split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/* A) Movil nuevo: nada en cache */
await escenario('A) Movil recien estrenado, sin cache', null)

/* B) Visita repetida: con service worker ya activo */
await escenario('B) Visita repetida, con service worker', async (page) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
})

/* C) El caso delicado: usuario que tenia la version ANTERIOR.
      Se simula dejando el service worker antiguo y luego borrando su cache,
      que es lo que ocurre cuando el service worker viejo sigue controlando. */
await escenario('C) Con service worker instalado y cache vaciada a mano', async (page) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.evaluate(async () => {
    const claves = await caches.keys()
    for (const clave of claves) await caches.delete(clave)
  })
})

await browser.close()
console.log('\nCapturas en capturas/diag-*.png')
