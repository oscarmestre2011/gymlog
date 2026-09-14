/*
 * Diagnostico: comprueba si una pagina es "contexto seguro" y si puede registrar
 * un service worker, con y sin la excepcion de Chromium.
 *
 * Uso: node scripts/secure-context-check.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function serve(host, port) {
  const server = createServer(async (req, res) => {
    try {
      const relative = decodeURIComponent(new URL(req.url, `http://${host}:${port}`).pathname)
        .replace(/^\/+/, '') || 'index.html'
      const body = await readFile(join(distDir, relative))
      res.writeHead(200, { 'Content-Type': MIME[extname(relative)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('404')
    }
  })
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)))
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')) return item.address
    }
  }
  return null
}

async function probe(url, args = []) {
  const browser = await chromium.launch({ args })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const info = await page.evaluate(() => ({
      secure: window.isSecureContext,
      swApi: 'serviceWorker' in navigator,
      origin: location.origin,
    }))
    let registration = 'no-intentado'
    if (info.swApi) {
      registration = await page.evaluate(async () => {
        try {
          const reg = await navigator.serviceWorker.register('./sw.js')
          return reg.active?.state ?? reg.installing?.state ?? 'registrado'
        } catch (error) {
          return `error: ${String(error)}`
        }
      })
      await page.waitForTimeout(1500)
    }
    return { url, args: args.length > 0, ...info, registration, errors }
  } finally {
    await browser.close()
  }
}

const ip = lanAddress()
console.log('Direccion de red local:', ip)

const localServer = await serve('127.0.0.1', 5397)
console.log('\n1) localhost (contexto seguro por definicion)')
console.log(JSON.stringify(await probe('http://localhost:5397/'), null, 2))
localServer.close()

if (ip) {
  const server = await serve(ip, 5396)
  const origin = `http://${ip}:5396`
  console.log('\n2) IP de red, SIN excepcion')
  console.log(JSON.stringify(await probe(`${origin}/`), null, 2))
  console.log('\n3) IP de red, CON --unsafely-treat-insecure-origin-as-secure')
  console.log(
    JSON.stringify(
      await probe(`${origin}/`, [`--unsafely-treat-insecure-origin-as-secure=${origin}`]),
      null,
      2,
    ),
  )
  server.close()
}
