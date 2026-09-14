/*
 * Reproduce el fallo de "pantalla en negro" que sufre un usuario que YA tenia la
 * app instalada cuando se publica una version nueva.
 *
 * Montaje:
 *   - Se construye una version ANTIGUA (A) y una NUEVA (B), con nombres de
 *     fichero distintos, como en un despliegue real.
 *   - El navegador visita A, deja el service worker y la cache de A.
 *   - Un "servidor" empieza a servir B: los ficheros de A ya NO existen, igual
 *     que hace GitHub Pages al publicar (borra los antiguos).
 *   - Se abre la app varias veces y se observa si queda en negro.
 *
 * Uso:  node scripts/reproduce-stale.mjs
 */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat, writeFile, mkdir, rm, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const distDir = join(projectDir, 'dist')
const oldDir = join(projectDir, '.tmp-dist-viejo')
const PORT = 5391
const SUBPATH = '/gymlog/'
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

async function nombreJs(dir) {
  const html = await readFile(join(dir, 'index.html'), 'utf8')
  return /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1]
}

/** Servidor con el comportamiento de GitHub Pages: 404 si el fichero no existe. */
function serve(getDir) {
  const server = createServer(async (req, res) => {
    const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const withoutPrefix = raw.startsWith(SUBPATH.slice(0, -1)) ? raw.slice(SUBPATH.length - 1) : raw
    const relative = withoutPrefix.replace(/^[/\\]+/, '')
    const dir = getDir()
    let filePath = join(dir, normalize(relative === '' ? 'index.html' : relative))
    try {
      if (!(await stat(filePath)).isFile()) {
        // Ruta desconocida: GitHub Pages devuelve el index (fallback de sitio estatico).
        filePath = join(dir, 'index.html')
        if (!/\.(js|css)$/.test(relative)) {
          const body = await readFile(filePath)
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(body)
          return
        }
      }
    } catch {
      /* sigue abajo */
    }
    try {
      const body = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      // Aqui esta la clave: un asset que ya no existe devuelve 404, como en GitHub Pages.
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404')
    }
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

console.log('1) Construyendo version ANTIGUA (A)...')
await rm(oldDir, { recursive: true, force: true })
await mkdir(oldDir, { recursive: true })
await cp(distDir, oldDir, { recursive: true })
const jsA = await nombreJs(oldDir)

console.log('2) Publicando version NUEVA (B)...')
// Se toca el codigo para que el hash del fichero cambie, como en un despliegue real.
const settings = join(projectDir, 'src', 'screens', 'SettingsScreen.tsx')
const original = await readFile(settings, 'utf8')
await writeFile(settings, original.replace('1.0.2', '1.0.3'), 'utf8')
try {
  await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], {
    cwd: projectDir,
    env: { ...process.env, GYMLOG_BASE: SUBPATH },
    shell: process.platform === 'win32',
  })
} finally {
  await writeFile(settings, original, 'utf8')
}
const jsB = await nombreJs(distDir)
console.log(`   A usa ${jsA}`)
console.log(`   B usa ${jsB}\n`)

if (jsA === jsB) {
  console.log('AVISO: los nombres coinciden, la prueba no seria concluyente.')
  process.exit(1)
}

let sirviendo = 'A'
const server = await serve(() => (sirviendo === 'A' ? oldDir : distDir))
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()

  const estado = async () => {
    const visible = (await page.locator('body').innerText().catch(() => '')).trim()
    const raiz = await page.locator('#root').innerHTML().catch(() => '')
    return { visible: visible.length, raiz: raiz.length, monto: (await page.locator('.nav').count()) > 0 }
  }

  console.log('3) Visita inicial con la version A (como el dia que se instalo)')
  await page.goto(`http://localhost:${PORT}${SUBPATH}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.nav', { timeout: 20000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log(`   ${JSON.stringify(await estado())}`)

  console.log('\n4) Se publica la version B. Los ficheros de A YA NO EXISTEN.')
  sirviendo = 'B'

  for (let apertura = 1; apertura <= 5; apertura += 1) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(2500)
    const e = await estado()
    const script = await page.evaluate(() =>
      [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).join(','),
    )
    console.log(
      `   apertura ${apertura}: ${e.monto ? 'OK' : '*** PANTALLA EN NEGRO ***'} (texto ${e.visible}, #root ${e.raiz}) script=${script}`,
    )
    if (!e.monto && e.visible === 0 && e.raiz === 0) {
      const fallos = await page.evaluate(() => window.__fallos ?? [])
      console.log(`      fallos capturados: ${JSON.stringify(fallos)}`)
      await page.screenshot({ path: join(projectDir, 'capturas', 'diag-negro.png') })
    }
  }
} finally {
  await browser.close()
  server.close()
  await rm(oldDir, { recursive: true, force: true })
}
