/*
 * Comprueba los requisitos que exige un navegador para INSTALAR una app web
 * (no solo anadir un acceso directo):
 *   - HTTPS (contexto seguro)
 *   - manifiesto con nombre, iconos de 192 y 512, start_url y display
 *   - service worker activo con manejador de fetch (para que funcione offline)
 *
 * Uso:  node scripts/installability.mjs [url]
 */
import { chromium, devices } from 'playwright'

const url = process.argv[2] ?? 'https://oscarmestre2011.github.io/gymlog/'

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log(`Analizando: ${url}\n`)

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  // Se recarga para que el service worker tome el control.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  const info = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]')
    const manifestUrl = link ? new URL(link.getAttribute('href'), location.href).href : null
    let manifest = null
    if (manifestUrl) {
      const response = await fetch(manifestUrl)
      if (response.ok) manifest = await response.json()
    }
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null
    return {
      secure: window.isSecureContext,
      protocolo: location.protocol,
      manifestUrl,
      manifest,
      swControla: Boolean(navigator.serviceWorker?.controller),
      swEstado: registration?.active?.state ?? null,
      swAmbito: registration ? new URL(registration.scope).pathname : null,
      // En Android, Chrome expone si la app ya esta instalada.
      modoPantalla: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'navegador',
      pantallaInicio: matchMedia('(display-mode: minimal-ui)').matches,
    }
  })

  check('Se sirve por HTTPS (contexto seguro)', info.secure && info.protocolo === 'https:', `${info.protocolo} secure=${info.secure}`)
  check('El service worker esta activo', info.swEstado === 'activated', String(info.swEstado))
  check('El service worker tiene el ambito correcto', info.swAmbito === '/gymlog/', String(info.swAmbito))
  check('El service worker controla la pagina', info.swControla)

  const m = info.manifest
  check('El manifiesto se carga', m !== null, String(info.manifestUrl))
  if (m) {
    check('Tiene nombre', Boolean(m.name), m.name)
    check('Tiene nombre corto', Boolean(m.short_name), m.short_name)
    check('Declara modo aplicacion (standalone)', m.display === 'standalone', String(m.display))
    check('Tiene start_url', Boolean(m.start_url), String(m.start_url))
    check('Tiene theme_color', Boolean(m.theme_color), String(m.theme_color))

    const sizes = (m.icons ?? []).map((i) => i.sizes)
    check('Tiene icono de 192x192', sizes.includes('192x192'), sizes.join(', '))
    check('Tiene icono de 512x512', sizes.includes('512x512'), sizes.join(', '))

    const iconos = await page.evaluate(async (icons) => {
      const out = []
      for (const icon of icons) {
        try {
          const r = await fetch(new URL(icon.src, location.href).href)
          out.push(`${icon.sizes}:${r.status}`)
        } catch {
          out.push(`${icon.sizes}:error`)
        }
      }
      return out
    }, m.icons)
    check('Todos los iconos del manifiesto se descargan', iconos.every((i) => i.endsWith(':200')), iconos.join(' '))
  }

  console.log('')
  console.log('--- Lo que Chrome informa en este momento ---')
  console.log(`  modo de pantalla: ${info.modoPantalla}`)
  console.log(`  (si pusiera "standalone", la app ya estaria instalada de verdad)`)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length}/${results.length} requisitos de instalacion correctos`)
if (failed.length > 0) {
  console.log('Faltan requisitos:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
  process.exit(1)
}
