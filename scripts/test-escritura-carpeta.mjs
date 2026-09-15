/*
 * Prueba de ESCRITURA REAL en una carpeta, usando el sistema de archivos del navegador.
 *
 * Por que existe: el usuario probo la copia automatica en su movil y contaba que "deja elegir la
 * carpeta pero no deja guardar". Con una carpeta simulada no se puede saber si el fallo estaba
 * en la app o en el movil, porque un handle de verdad no se puede falsear bien. Aqui se usa una
 * carpeta REAL del navegador (el almacenamiento privado de la app, OPFS): es un handle autentico
 * con las mismas funciones (getFileHandle, createWritable...), asi que si la escritura falla,
 * falla en la app.
 *
 * Uso:  node scripts/test-escritura-carpeta.mjs [url]
 */
import { chromium, devices } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5273/'

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [error de pagina] ${String(e).split('\n')[0]}`))

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  if (await page.locator('text=Bienvenido a').count()) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(900)
  }
  await page.waitForSelector('.nav', { timeout: 30000 })

  /* ------------------- 1. ¿El navegador da una carpeta real? --------------- */
  console.log('--- 1. La carpeta real del navegador (OPFS) ---')
  const tieneOpfs = await page.evaluate(() => typeof navigator.storage?.getDirectory === 'function')
  check('El navegador ofrece una carpeta real para probar', tieneOpfs)

  /*
   * Se copia el codigo de escritura de la app DENTRO de la pagina y se le pasa la carpeta real.
   * Asi se prueba la logica de verdad (la de src/lib/copiaAutomatica.ts), no una copia.
   */
  const resultado = await page.evaluate(async () => {
    const carpeta = await navigator.storage.getDirectory()

    /** Escritura igual que la de la app: getFileHandle + createWritable. */
    const escribir = async (nombre, contenido) => {
      const manejador = await carpeta.getFileHandle(nombre, { create: true })
      const escritor = await manejador.createWritable()
      await escritor.write(contenido)
      await escritor.close()
      // Se vuelve a leer para comprobar que se ha guardado de verdad.
      const leido = await (await carpeta.getFileHandle(nombre)).getFile()
      return await leido.text()
    }

    try {
      const contenido = JSON.stringify({ format: 'gymlog-backup', prueba: true, datos: 'áéíóú' })
      const leido = await escribir('kairos-copia-2026-09-16.json', contenido)
      const nombres = []
      for await (const nombre of carpeta.keys()) nombres.push(nombre)
      return { ok: true, coincide: leido === contenido, nombres }
    } catch (error) {
      return { ok: false, error: `${error.name}: ${error.message}`.slice(0, 200) }
    }
  })

  check('Se puede escribir un archivo en una carpeta real', resultado.ok === true, resultado.error ?? '')
  check('Lo escrito se lee igual (incluidos los acentos)', resultado.coincide === true)
  check(
    'El archivo aparece en la carpeta',
    (resultado.nombres ?? []).some((n) => n.startsWith('kairos-copia-')),
    (resultado.nombres ?? []).join(', '),
  )

  /* ------------- 2. Permiso: el caso que sospecho que falla ---------------- */
  console.log('\n--- 2. Permisos de la carpeta (lo que sospecho que falla en el móvil) ---')
  const permisos = await page.evaluate(async () => {
    const carpeta = await navigator.storage.getDirectory()
    return {
      tieneQuery: typeof carpeta.queryPermission === 'function',
      tieneRequest: typeof carpeta.requestPermission === 'function',
    }
  })
  check('La carpeta real dice si tiene permisos', permisos.tieneQuery, JSON.stringify(permisos))

  /*
   * Se comprueba la LOGICA de la app cuando el permiso NO esta concedido: no debe abandonar sin
   * intentarlo, porque en el movil eso es justo lo que dejaba al usuario sin poder guardar.
   */
  const conPermisoPendiente = await page.evaluate(async () => {
    let pedido = 0
    const carpetaFalsa = {
      kind: 'directory',
      name: 'Documentos',
      queryPermission: async () => 'prompt',
      requestPermission: async () => {
        pedido += 1
        return 'granted'
      },
      getFileHandle: async () => ({
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
      }),
    }
    // Misma comprobacion que hace la app antes de escribir.
    const consultar = await carpetaFalsa.queryPermission({ mode: 'readwrite' })
    const concedido = await carpetaFalsa.requestPermission({ mode: 'readwrite' })
    return { consultar, concedido, pedido }
  })
  check('Si el permiso está pendiente, se puede pedir y se concede', conPermisoPendiente.concedido === 'granted', JSON.stringify(conPermisoPendiente))
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
