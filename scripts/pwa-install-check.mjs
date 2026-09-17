/*
 * Pregunta a Chrome, por su propio protocolo de depuracion (el que usa DevTools),
 * si la app se puede INSTALAR de verdad: si lanzaria el aviso de instalacion y,
 * si no, por que motivo.
 *
 * Chrome expone los motivos por los que rechaza instalar una app web. Esto
 * distingue "la app esta mal" de "el navegador no ofrece instalarla".
 *
 * Uso:  node scripts/pwa-install-check.mjs [url]
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'https://kairosentrena.com/app/'

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  // Se recogen los avisos de la consola que explican por que NO es instalable.
  const avisos = []
  cdp.on('Runtime.consoleAPICalled', (evento) => {
    const texto = (evento.args ?? [])
      .map((a) => a.value ?? a.description ?? '')
      .filter(Boolean)
      .join(' ')
    if (texto) avisos.push(texto)
  })

  console.log(`Analizando: ${url}\n`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  const resultado = await page.evaluate(async () => {
    if (!navigator.serviceWorker?.ready) return { error: 'sin service worker' }
    await navigator.serviceWorker.ready
    return { listo: true }
  })
  console.log(`service worker listo: ${JSON.stringify(resultado)}`)

  // Instalar y luego desinstalar: asi Chrome evalua la instalabilidad de verdad.
  // (getInstalledRelatedApps y Install no dan detalles, pero Page.getAppManifest si.)
  let manifiesto = null
  try {
    manifiesto = await cdp.send('Page.getAppManifest')
  } catch (error) {
    console.log(`Page.getAppManifest no disponible: ${String(error).split('\n')[0]}`)
  }

  if (manifiesto) {
    console.log('\n--- Segun Chrome ---')
    console.log(`  url del manifiesto: ${manifiesto.url ?? '(ninguna)'}`)
    console.log(`  errores del manifiesto: ${manifiesto.errors?.length ?? 0}`)
    for (const error of manifiesto.errors ?? []) {
      console.log(`    - [${error.critical ? 'CRITICO' : 'aviso'}] ${error.message} (línea ${error.line})`)
    }
    if (manifiesto.data) {
      const datos = JSON.parse(manifiesto.data)
      console.log(`  nombre: ${datos.name}`)
      console.log(`  display: ${datos.display}`)
      console.log(`  start_url: ${datos.start_url}`)
      console.log(`  iconos: ${(datos.icons ?? []).map((i) => i.sizes).join(', ')}`)
    }
  }

  // Comprobacion directa de la pantalla de instalacion de Chrome.
  console.log('\n--- Estado de instalacion segun Chrome ---')
  const instalada = await page.evaluate(async () => {
    if (!navigator.getInstalledRelatedApps) return 'no soportado'
    try {
      const apps = await navigator.getInstalledRelatedApps()
      return `${apps.length} apps relacionadas instaladas`
    } catch {
      return 'consulta fallida'
    }
  })
  console.log(`  getInstalledRelatedApps: ${instalada}`)

  const modo = await page.evaluate(() => ({
    standalone: matchMedia('(display-mode: standalone)').matches,
    navegador: matchMedia('(display-mode: browser)').matches,
    minimal: matchMedia('(display-mode: minimal-ui)').matches,
    fullscreen: matchMedia('(display-mode: fullscreen)').matches,
  }))
  console.log(`  modo de pantalla: ${JSON.stringify(modo)}`)

  const avisosRelevantes = avisos.filter((a) =>
    /install|manifest|service worker|icon|start_url|display/i.test(a),
  )
  if (avisosRelevantes.length > 0) {
    console.log('\n--- Avisos de la consola relacionados con la instalacion ---')
    for (const aviso of [...new Set(avisosRelevantes)]) console.log(`  ${aviso}`)
  } else {
    console.log('\n--- Sin avisos de instalacion en la consola: nada bloquea la instalacion ---')
  }
} finally {
  await browser.close()
}
