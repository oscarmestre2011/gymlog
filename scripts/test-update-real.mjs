/*
 * Mide cuantas aperturas tarda en verse un despliegue REAL, y si aparece el aviso de
 * "version nueva".
 *
 * El caso delicado: si entre dos despliegues NO cambia el sw.js (lo normal cuando solo
 * se toca el codigo de la app), el navegador no ve motivo para actualizar el service
 * worker, asi que el evento del que depende el aviso no se dispara. La app deberia
 * actualizarse igual, pero tardando mas.
 *
 * Escenario:
 *   1. Se publica la version ANTIGUA (una copia del build actual con la version cambiada).
 *   2. El navegador la instala: service worker activo y cache con la copia antigua.
 *   3. Se publica la version NUEVA, con el mismo sw.js y ficheros JS distintos,
 *      como en un despliegue real. Los ficheros antiguos ya no existen.
 *   4. Se abre la app varias veces anotando: que fichero JS usa, que version muestra
 *      y si ha salido el aviso de version nueva.
 *
 * Uso:  node scripts/test-update-real.mjs
 */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, stat, mkdir, rm, cp, readdir, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const trabajo = join(projectDir, '.tmp-update-real')
const PORT = 5383
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

/** Compila en una carpeta, con la base de la subcarpeta. */
async function compilar(destinoRelativo) {
  await run(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'build', '--outDir', destinoRelativo, '--emptyOutDir'],
    { cwd: projectDir, env: { ...process.env, GYMLOG_BASE: SUBPATH }, shell: process.platform === 'win32' },
  )
}

const nombreJs = async (dir) =>
  /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(await readFile(join(dir, 'index.html'), 'utf8'))?.[1] ?? '?'

console.log('Preparando version ANTIGUA...')
await rm(trabajo, { recursive: true, force: true })
await mkdir(trabajo, { recursive: true })
const dirAntiguo = join(trabajo, 'antiguo')

// La version antigua se compila con el numero de version anterior en el codigo.
const settings = join(projectDir, 'src', 'screens', 'SettingsScreen.tsx')
const fuenteOriginal = await readFile(settings, 'utf8')
const versionActual = /<span className="v">(\d+\.\d+\.\d+)<\/span>/.exec(fuenteOriginal)?.[1] ?? '1.0.9'
const [mayor, menor, parche] = versionActual.split('.').map(Number)
const versionAntigua = `${mayor}.${menor}.${parche - 1}`

await writeFile(settings, fuenteOriginal.replace(`>${versionActual}<`, `>${versionAntigua}<`), 'utf8')
try {
  await compilar('.tmp-update-real/antiguo')
} finally {
  await writeFile(settings, fuenteOriginal, 'utf8')
}
const jsAntiguo = await nombreJs(dirAntiguo)

console.log('Preparando version NUEVA (sin tocar el service worker, como un despliegue normal)...')
await compilar('.tmp-update-real/nuevo')
const dirNuevo = join(trabajo, 'nuevo')
const jsNuevo = await nombreJs(dirNuevo)

// Comprobacion clave: el sw.js debe ser IDENTICO en las dos versiones. Es el escenario
// que se quiere probar: solo cambia el codigo de la app.
const swAntiguo = await readFile(join(dirAntiguo, 'sw.js'), 'utf8')
const swNuevo = await readFile(join(dirNuevo, 'sw.js'), 'utf8')

console.log(`\nversion antigua: ${versionAntigua}  (${jsAntiguo})`)
console.log(`version nueva:   ${versionActual}  (${jsNuevo})`)
console.log(`sw.js identico en las dos: ${swAntiguo === swNuevo ? 'SI (es el caso a probar)' : 'no'}\n`)

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

  const estado = async () => {
    const info = await page.evaluate(async () => {
      const html = await fetch('./index.html', { cache: 'no-store' }).then((r) => r.text()).catch(() => '')
      const registro = await navigator.serviceWorker.getRegistration()
      const visible = document.body.innerText
      return {
        js: /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1] ?? '?',
        sw: registro?.active?.state ?? 'sin registro',
        aviso: /versión nueva/i.test(visible),
        version: /(\d+\.\d+\.\d+)/.exec(visible.match(/Versión[\s\S]{0,30}/)?.[0] ?? '')?.[1] ?? '?',
      }
    })
    return info
  }

  console.log('1) Se instala la version antigua')
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  if ((await page.locator('text=Bienvenido a').count()) > 0) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(900)
  }
  await page.waitForSelector('.nav', { timeout: 25000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  const inicial = await estado()
  console.log(`   fichero: ${inicial.js}   service worker: ${inicial.sw}`)
  check('La version antigua queda instalada', inicial.js === jsAntiguo, inicial.js)

  console.log('\n2) Se publica la version nueva (mismo sw.js, ficheros JS distintos)')
  sirviendo = 'nuevo'

  /*
   * AQUI ESTA EL CASO REAL: la app sigue ABIERTA con la version anterior en memoria.
   * Es lo que pasa en el movil cuando se instala como aplicacion: al volver a ella no se
   * recarga, se reanuda. Con "red primero" en la navegacion, una recarga si traeria la
   * version nueva; el problema es la app ya cargada, que se queda con el codigo viejo.
   * Para eso existe el aviso.
   */
  console.log('\n3) La app sigue abierta (reanudada, sin recargar): debe salir el aviso')
  // Se simula volver a la app: el manejador de visibilitychange vuelve a mirar la version.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(4000)

  const avisoTrasReanudar = await estado()
  check(
    'Con la app abierta, avisa de que hay version nueva',
    avisoTrasReanudar.aviso,
    avisoTrasReanudar.aviso ? 'aviso visible' : 'NO aparece el aviso',
  )
  const textoAviso = await page.locator('body').innerText()
  check(
    'El aviso dice que los datos no se tocan',
    /datos no se tocan/i.test(textoAviso) || !avisoTrasReanudar.aviso,
    textoAviso.match(/versión nueva[^\n]*/i)?.[0] ?? '',
  )
  await page.screenshot({ path: join(projectDir, 'capturas', '25-aviso-version-nueva.png') })

  console.log('\n4) Se pulsa Actualizar y debe quedar la version nueva')
  if (avisoTrasReanudar.aviso) {
    await page.locator('.update-banner button', { hasText: 'Actualizar' }).click()
    await page.waitForTimeout(4000)
    const trasActualizar = await estado()
    check('Tras actualizar, la app usa la version nueva', trasActualizar.js === jsNuevo, trasActualizar.js)
  } else {
    check('Tras actualizar, la app usa la version nueva', false, 'no habia aviso que pulsar')
  }

  console.log('\n5) Aperturas sucesivas:')
  let primeraConNueva = null
  for (let i = 1; i <= 4; i += 1) {
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => null)
    await page.waitForTimeout(3000)
    const ahora = await estado()
    const esNueva = ahora.js === jsNuevo
    if (esNueva && primeraConNueva === null) primeraConNueva = i
    console.log(`   apertura ${i}: ${ahora.js}${esNueva ? ' <- NUEVA' : ' (antigua)'}   sw: ${ahora.sw}`)
    if (esNueva) break
  }

  check('La app acaba mostrando la version nueva', primeraConNueva !== null, `en la apertura ${primeraConNueva ?? 'ninguna'}`)
  check(
    'La actualizacion no tarda mas de 1 apertura',
    primeraConNueva !== null && primeraConNueva <= 1,
    `${primeraConNueva ?? '-'} aperturas`,
  )

  console.log('\n6) Que version dice la pantalla de Ajustes')
  await page.getByRole('button', { name: /Ajustes/ }).click()
  await page.waitForTimeout(1000)
  const ajustes = await page.locator('body').innerText()
  check('Ajustes muestra la version nueva', ajustes.includes(versionActual), `esperado ${versionActual}`)
  console.log(`   Ajustes dice: ${ajustes.match(/Versión[\s\S]{0,12}/)?.[0]?.replace(/\n/g, ' ') ?? '?'}`)
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
