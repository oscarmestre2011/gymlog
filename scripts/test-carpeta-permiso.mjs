/*
 * Prueba del caso que reporto el usuario: en el movil SE ELIGE la carpeta pero NO DEJA GUARDAR.
 *
 * Monta ese caso con piezas de verdad:
 *  - una carpeta REAL del navegador (el almacenamiento privado de la app), asi que las funciones
 *    de escritura son las autenticas: getFileHandle y createWritable;
 *  - el permiso, controlado a mano, para reproducir lo que hace un movil: al volver a la app el
 *    permiso de escritura ya no esta y hay que pedirlo;
 *  - el recuerdo de la carpeta, interceptado, porque un handle de verdad si se puede guardar en
 *    el movil pero en la prueba se sustituye por una carpeta simulada, y eso no es serializable.
 *    Lo que se intercepta es solo DONDE se guarda la carpeta, no como se escribe en ella.
 *
 * Lo que se comprueba, que es lo que fallaba: que al pulsar guardar la app PIDE el permiso (en
 * lugar de retirarse sin intentarlo) y que despues de concederlo la copia se escribe.
 *
 * Uso:  node scripts/test-carpeta-permiso.mjs [url]
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

  /* -------------------- Se prepara el escenario del móvil ------------------- */
  console.log('--- Preparando el escenario del móvil ---')
  const preparado = await page.evaluate(async () => {
    // Carpeta real, pero con la puerta del permiso controlada por nosotros.
    const real = await navigator.storage.getDirectory()
    window.__pedidosDePermiso = 0
    window.__escritos = []
    window.__permitido = false

    const carpeta = {
      kind: 'directory',
      name: 'Documentos',
      // Como en el movil: el permiso se ha retirado y hay que volver a pedirlo.
      queryPermission: async () => (window.__permitido ? 'granted' : 'prompt'),
      requestPermission: async () => {
        window.__pedidosDePermiso += 1
        window.__permitido = true // el usuario acepta el dialogo
        return 'granted'
      },
      // La escritura es la de verdad, sobre la carpeta real.
      getFileHandle: async (nombre, opciones) => {
        const manejador = await real.getFileHandle(nombre, opciones)
        const original = manejador.createWritable.bind(manejador)
        manejador.createWritable = async () => {
          const escritor = await original()
          const escribirOriginal = escritor.write.bind(escritor)
          escritor.write = async (datos) => {
            window.__escritos.push({ nombre, longitud: String(datos).length })
            return escribirOriginal(datos)
          }
          return escritor
        }
        return manejador
      },
    }

    window.showDirectoryPicker = async () => carpeta

    // Se intercepta SOLO el recuerdo de la carpeta (ver nota de arriba).
    const putOriginal = IDBObjectStore.prototype.put
    const getOriginal = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.put = function (valor, clave) {
      if (this.name === 'carpeta-copia') {
        window.__carpetaRecordada = valor
        return { onsuccess: null, onerror: null }
      }
      return putOriginal.call(this, valor, clave)
    }
    IDBObjectStore.prototype.get = function (clave) {
      if (this.name === 'carpeta-copia') {
        const peticion = { result: window.__carpetaRecordada ?? undefined, onsuccess: null, onerror: null }
        queueMicrotask(() => peticion.onsuccess?.())
        return peticion
      }
      return getOriginal.call(this, clave)
    }

    return { hayCarpetaReal: Boolean(real), nombre: real.name ?? 'opfs' }
  })
  check('Se prepara una carpeta real con el permiso retirado', preparado.hayCarpetaReal, JSON.stringify(preparado))

  /* --------------------------- Elegir la carpeta --------------------------- */
  console.log('\n--- El usuario elige la carpeta ---')
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Elegir carpeta/i }).click()
  await page.waitForTimeout(2000)

  const trasElegir = await page.evaluate(() => ({
    pedidos: window.__pedidosDePermiso,
    recordada: Boolean(window.__carpetaRecordada),
    permitido: window.__permitido,
  }))
  check('La carpeta queda elegida', trasElegir.recordada, JSON.stringify(trasElegir))
  check(
    'Al elegirla, la app pide el permiso de escritura',
    trasElegir.pedidos > 0,
    `${trasElegir.pedidos} veces`,
  )
  /*
   * OJO: no se puede buscar "permiso caducado" en toda la pantalla, porque ese texto aparece en
   * la explicacion informativa de Ajustes. Lo que hay que mirar es la linea del ESTADO.
   */
  const estadoCarpeta = await page.evaluate(() => {
    const filas = [...document.querySelectorAll('.kv')]
    const fila = filas.find((f) => /^\s*Carpeta/.test(f.textContent ?? ''))
    return fila?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  })
  check(
    'El estado NO queda como permiso caducado',
    estadoCarpeta.length > 0 && !/caducado/i.test(estadoCarpeta),
    estadoCarpeta || 'no se encontró la línea de estado',
  )

  /* --------------------- Guardar: aquí fallaba en el móvil ---------------- */
  console.log('\n--- El usuario pulsa guardar ---')
  // Se vuelve a retirar el permiso, para reproducir el caso exacto: al ir a guardar ya no está.
  await page.evaluate(() => {
    window.__permitido = false
    window.__pedidosDePermiso = 0
    window.__escritos = []
  })
  await page.getByRole('button', { name: /Guardar ahora/i }).click()
  await page.waitForTimeout(2500)

  const trasGuardar = await page.evaluate(() => ({
    pedidos: window.__pedidosDePermiso,
    escritos: window.__escritos,
  }))
  check(
    'Al guardar, la app VUELVE A PEDIR el permiso (antes se rendía)',
    trasGuardar.pedidos > 0,
    `${trasGuardar.pedidos} veces`,
  )
  check(
    'Y consigue escribir la copia',
    trasGuardar.escritos.length > 0,
    trasGuardar.escritos.map((e) => `${e.nombre} (${e.longitud} caracteres)`).join(', ') || 'no escribió nada',
  )
  check(
    'El archivo tiene la fecha en el nombre',
    /^kairos-copia-\d{4}-\d{2}-\d{2}\.json$/.test(trasGuardar.escritos[0]?.nombre ?? ''),
    trasGuardar.escritos[0]?.nombre ?? '',
  )

  const textoTrasGuardar = await page.locator('body').innerText()
  const aviso = /Copia guardada|No se pudo guardar|permiso/i.test(textoTrasGuardar)
  check('Informa del resultado al usuario', aviso, textoTrasGuardar.match(/(Copia guardada|No se pudo)[^\n]*/)?.[0] ?? 'sin aviso visible')
  check(
    'No dice que no ha podido guardar',
    !/No se pudo guardar/i.test(textoTrasGuardar),
    textoTrasGuardar.match(/No se pudo[^\n]*/)?.[0] ?? '',
  )

  /* --------------- Y la comprobación de que el archivo está ahí ------------ */
  const enCarpeta = await page.evaluate(async () => {
    const real = await navigator.storage.getDirectory()
    const nombres = []
    for await (const n of real.keys()) nombres.push(n)
    return nombres
  })
  check(
    'El archivo está de verdad en la carpeta',
    enCarpeta.some((n) => n.startsWith('kairos-copia-')),
    enCarpeta.join(', ') || 'carpeta vacía',
  )
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
