/*
 * Comprueba que RENOMBRAR la app no rompe nada a quien ya la tiene instalada.
 *
 * Motivo: la app paso de llamarse "GymLog" a "Kairós". Cambiar el nombre visible es
 * seguro SI el identificador interno y la direccion no se tocan, pero eso hay que
 * demostrarlo, no suponerlo: si el identificador cambiara, el navegador lo trataria
 * como otra app distinta y los entrenamientos guardados quedarian huerfanos.
 *
 * Montaje: se sirve una version con el nombre ANTIGUO, se guarda un entrenamiento,
 * y despues se sirve la version con el nombre NUEVO (los ficheros del antiguo
 * desaparecen, como al publicar). Se comprueba que la app sigue, con sus datos.
 *
 * Uso:  node scripts/test-rename.mjs
 */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, stat, mkdir, rm, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const trabajo = join(projectDir, '.tmp-rename')
const dirAntiguo = join(trabajo, 'antiguo')
const dirNuevo = join(projectDir, 'dist')
const PORT = 5384
const SUBPATH = '/gymlog/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/* Se prepara una copia con el nombre antiguo, como estaba antes del cambio. */
await rm(trabajo, { recursive: true, force: true })
await mkdir(trabajo, { recursive: true })
await cp(dirNuevo, dirAntiguo, { recursive: true })
const manifiestoAntiguo = JSON.parse(await readFile(join(dirAntiguo, 'manifest.webmanifest'), 'utf8'))
manifiestoAntiguo.name = 'GymLog — Registro de entrenamiento'
manifiestoAntiguo.short_name = 'GymLog'
await writeFile(join(dirAntiguo, 'manifest.webmanifest'), JSON.stringify(manifiestoAntiguo, null, 2), 'utf8')

const manifiestoNuevo = JSON.parse(await readFile(join(dirNuevo, 'manifest.webmanifest'), 'utf8'))
console.log(`Antes: "${manifiestoAntiguo.short_name}"  ->  Ahora: "${manifiestoNuevo.short_name}"\n`)

if (manifiestoAntiguo.id !== manifiestoNuevo.id) {
  console.log('AVISO: el identificador cambio. Eso SI romperia las instalaciones existentes.')
  process.exit(1)
}
console.log(`Identificador interno (id): "${manifiestoNuevo.id}" — no ha cambiado\n`)

function serve(getDir) {
  const server = createServer(async (req, res) => {
    const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const sinPrefijo = raw.startsWith('/gymlog') ? raw.slice('/gymlog'.length) : raw
    const relative = sinPrefijo.replace(/^[/\\]+/, '')
    const dir = getDir()
    const esAsset = /\.(js|css)$/.test(relative)
    let filePath = join(dir, normalize(relative === '' ? 'index.html' : relative))
    try {
      if (!(await stat(filePath)).isFile()) {
        if (esAsset) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404')
          return
        }
        filePath = join(dir, 'index.html')
      }
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404')
      return
    }
    const body = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(body)
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

let sirviendo = 'antiguo'
const server = await serve(() => (sirviendo === 'antiguo' ? dirAntiguo : dirNuevo))
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  const url = `http://localhost:${PORT}${SUBPATH}`

  /* --------------- 1. Instalar la version con el nombre antiguo ------------- */
  console.log('1) Se instala la app con el nombre antiguo')
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  if ((await page.locator('text=Bienvenido a').count()) > 0) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(900)
  }
  await page.waitForSelector('.nav', { timeout: 25000 })

  const nombreInstalado = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href')
    const r = await fetch(href)
    return (await r.json()).short_name
  })
  check('La version antigua se llama GymLog', nombreInstalado === 'GymLog', nombreInstalado)

  /* --------------------- 2. El usuario entrena y guarda -------------------- */
  console.log('\n2) El usuario apunta un entrenamiento')
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 15000 })

  for (let i = 0; i < 3; i += 1) {
    const card = page.locator('.exercise-card').first()
    const peso = card.locator('input[aria-label="Peso de la nueva serie"]')
    const reps = card.locator('input[aria-label="Repeticiones de la nueva serie"]')
    await peso.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('47,5')
    await reps.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('10')
    await page.waitForTimeout(300)
    await card.locator('button[aria-label="Guardar serie"]').click()
    await page.waitForTimeout(700)
  }
  await page.getByText('Terminar y guardar').click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal').getByRole('button', { name: 'Terminar', exact: true }).click()
  await page.waitForTimeout(1800)

  const datosAntes = await page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((r) => {
      peticion.onsuccess = () => r(peticion.result)
    })
    const leer = (a) =>
      new Promise((r) => {
        const p = db.transaction(a, 'readonly').objectStore(a).getAll()
        p.onsuccess = () => r(p.result)
      })
    const sets = await leer('sets')
    return { series: sets.length, pesos: [...new Set(sets.map((s) => s.weight))] }
  })
  check('Se guardan los entrenamientos', datosAntes.series === 3 && datosAntes.pesos[0] === 47.5, JSON.stringify(datosAntes))

  /* -------------------- 3. Se publica el nombre nuevo --------------------- */
  console.log('\n3) Se publica la app con el nombre nuevo (Kairós)')
  sirviendo = 'nuevo'
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3000)
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  await page.waitForSelector('.nav', { timeout: 25000 })

  const nombreNuevo = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href')
    const r = await fetch(href, { cache: 'no-store' })
    return (await r.json()).short_name
  })
  check('La app ya se llama Kairós', nombreNuevo === 'Kairós', nombreNuevo)

  const cabecera = await page.locator('.topbar').innerText()
  check('El nombre nuevo se ve en la cabecera', cabecera.includes('Kairós'), cabecera.replace(/\n/g, ' | ').slice(0, 60))

  /* ------------- 4. Lo importante: los datos siguen ahí ------------------- */
  console.log('\n4) Lo importante: los entrenamientos siguen ahí?')
  const datosDespues = await page.evaluate(async () => {
    const bases = (await indexedDB.databases()).map((b) => b.name).filter(Boolean)
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((r) => {
      peticion.onsuccess = () => r(peticion.result)
    })
    const leer = (a) =>
      new Promise((r) => {
        const p = db.transaction(a, 'readonly').objectStore(a).getAll()
        p.onsuccess = () => r(p.result)
      })
    const [sets, sessions] = await Promise.all([leer('sets'), leer('sessions')])
    return {
      bases,
      series: sets.length,
      sesiones: sessions.length,
      pesos: [...new Set(sets.map((s) => s.weight))],
    }
  })
  check('La base de datos local sigue siendo la misma', datosDespues.bases.includes('gymlog'), JSON.stringify(datosDespues.bases))
  check('Las series siguen guardadas tras el cambio de nombre', datosDespues.series === 3, `${datosDespues.series} series`)
  check('Los pesos son los mismos', datosDespues.pesos[0] === 47.5, JSON.stringify(datosDespues.pesos))

  /*
   * El historial de sesiones esta en PROGRESION: la portada solo propone el entrenamiento del dia,
   * asi que el peso apuntado ya no se ve ahi. Se navega para comprobarlo.
   */
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1500)
  const texto = await page.locator('body').innerText()
  check('El historial se ve en la app renombrada', /47,5|Fuerza A/.test(texto), texto.match(/SESIONES GUARDADAS[\s\S]{0,60}/i)?.[0]?.replace(/\n/g, ' ') ?? 'sin sección')
  check('No se ha creado una app nueva con datos vacíos', datosDespues.sesiones === 1, `${datosDespues.sesiones} sesión(es)`)

  /* ------------------- 5. Y se puede seguir usando igual ------------------ */
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza B' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 15000 })
  check('Se puede seguir entrenando con el nombre nuevo', (await page.locator('.exercise-card').count()) > 0)
} finally {
  await browser.close()
  server.close()
  await rm(trabajo, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
