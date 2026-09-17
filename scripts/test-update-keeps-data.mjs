/*
 * Responde con hechos a una pregunta critica: si ya tengo la app instalada con
 * entrenamientos guardados y se publica una version nueva, se actualiza sola o
 * hay que reinstalar? Y se pierden los datos?
 *
 * Montaje (una actualizacion real, paso a paso):
 *   1. Se compila la version A en una carpeta aparte y se sirve. El navegador la instala.
 *   2. El usuario apunta un entrenamiento completo (4 series de 50 kg x 10).
 *   3. Se compila la version B (con el numero de version cambiado) y se sirve en su
 *      lugar. Los ficheros de A desaparecen, igual que hace GitHub Pages al publicar.
 *   4. Se abre la app varias veces: se comprueba si se actualiza sola Y si el
 *      entrenamiento sigue ahi con los mismos pesos.
 *
 * IMPORTANTE: compila en carpetas temporales (.tmp-versiones). No toca dist/, para
 * que otras pruebas que sirven desde dist/ no fallen despues.
 *
 * Uso:  node scripts/test-update-keeps-data.mjs
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { createServer } from 'node:http'
import { readFile, stat, writeFile, mkdir, rm, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const workDir = join(projectDir, '.tmp-versiones')
const dirB = join(workDir, 'B')
const PORT = 5386
const SUBPATH = '/app/'
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

/**
 * Compila en una carpeta concreta, con la base de la subcarpeta.
 * Se usa una ruta RELATIVA a proposito: la ruta del proyecto contiene espacios
 * ("20 Vida saludable") y al pasarla absoluta se parte en varios argumentos.
 */
async function compilar(destinoRelativo) {
  await run(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'build', '--outDir', destinoRelativo, '--emptyOutDir'],
    { cwd: projectDir, env: { ...process.env, GYMLOG_BASE: SUBPATH }, shell: process.platform === 'win32' },
  )
}

/** Nombre del fichero JavaScript principal de una compilacion. */
async function nombreJs(dir) {
  const html = await readFile(join(dir, 'index.html'), 'utf8')
  return /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1] ?? '?'
}

/** Servidor con el comportamiento de GitHub Pages: subcarpeta, fallback a index y 404 en assets. */
function serve(getDir) {
  const server = createServer(async (req, res) => {
    const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const sinPrefijo = raw.startsWith('/app') ? raw.slice('/app'.length) : raw
    const relative = sinPrefijo.replace(/^[/\\]+/, '')
    const dir = getDir()
    const esAsset = /\.(js|css)$/.test(relative)
    let filePath = join(dir, normalize(relative === '' ? 'index.html' : relative))
    try {
      if (!(await stat(filePath)).isFile()) {
        if (esAsset) {
          // Un asset de la version anterior ya no existe: 404, como en GitHub Pages.
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

/** Apunta una serie rellenando el primer ejercicio. Escribe con teclado, como una persona. */
async function apuntarSerie(page, peso, reps) {
  const primeraTarjeta = page.locator('.exercise-card').first()
  const pesoNuevo = primeraTarjeta.locator('input[aria-label="Peso de la nueva serie"]')
  const repsNuevo = primeraTarjeta.locator('input[aria-label="Repeticiones de la nueva serie"]')
  const guardar = primeraTarjeta.locator('button[aria-label="Guardar serie"]')

  await pesoNuevo.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(peso))
  await repsNuevo.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(reps))

  // El boton se habilita al registrar las repeticiones: se espera sin bloquearse.
  await page
    .waitForFunction(
      () => {
        const boton = document.querySelector('button[aria-label="Guardar serie"]')
        return boton instanceof HTMLButtonElement && !boton.disabled
      },
      { timeout: 10000 },
    )
    .catch(() => null)

  if (!(await guardar.isEnabled())) {
    const diag = await primeraTarjeta.evaluate((el) => ({
      peso: el.querySelector('input[aria-label="Peso de la nueva serie"]')?.value,
      reps: el.querySelector('input[aria-label="Repeticiones de la nueva serie"]')?.value,
    }))
    throw new Error(`el boton de guardar no se habilito (peso="${diag.peso}", reps="${diag.reps}")`)
  }
  await guardar.click()
  await page.waitForTimeout(700)
}

console.log('Compilando version A (la que ya tienes) y version B (la nueva)...\n')
await rm(workDir, { recursive: true, force: true })
await mkdir(workDir, { recursive: true })
const dirA = join(workDir, 'A')
await compilar('.tmp-versiones/A')
const jsA = await nombreJs(dirA)

// Se cambia el numero de version en el codigo fuente para forzar un despliegue distinto.
const settings = join(projectDir, 'src', 'screens', 'SettingsScreen.tsx')
const fuenteOriginal = await readFile(settings, 'utf8')
const versionActual = /<span className="v">(\d+\.\d+\.\d+)<\/span>/.exec(fuenteOriginal)?.[1] ?? '1.0.3'
const [mayor, menor, parche] = versionActual.split('.').map(Number)
const versionNueva = `${mayor}.${menor}.${parche + 1}`
await writeFile(
  settings,
  fuenteOriginal.replace(`<span className="v">${versionActual}</span>`, `<span className="v">${versionNueva}</span>`),
  'utf8',
)
try {
  await compilar('.tmp-versiones/B')
} finally {
  await writeFile(settings, fuenteOriginal, 'utf8')
}
const jsB = await nombreJs(dirB)

console.log(`version A: ${versionActual}  (${jsA})`)
console.log(`version B: ${versionNueva}  (${jsB})\n`)
if (jsA === jsB) {
  console.log('AVISO: los nombres de fichero coinciden, la prueba no seria concluyente.')
  process.exit(1)
}

let sirviendo = 'A'
const server = await serve(() => (sirviendo === 'A' ? dirA : dirB))
const browser = await chromium.launch()
try {
  mkdirSync(join(projectDir, 'capturas'), { recursive: true })
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()

  /* -------------------- 1. Instalar la version A -------------------- */
  console.log('1) Se instala la version A')
  await page.goto(`http://localhost:${PORT}${SUBPATH}`, { waitUntil: 'networkidle' })
  await esperarApp(page, 25000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration()
    return r?.active?.state ?? 'sin-registro'
  })
  check('La version A queda instalada con su service worker', sw === 'activated', sw)

  /* --------------- 2. El usuario apunta un entrenamiento -------------- */
  console.log('\n2) Se apunta un entrenamiento completo (4 series de 50 kg x 10)')
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })

  for (let i = 0; i < 4; i += 1) {
    await apuntarSerie(page, 50, 10)
  }
  const textoAntes = await page.locator('body').innerText()
  check('Se registran las 4 series', /4 series/.test(textoAntes), textoAntes.match(/\d+ series[^\n]*/)?.[0] ?? '')
  check(
    'El volumen calculado es 2000 kg',
    /2\.000 kg de volumen|2000 kg de volumen/.test(textoAntes),
    textoAntes.match(/[\d.,]+ kg de volumen/)?.[0] ?? '',
  )

  await page.getByText('Terminar y guardar').click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal').getByRole('button', { name: 'Terminar', exact: true }).click()
  await page.waitForTimeout(1800)
  /*
   * El historial de sesiones y los totales estan en PROGRESION: la portada se limpio y solo
   * propone el entrenamiento del dia.
   */
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1800)
  const trasGuardar = await page.locator('body').innerText()
  check('La sesion queda guardada en el historial', /2\.000 kg|2000 kg/.test(trasGuardar), trasGuardar.match(/[\d.,]+ kg/)?.[0] ?? '')

  /* -------------------- 3. Se publica la version B ------------------- */
  console.log('\n3) Se publica la version B. Los ficheros de A YA NO EXISTEN.')
  sirviendo = 'B'

  let actualizada = false
  let aperturas = 0
  for (let i = 1; i <= 5; i += 1) {
    await page.reload({ waitUntil: 'networkidle', timeout: 40000 }).catch(() => null)
    await page.waitForTimeout(3000)
    aperturas = i
    const servido = await page.evaluate(async () => {
      const respuesta = await fetch('./index.html', { cache: 'no-store' }).catch(() => null)
      const html = respuesta ? await respuesta.text() : ''
      return /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1] ?? '?'
    })
    console.log(`   apertura ${i}: fichero servido = ${servido}`)
    if (servido === jsB) {
      actualizada = true
      break
    }
  }
  check('La app se actualiza SOLA, sin reinstalar nada', actualizada, `en la apertura numero ${aperturas}`)

  /* --------------- 4. Los entrenamientos siguen ahi? ---------------- */
  console.log('\n4) Comprobacion clave: sigue el entrenamiento guardado?')
  await esperarApp(page, 25000)
  await page.waitForTimeout(1500)
  // Se vuelve a Progresion, que es donde se ven las sesiones guardadas y los totales.
  await page.locator('.nav button', { hasText: 'Progreso' }).click()
  await page.waitForTimeout(1800)
  const despues = await page.locator('body').innerText()
  check('La sesion sigue en el historial tras actualizar', despues.includes('Fuerza A'), despues.match(/SESIONES GUARDADAS[\s\S]{0,80}/i)?.[0]?.replace(/\n/g, ' ') ?? 'sin sección')
  check('El volumen guardado se conserva', /2\.000 kg|2000 kg/.test(despues), despues.match(/[\d.,]+ kg/)?.[0] ?? '')

  const datos = await page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve, reject) => {
      peticion.onsuccess = () => resolve(peticion.result)
      peticion.onerror = () => reject(peticion.error)
    })
    const leer = (almacen) =>
      new Promise((resolve) => {
        const p = db.transaction(almacen, 'readonly').objectStore(almacen).getAll()
        p.onsuccess = () => resolve(p.result)
        p.onerror = () => resolve([])
      })
    const [sessions, sets] = await Promise.all([leer('sessions'), leer('sets')])
    return { sesiones: sessions.length, series: sets.length, pesos: [...new Set(sets.map((s) => s.weight))] }
  })
  check('Las series siguen guardadas en el dispositivo', datos.series === 4, `${datos.series} series`)
  check('Los pesos son los mismos', datos.pesos.length === 1 && datos.pesos[0] === 50, JSON.stringify(datos.pesos))

  /* --------- 5. Y se puede seguir entrenando tras actualizar --------- */
  console.log('\n5) Se puede seguir apuntando series con la version nueva?')
  // El boton de empezar esta en la portada: se vuelve a ella (la comprobacion anterior dejo la
  // pantalla en Progresion).
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Hacer otra cosa|Elegir rutina y entrenar/i }).click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza B' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })
  await apuntarSerie(page, 65, 8)
  const nuevaSesion = await page.locator('body').innerText()
  check('Se puede apuntar una serie nueva despues de actualizar', /1 serie/.test(nuevaSesion) && nuevaSesion.includes('65'))

  await page.screenshot({ path: join(projectDir, 'capturas', '17-tras-actualizar.png') })
} finally {
  await browser.close()
  server.close()
  await rm(workDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} comprobaciones correctas`)
if (failed.length > 0) {
  console.log('Fallos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
