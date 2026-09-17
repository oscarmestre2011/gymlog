/*
 * Responde a una pregunta concreta: cuando se publica una version nueva, cuantas
 * veces hay que abrir la app para verla?
 *
 * Simula un despliegue real:
 *  1. Sirve la version ANTIGUA en un puerto (ya construida en dist-antiguo).
 *  2. El navegador la visita y queda con el service worker antiguo.
 *  3. Se cambia a la version NUEVA (dist) sin tocar el navegador.
 *  4. Se abre y se recarga varias veces, comprobando cuando aparece la nueva.
 *
 * Uso:
 *   node scripts/update-behavior.mjs
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { createServer } from 'node:http'
import { readFile, stat, mkdir, cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const distDir = join(projectDir, 'dist')
const oldDir = join(projectDir, '.tmp-dist-antiguo')
const PORT = 5393
const ORIGIN = `http://localhost:${PORT}`
const SUBPATH = '/app/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/** Sirve una carpeta concreta, imitando a GitHub Pages (subcarpeta + fallback). */
function serveFrom(getDir) {
  const server = createServer(async (req, res) => {
    try {
      const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const withoutPrefix = raw.startsWith('/app') ? raw.slice('/app'.length) : raw
      const relative = withoutPrefix.replace(/^[/\\]+/, '')
      const dir = getDir()
      let filePath = join(dir, normalize(relative) === '' ? 'index.html' : normalize(relative))
      try {
        if (!(await stat(filePath)).isFile()) filePath = join(dir, 'index.html')
      } catch {
        filePath = join(dir, 'index.html')
      }
      const body = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('404')
    }
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

/** Identifica la version servida leyendo el nombre del fichero JavaScript. */
async function versionDeLaCarpeta(dir) {
  const html = await readFile(join(dir, 'index.html'), 'utf8')
  return /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1] ?? 'desconocida'
}

console.log('Preparando version ANTIGUA y version NUEVA...\n')

// 1. Se guarda una copia del build actual como "version antigua".
await rm(oldDir, { recursive: true, force: true })
await mkdir(oldDir, { recursive: true })
await cp(distDir, oldDir, { recursive: true })
const versionAntigua = await versionDeLaCarpeta(oldDir)

// 2. Se recompila: el nombre del JavaScript cambia, como en un despliegue real.
await run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], {
  cwd: projectDir,
  env: { ...process.env, GYMLOG_BASE: SUBPATH },
  shell: process.platform === 'win32',
})
const versionNueva = await versionDeLaCarpeta(distDir)

console.log(`version antigua: ${versionAntigua}`)
console.log(`version nueva:   ${versionNueva}\n`)

if (versionAntigua === versionNueva) {
  console.log('AVISO: el nombre no cambio, la prueba no seria concluyente.')
  process.exit(1)
}

// 3. Se sirve primero la antigua; luego se conmuta a la nueva, como un despliegue.
let sirviendoNueva = false
const server = await serveFrom(() => (sirviendoNueva ? distDir : oldDir))

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()

  const versionVisible = async () => {
    return page.evaluate(async () => {
      const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'))
      const registro = await navigator.serviceWorker.getRegistration()
      return {
        script: scripts.find((s) => s.includes('assets/')) ?? 'ninguno',
        cache: (await caches.keys()).join(','),
        activo: registro?.active?.state ?? 'sin-registro',
      }
    })
  }

  console.log('--- 1) Primera visita (como el dia que la instalaste) ---')
  await page.goto(`${ORIGIN}${SUBPATH}`, { waitUntil: 'networkidle' })
  await esperarApp(page, 20000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  let estado = await versionVisible()
  console.log(`    fichero en uso: ${estado.script.replace('/app/assets/', '')}`)
  console.log(`    service worker: ${estado.activo}, cache: ${estado.cache}`)

  console.log('\n--- 2) SE PUBLICA LA VERSION NUEVA (equivale a un git push) ---')
  sirviendoNueva = true
  await page.waitForTimeout(1000)
  estado = await versionVisible()
  console.log(`    sin recargar, sigue usando: ${estado.script.replace('/app/assets/', '')}`)

  console.log('\n--- 3) Aperturas sucesivas de la app ---')
  for (let apertura = 1; apertura <= 4; apertura += 1) {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    estado = await versionVisible()
    const esNueva = estado.script.includes(versionNueva.replace('.js', ''))
    console.log(
      `    apertura ${apertura}: ${estado.script.replace('/app/assets/', '')} ${esNueva ? '<-- YA ES LA NUEVA' : '(sigue la antigua)'}`,
    )
    if (esNueva) {
      console.log(`\nRESULTADO: la version nueva aparece en la apertura numero ${apertura}.`)
      break
    }
  }

  // 4. Comprobacion importante: los datos sobreviven a la actualizacion.
  console.log('\n--- 4) Los datos sobreviven a la actualizacion? ---')
  const datos = await page.evaluate(async () => {
    const bases = await indexedDB.databases()
    return bases.map((b) => b.name).filter(Boolean)
  })
  console.log(`    bases de datos en el dispositivo: ${datos.join(', ') || 'ninguna'}`)
} finally {
  await browser.close()
  server.close()
  await rm(oldDir, { recursive: true, force: true })
}
