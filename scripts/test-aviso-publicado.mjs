/*
 * Prueba DEFINITIVA del aviso de version nueva, sobre la direccion publicada.
 *
 * Por que esta prueba existe: el aviso no salia nunca y no habia ninguna prueba que lo
 * detectara, asi que paso inadvertido durante varias versiones. Esta comprueba el mecanismo
 * entero contra GitHub Pages de verdad:
 *
 *   1. la app arranca y funciona (con su service worker);
 *   2. la comprobacion de version LLEGA AL SERVIDOR (no se la contesta el service worker con
 *      su copia guardada, que era el fallo);
 *   3. el aviso aparece cuando el archivo publicado no es el que esta en uso.
 *
 * Para el punto 3 se necesita que la app crea que hay algo nuevo. Se consigue interceptando
 * SOLO la respuesta de la comprobacion de version y devolviendo un html con otro nombre de
 * archivo: es exactamente lo que pasaria si se hubiera publicado una version nueva, y ademas
 * comprueba el aviso de verdad (su texto, el boton y que se pueda descartar).
 *
 * Uso:  node scripts/test-aviso-publicado.mjs
 */
import { chromium, devices } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const APP = 'https://oscarmestre2011.github.io/gymlog/'
const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
try {
  /* ---------- 1. La app arranca y su comprobacion llega al servidor ---------- */
  console.log('--- 1. En la direccion publicada ---')
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()

  /** Peticiones de comprobacion de version que ha hecho la app. */
  const comprobaciones = []
  page.on('request', (r) => {
    if (/index\.html\?comprobacion=/.test(r.url())) comprobaciones.push(r.url())
  })

  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  if (await page.locator('text=Bienvenido a').count()) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(1000)
  }
  await page.waitForSelector('.nav', { timeout: 30000 })

  check('La app abre en la direccion publicada', (await page.locator('.nav').count()) > 0)

  // Se vuelve a primer plano: ahi la app comprueba si hay version nueva.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(2500)

  check(
    'La comprobación de versión LLEGA AL SERVIDOR (no se la contesta la caché)',
    comprobaciones.length > 0,
    comprobaciones.length ? comprobaciones[0].slice(-60) : 'la app no comprobó nada',
  )
  check(
    'Y lleva el parámetro que evita la copia guardada',
    comprobaciones.every((u) => /\?comprobacion=\d+/.test(u)),
    comprobaciones[0]?.match(/comprobacion=\d+/)?.[0] ?? '',
  )
  check('Sin version nueva publicada, el aviso NO aparece', (await page.locator('.update-banner').count()) === 0)

  /* ---------------- 2. Simular que hay una version nueva ------------------ */
  console.log('\n--- 2. Simulando que se acaba de publicar una versión nueva ---')
  const archivoPublicado = await page.evaluate(() => {
    const src = [...document.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src') ?? '')
      .find((s) => /index-[A-Za-z0-9_-]+\.js/.test(s))
    return /index-[A-Za-z0-9_-]+\.js/.exec(src ?? '')?.[0] ?? '?'
  })
  console.log(`   archivo en uso: ${archivoPublicado}`)

  // Solo se falsea la respuesta de la comprobacion: se devuelve el mismo html con otro nombre.
  await context.route('**/index.html?comprobacion=*', async (route) => {
    const respuesta = await route.fetch()
    const html = await respuesta.text()
    const falso = html.replaceAll(archivoPublicado, 'index-NUEVAVERSION01.js')
    await route.fulfill({ response: respuesta, body: falso })
  })

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(3000)

  const aviso = await page.locator('.update-banner').count()
  check('AHORA el aviso aparece', aviso > 0, aviso ? 'sí' : 'no apareció el aviso')

  if (aviso > 0) {
    const texto = await page.locator('.update-banner').innerText()
    check('El aviso dice que hay versión nueva', /versión nueva/i.test(texto), texto.replace(/\n/g, ' '))
    check('Tranquiliza sobre los datos', /datos no se tocan/i.test(texto))
    check('Ofrece ver qué cambia', /Ver qué cambia/i.test(texto))
    check('Ofrece actualizar', /Actualizar/i.test(texto))
    check('Se puede descartar', (await page.locator('.update-banner .icon-btn').count()) > 0)

    // "Ver qué cambia" abre las Novedades, que es la funcion nueva de esta version.
    await page.getByRole('button', { name: /Ver qué cambia/i }).click()
    await page.waitForTimeout(1500)
    const novedades = await page.locator('body').innerText()
    check('El botón abre las Novedades', /Novedades/i.test(novedades))
    check('Y cuenta qué ha cambiado', /NUEVO|ARREGLADO|MEJORADO/i.test(novedades), novedades.match(/(NUEVO|ARREGLADO|MEJORADO)[^\n]*/)?.[0] ?? '')
    check('Con la versión publicada destacada', /1\.1\.0/.test(novedades), novedades.match(/1\.1\.0[^\n]*/)?.[0] ?? '')
    await page.screenshot({ path: join(shotsDir, '37-aviso-publicado.png') })
  }

  /* --------------------- 3. Y el aviso no tapa la cabecera ---------------- */
  if (aviso > 0) {
    console.log('\n--- 3. El aviso y la cabecera ---')
    await page.getByRole('button', { name: 'Volver' }).first().click().catch(() => undefined)
    await page.waitForTimeout(1200)
    const topbar = await page.locator('.topbar').boundingBox()
    const banner = await page.locator('.update-banner').boundingBox()
    if (topbar && banner) {
      check(
        'El aviso no tapa la cabecera',
        topbar.y >= banner.y + banner.height - 1,
        `aviso acaba en ${Math.round(banner.y + banner.height)}, cabecera empieza en ${Math.round(topbar.y)}`,
      )
    }
  }
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
