/*
 * Prueba: que guardar la carpeta de las copias NO de error.
 *
 * EL FALLO QUE SE PROTEGE AQUI
 * ----------------------------
 * En el movil del usuario salia "no se ha podido recordar la carpeta". El motivo estaba oculto, y
 * resulto ser un fallo real: el almacen se declara con clave propia (`'carpeta-copia': 'clave'`) y
 * la clave se pasaba APARTE como segundo argumento de `put`. El navegador respondia:
 *
 *   DataError: the object store uses in-line keys and the key parameter was provided
 *
 * En el navegador de escritorio colaba; en el del movil, no. Esta prueba comprueba las dos formas
 * de guardar: la correcta (la clave dentro del objeto) y la que fallaba, para que quede claro cual
 * es cual y no se vuelva a escribir mal.
 *
 * LIMITE CONOCIDO: no se puede comprobar aqui que un descriptor de carpeta de verdad sobreviva a
 * un cierre del navegador. El navegador de pruebas sin pantalla se cae al deserializarlo (fallo
 * suyo, no de la app). Eso solo se puede comprobar en un movil de verdad.
 *
 * Uso:  node scripts/test-guardar-carpeta.mjs [url]
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

  /* ------------------- 1. El almacén existe y con clave ------------------- */
  console.log('--- 1. El almacén de la carpeta ---')
  const almacen = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const peticion = indexedDB.open('gymlog')
      peticion.onsuccess = () => resolve(peticion.result)
      peticion.onerror = () => reject(peticion.error)
    })
    const nombres = [...db.objectStoreNames]
    let clave = 'no se pudo leer'
    if (nombres.includes('carpeta-copia')) {
      const tx = db.transaction('carpeta-copia', 'readonly')
      clave = tx.objectStore('carpeta-copia').keyPath
    }
    db.close()
    return { nombres: nombres.join(', '), clave }
  })
  check('Existe el almacén para la carpeta', almacen.nombres.includes('carpeta-copia'), almacen.nombres)
  check(
    'El almacén usa clave propia (por eso la clave va DENTRO del objeto)',
    almacen.clave === 'clave',
    `clave: ${almacen.clave}`,
  )

  /* ------- 2. Guardar como lo hace la app: sin error y con la forma bien --- */
  console.log('\n--- 2. Guardar la carpeta como lo hace la app ---')
  const resultado = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const peticion = indexedDB.open('gymlog')
      peticion.onsuccess = () => resolve(peticion.result)
      peticion.onerror = () => reject(peticion.error)
    })

    /** Guarda de una forma y devuelve si ha fallado y con qué. */
    const intentar = async (valor, conClaveAparte) => {
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('carpeta-copia', 'readwrite')
          const almacen = tx.objectStore('carpeta-copia')
          if (conClaveAparte) {
            almacen.put(valor, 'carpeta-copia') // ASI FALLABA en el movil
          } else {
            almacen.put(valor) // asi se hace bien: la clave va dentro
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error ?? new Error('cancelada'))
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, motivo: `${error.name}: ${error.message}`.slice(0, 140) }
      }
    }

    const correcto = await intentar({ clave: 'carpeta-copia', carpeta: { kind: 'directory', name: 'Documentos' } }, false)
    const incorrecto = await intentar({ clave: 'carpeta-copia', carpeta: { kind: 'directory' } }, true)

    // Y se mira la forma de lo guardado.
    const guardado = await new Promise((resolve) => {
      const peticion = db.transaction('carpeta-copia', 'readonly').objectStore('carpeta-copia').get('carpeta-copia')
      peticion.onsuccess = () => resolve(peticion.result ?? null)
      peticion.onerror = () => resolve(null)
    })

    // Se limpia para no dejar basura en la app.
    await new Promise((resolve) => {
      const tx = db.transaction('carpeta-copia', 'readwrite')
      tx.objectStore('carpeta-copia').delete('carpeta-copia')
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
    return { correcto, incorrecto, guardado }
  })

  check('Guardar como lo hace la app NO da error', resultado.correcto.ok === true, resultado.correcto.motivo ?? '')
  check(
    'Y lo que queda guardado tiene la forma que la app espera',
    resultado.guardado?.clave === 'carpeta-copia' && Boolean(resultado.guardado?.carpeta),
    JSON.stringify(resultado.guardado ?? {}),
  )
  check(
    'La forma que fallaba en el móvil SÍ falla (queda documentada)',
    resultado.incorrecto.ok === false,
    resultado.incorrecto.motivo ?? 'no falló (¿cambió el navegador?)',
  )

  /* ------------------- 3. La app avisa del motivo ------------------------- */
  console.log('\n--- 3. Si no se puede recordar, la app dice por qué ---')
  // Se simula que el navegador no sabe guardar la carpeta, y se comprueba que el aviso lo dice.
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => ({
      kind: 'directory',
      name: 'Documentos',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      // No se puede guardar en la base de datos: esto es lo que fallaba en el movil.
      toJSON() {
        throw new Error('no serializable')
      },
      getFileHandle: async () => ({
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
      }),
    })
  })
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Elegir carpeta/i }).click()
  await page.waitForTimeout(2000)

  const texto = await page.locator('body').innerText()
  check(
    'El aviso incluye el MOTIVO, no solo que ha fallado',
    /No se ha podido recordar la carpeta \(.+\)/.test(texto.replace(/\n/g, ' ')),
    texto.replace(/\n/g, ' ').match(/No se ha podido recordar[^.]*/)?.[0] ?? 'no avisa',
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
