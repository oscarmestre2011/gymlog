/*
 * Prueba de las mejoras de pantalla y aviso.
 *
 * 1. La pantalla se mantiene encendida (bloqueo de pantalla), y se vuelve a pedir al
 *    recuperar el primer plano. Ese "volver a pedir" es imprescindible: el bloqueo se
 *    pierde al pasar a segundo plano y, si no se renueva, deja de funcionar en silencio.
 * 2. El aviso del descanso es mas largo que antes.
 * 3. Si el descanso termina mientras la app esta dormida (pantalla apagada), al volver
 *    suena y se ve el aviso — que es el caso que reporto el usuario.
 *
 * Uso:  node scripts/test-pantalla-aviso.mjs [url]
 */
import { chromium, devices } from 'playwright'
import { esperarApp } from './helpers.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:5273/'
const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'capturas')
mkdirSync(shotsDir, { recursive: true })

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? 'OK  ' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })

  /*
   * Se sustituye el bloqueo de pantalla del navegador por uno de mentira, para poder
   * observar cuantas veces se pide y cuando. Lo que se comprueba es la logica de la app,
   * no la del navegador.
   */
  await context.addInitScript(() => {
    const registro = { peticiones: 0, liberaciones: 0, activo: false, fallar: false }
    window.__bloqueo = registro
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      get: () => ({
        request: async () => {
          registro.peticiones += 1
          if (registro.fallar) throw new Error('bloqueado por el navegador')
          registro.activo = true
          return {
            released: false,
            release: async () => {
              registro.liberaciones += 1
              registro.activo = false
            },
          }
        },
      }),
    })
  })

  const page = await context.newPage()

  const leerBloqueo = () =>
    page.evaluate(() => {
      const r = window.__bloqueo
      return { ...r }
    })

  const ajustes = async (patch) => {
    await page.evaluate(async (valores) => {
      const peticion = indexedDB.open('gymlog')
      const db = await new Promise((resolve) => {
        peticion.onsuccess = () => resolve(peticion.result)
      })
      const almacen = db.transaction('settings', 'readwrite').objectStore('settings')
      const actual = await new Promise((resolve) => {
        const p = almacen.get('app')
        p.onsuccess = () => resolve(p.result ?? { id: 'app' })
      })
      await new Promise((resolve) => {
        const p = almacen.put({ ...actual, id: 'app', ...valores })
        p.onsuccess = () => resolve()
      })
    }, patch)
  }

  const abrir = async () => {
    await page.waitForTimeout(2200)
    if ((await page.locator('text=Bienvenido a').count()) > 0) {
      await page.getByText('Ya lo veré luego').click()
      await page.waitForTimeout(800)
    }
    await page.waitForSelector('.nav', { timeout: 25000 })
    await page.waitForTimeout(700)
  }

  /* --------------------------- 1. Pantalla encendida ------------------------ */
  console.log('\n--- 1. Mantener la pantalla encendida ---')
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await abrir()

  const bloqueoInicial = await leerBloqueo()
  check('Se pide mantener la pantalla encendida al abrir', bloqueoInicial.peticiones >= 1, `${bloqueoInicial.peticiones} peticiones`)
  check('El bloqueo queda activo', bloqueoInicial.activo === true)
  check('No se suelta el bloqueo al arrancar', bloqueoInicial.liberaciones === 0, `${bloqueoInicial.liberaciones} liberaciones`)

  /* ------------- 2. Se vuelve a pedir al recuperar el primer plano ---------- */
  console.log('\n--- 2. Al volver a la app se vuelve a pedir ---')
  const antesDeOcultar = (await leerBloqueo()).peticiones
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(900)
  const despuesDeVolver = await leerBloqueo()
  check(
    'Se vuelve a pedir el bloqueo al recuperar el primer plano',
    despuesDeVolver.peticiones > antesDeOcultar,
    `${antesDeOcultar} -> ${despuesDeVolver.peticiones} peticiones`,
  )
  check('Y queda activo otra vez', despuesDeVolver.activo === true)

  /* ------------------- 3. Se puede desactivar desde Ajustes ---------------- */
  console.log('\n--- 3. Desactivarlo desde Ajustes ---')
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(900)
  const ajustesTexto = await page.locator('body').innerText()
  check('Ajustes explica el estado de la pantalla', /Estado/.test(ajustesTexto) && /mantenida encendida/.test(ajustesTexto), ajustesTexto.match(/Estado[^\n]*\n[^\n]*/)?.[0]?.replace(/\n/g, ' ') ?? '')

  await page.locator('text=Mantener la pantalla encendida').first().click()
  await page.waitForTimeout(900)
  const trasDesactivar = await leerBloqueo()
  check('Al desactivarlo se suelta el bloqueo', trasDesactivar.activo === false)
  check('Y se suelta de verdad (no se queda colgado)', trasDesactivar.liberaciones >= 1, `${trasDesactivar.liberaciones} liberaciones`)

  await page.locator('text=Mantener la pantalla encendida').first().click()
  await page.waitForTimeout(900)
  check('Al volver a activarlo se pide otra vez', (await leerBloqueo()).activo === true)

  /* ----------------- 4. El aviso es más largo que antes -------------------- */
  console.log('\n--- 4. Duración del aviso ---')
  const duraciones = await page.evaluate(() => {
    // Se lee el texto que la app muestra en Ajustes con la duración del aviso.
    const texto = document.body.innerText
    return texto.match(/El aviso sonoro dura unos ([\d.,]+) s/)?.[1] ?? '?'
  })
  check('Ajustes dice cuánto dura el aviso', duraciones !== '?', `${duraciones} s`)
  check('El aviso por defecto dura más de un segundo', Number(String(duraciones).replace(',', '.')) > 1, `${duraciones} s`)

  await page.locator('.modal-backdrop').count() // no-op para mantener el flujo
  await page.screenshot({ path: join(shotsDir, '29-ajustes-pantalla.png') })

  /* ------- 5. El descanso termina con la app dormida: suena al volver ------ */
  console.log('\n--- 5. Descanso terminado mientras la app estaba dormida ---')

  /*
   * Se pone el descanso por defecto en 10 segundos para que la prueba sea rapida y, sobre
   * todo, DETERMINISTA: el cronometro se mide contra el reloj real, asi que falsearlo
   * (con el reloj simulado de Playwright o tocando el almacenamiento) no sirve. Se
   * intentaron las dos y el cronometro seguia con su cuenta atras.
   */
  /*
   * Se apunta una serie para arrancar el descanso. Pero el cronometro usa el descanso del
   * EJERCICIO (en Fuerza A la sentadilla tiene 2:30), no el de ajustes, asi que antes se
   * deja el primer ejercicio de la sesion con 10 segundos: la prueba es rapida y, sobre
   * todo, DETERMINISTA, porque el cronometro se mide contra el reloj real.
   */
  await page.getByRole('button', { name: /Inicio/ }).click()
  await page.waitForTimeout(800)
  await page.getByText('Empezar entrenamiento').click()
  await page.waitForSelector('.modal', { timeout: 12000 })
  await page.locator('.modal .list-item', { hasText: 'Fuerza A' }).first().click()
  await page.waitForSelector('.exercise-card', { timeout: 12000 })

  const sesionPreparada = await page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve) => {
      peticion.onsuccess = () => resolve(peticion.result)
    })
    const almacen = db.transaction('sessions', 'readwrite').objectStore('sessions')
    const sesiones = await new Promise((resolve) => {
      const p = almacen.getAll()
      p.onsuccess = () => resolve(p.result ?? [])
    })
    const abierta = sesiones.find((s) => s.endedAt === null)
    if (!abierta) return false
    const instantanea = abierta.routineSnapshot.map((e, i) =>
      i === 0 ? { ...e, restSeconds: 10 } : e,
    )
    await new Promise((resolve) => {
      const p = almacen.put({ ...abierta, routineSnapshot: instantanea })
      p.onsuccess = () => resolve()
    })
    return true
  })
  check('Se prepara la sesión con un descanso corto', sesionPreparada)

  // Recargar aplica el cambio: la sesion abierta se recupera sola.
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
  await esperarApp(page)
  await page.waitForSelector('.exercise-card', { timeout: 15000 })

  const tarjeta = page.locator('.exercise-card').first()
  await tarjeta.locator('input[aria-label="Peso de la nueva serie"]').fill('50')
  await tarjeta.locator('input[aria-label="Repeticiones de la nueva serie"]').fill('10')
  await tarjeta.locator('button[aria-label="Guardar serie"]').click()
  await page.waitForTimeout(1000)
  check('El cronómetro de descanso está en marcha', await page.locator('.rest-bar').isVisible())
  const reloj = await page.locator('.rest-bar .clock').innerText()
  check('El descanso es corto (10 s), para poder probarlo sin esperar', /^00:0\d\d?$/.test(reloj), reloj)

  // La pantalla se apaga justo despues: la app queda dormida durante el descanso entero.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  console.log('   (simulando pantalla apagada 13 segundos, mas que el descanso...)')
  await page.waitForTimeout(13000)

  /*
   * OJO con esta comprobacion: en el navegador de pruebas (sin pantalla de verdad) los
   * temporizadores siguen corriendo aunque se simule que la pagina esta oculta, asi que
   * aqui el aviso SI sale durante la "pantalla apagada". En un movil de verdad el
   * navegador congela la app y el aviso no saldria hasta encender la pantalla.
   * Por eso no se comprueba que NO salga: no es reproducible aqui. Lo que si se comprueba
   * es que, pase lo que pase, el aviso acaba saliendo al volver.
   */
  const dormida = await page.evaluate(() => document.querySelector('.rest-done-text')?.textContent ?? '')
  console.log(`   aviso durante la "pantalla apagada": ${dormida ? `"${dormida}" (en este entorno los temporizadores no se congelan)` : 'ninguno'}`)

  // Se enciende la pantalla: ahora la app se pone al dia y avisa.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(400)
  const alVolver = await page.locator('.rest-bar').innerText()
  check(
    'Al volver la pantalla, avisa de que el descanso terminó',
    /Descanso terminado/i.test(alVolver),
    alVolver.replace(/\n/g, ' | '),
  )
  await page.screenshot({ path: join(shotsDir, '30-aviso-descanso.png') })

  // Y el bloqueo de pantalla se recupera en ese mismo momento.
  const trasVolver = await leerBloqueo()
  check('La pantalla vuelve a mantenerse encendida al recuperar la app', trasVolver.activo === true)

  // El aviso termina solo y la barra deja de parpadear.
  await page.waitForTimeout(4000)
  check('El aviso termina solo y la barra deja de parpadear', (await page.locator('.rest-bar.sonando').count()) === 0)

  /* --------- 6. Con la app delante: el aviso se ve y parpadea ------------- */
  console.log('\n--- 6. El aviso con la app delante ---')
  /*
   * Se deja terminar un descanso de verdad, con la app delante. Es el caso natural y el
   * unico fiable: escribir la hora de fin en el almacenamiento NO sirve (el cronometro vivo
   * usa su propio estado y no lo relee), y el reloj simulado de Playwright tampoco engancha
   * con los temporizadores de React. Se comprobaron las dos cosas.
   */
  await ajustes({ alertLength: 'muy-largo' })

  const tarjeta2 = page.locator('.exercise-card').first()
  await tarjeta2.locator('input[aria-label="Peso de la nueva serie"]').fill('50')
  await tarjeta2.locator('input[aria-label="Repeticiones de la nueva serie"]').fill('10')
  await tarjeta2.locator('button[aria-label="Guardar serie"]').click()

  // El descanso es de 10 s: se espera a que termine, mirando cada segundo.
  let avisoVisto = false
  let parpadeoVisto = false
  let textoAviso = ''
  for (let segundo = 0; segundo < 16; segundo += 1) {
    await page.waitForTimeout(1000)
    const info = await page.evaluate(() => {
      const barra = document.querySelector('.rest-bar')
      return {
        texto: document.querySelector('.rest-done-text')?.textContent ?? '',
        clase: barra ? barra.className : '',
      }
    })
    if (info.texto && !avisoVisto) {
      avisoVisto = true
      textoAviso = info.texto
    }
    // El parpadeo dura poco: se mira en cuanto aparece el texto.
    if (info.texto && info.clase.includes('sonando')) parpadeoVisto = true
    if (avisoVisto && parpadeoVisto) break
  }

  check('Con la app delante, el aviso aparece al terminar el descanso', avisoVisto, textoAviso)
  check(
    'La barra parpadea mientras suena (se ve aunque no se oiga)',
    parpadeoVisto,
    parpadeoVisto ? 'parpadeo visto' : 'no se llego a ver la barra parpadeando',
  )
  await page.screenshot({ path: join(shotsDir, '31-aviso-parpadeo.png') })
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
