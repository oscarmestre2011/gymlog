/*
 * Prueba de la tarjeta "Apoyar el proyecto" (donacion voluntaria por PayPal).
 *
 * Lo que se comprueba no es que los botones existan, sino lo que hace que esto sea una donacion y
 * no una venta encubierta:
 *  1. Que los enlaces lleven a PayPal por https, con su importe, y se abran aparte (noopener).
 *  2. Que el texto diga que NO desbloquea nada. Si desbloqueara algo, seria una venta: con IVA que
 *     ingresar y con 14 dias de derecho de desistimiento.
 *  3. Que no diga que desgrava (las donaciones a particulares no desgravan).
 *  4. Que no se prometa nada a cambio.
 *
 * Uso:  node scripts/test-apoyo.mjs [url]
 */
import { chromium, devices } from 'playwright'
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
  // OJO: nada de `offline: true` aqui. El contexto sin conexion no puede ni cargar la pagina
  // (ERR_INTERNET_DISCONNECTED). Para probar el modo avion hay que cargar primero y desconectar
  // despues, y eso ya lo hace la prueba de conexion.
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).split('\n')[0]))

  // Se abre directamente en Ajustes, sin pasar por la bienvenida: se siembra la app antes.
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2200)
  if (await page.locator('text=Bienvenido a').count()) {
    await page.getByText('Ya lo veré luego').click()
    await page.waitForTimeout(800)
  }
  await page.waitForSelector('.nav', { timeout: 25000 })

  console.log('--- 1. La tarjeta está en Ajustes ---')
  /*
   * Ojo con el selector: "Ajustes" aparece en varios sitios (la barra de abajo y el título de la
   * propia pantalla). Si se coge el primero que aparezca, se pulsa el titulo y no se navega a
   * ningun sitio. Ya ha pasado tres veces en este proyecto con nombres repetidos.
   */
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(1200)
  const enAjustes = await page.locator('body').innerText()
  check('Se entra en Ajustes', /Acerca de/i.test(enAjustes), enAjustes.slice(0, 60).replace(/\n/g, ' '))

  const tarjeta = page.locator('.card', { hasText: 'Apoyar el proyecto' }).first()
  check('La tarjeta de apoyo está en Ajustes', (await tarjeta.count()) === 1)

  if ((await tarjeta.count()) === 0) {
    throw new Error('Sin tarjeta de apoyo no se puede seguir: revisa que esté en SettingsScreen')
  }

  const texto = await tarjeta.innerText()
  await tarjeta.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(shotsDir, '53-apoyo.png'), fullPage: true })

  console.log('--- 2. Los enlaces de pago ---')
  const enlaces = tarjeta.locator('a')
  const cuantos = await enlaces.count()
  check('Hay una opción por cada cantidad sugerida y una libre', cuantos === 4, `${cuantos} enlaces`)

  const datos = await enlaces.evaluateAll((nodos) =>
    nodos.map((n) => ({
      href: n.getAttribute('href'),
      rel: n.getAttribute('rel'),
      target: n.getAttribute('target'),
      texto: n.textContent?.trim(),
    })),
  )
  check(
    'Todos los enlaces llevan a PayPal por https',
    datos.every((d) => /^https:\/\/paypal\.me\/[A-Za-z0-9._-]+/.test(d.href ?? '')),
    datos.map((d) => d.href).join(' '),
  )
  check(
    'Las cantidades llevan su importe en el enlace',
    datos.filter((d) => /\d+EUR$/.test(d.href ?? '')).length === 3,
    datos.map((d) => d.href).join(' '),
  )
  check(
    'Se abren fuera de la app',
    datos.every((d) => d.target === '_blank' && (d.rel ?? '').includes('noopener')),
    datos.map((d) => `${d.target}/${d.rel}`).join(' '),
  )
  check(
    'No hay cantidades ridículas (PayPal se queda casi el 15 % de las pequeñas)',
    !datos.some((d) => /\/[1-4]EUR$/.test(d.href ?? '')),
    datos.map((d) => d.texto).join(', '),
  )

  /*
   * Este es el fallo que se escapo a la primera version: los enlaces salian azules y subrayados,
   * como enlaces de navegador, porque `.btn` esta pensado para `<button>` y en un `<a>` el
   * navegador pinta su color por defecto. Se vio mirando una captura, no con una comprobacion.
   */
  console.log('--- 2b. Que parezcan botones y no enlaces del navegador ---')
  const aspecto = await enlaces.evaluateAll((nodos) =>
    nodos.map((n) => {
      const estilo = getComputedStyle(n)
      return {
        color: estilo.color,
        subrayado: estilo.textDecorationLine,
        fondo: estilo.backgroundColor,
      }
    }),
  )
  check(
    'Ninguno sale azul de enlace',
    aspecto.every((a) => !/rgb\(0,\s*0,\s*238\)|rgb\(0,\s*0,\s*255\)/.test(a.color)),
    aspecto.map((a) => a.color).join(' '),
  )
  check(
    'Ninguno sale subrayado',
    aspecto.every((a) => a.subrayado === 'none'),
    aspecto.map((a) => a.subrayado).join(' '),
  )
  // Los tres de cantidad llevan fondo de boton. "Otra cantidad" es a proposito transparente
  // (boton fantasma), asi que se comprueba solo en los tres primeros.
  check(
    'Los tres botones de cantidad tienen fondo de botón',
    aspecto.slice(0, 3).every((a) => a.fondo !== 'rgba(0, 0, 0, 0)'),
    aspecto.map((a) => a.fondo).join(' '),
  )

  console.log('--- 3. Lo que dice el texto (y lo que no puede decir) ---')
  check('Dice que es una donación voluntaria', /donación voluntaria/i.test(texto))
  check('Dice que la app es gratis', /gratis/i.test(texto))
  check('Dice que no hay anuncios ni suscripciones', /sin anuncios/i.test(texto) && /suscripciones/i.test(texto))
  check('Avisa de que NO desbloquea nada', /no desbloquea nada/i.test(texto))
  check('Aclara que no desgrava', /(no|nunca|tampoco)\s+(?:te\s+)?desgrav/i.test(texto))
  check('Nombra a PayPal, para que se sepa dónde se paga', /PayPal/i.test(texto))
  check(
    'No promete nada a cambio',
    !/acceso|soporte prioritario|funciones? extra|contenido exclusivo|versión completa/i.test(texto),
  )

  console.log('--- 4. Nada de ventanas ni avisos molestos ---')
  // Al abrir Inicio y entrenar no debe aparecer nada de donaciones: eso quema a quien entrena.
  await page.locator('.nav button', { hasText: 'Inicio' }).click()
  await page.waitForTimeout(900)
  const inicio = await page.locator('body').innerText()
  check('En Inicio no se pide dinero', !/donación|donar|paypal/i.test(inicio))

  console.log('--- 5. Y funciona con el móvil en modo avión ---')
  // El gimnasio suele estar sin cobertura: si la tarjeta de apoyo rompiera el arranque offline,
  // seria el peor sitio posible para fallar.
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nav', { timeout: 25000 })
  await page.waitForTimeout(1500)
  const sinRed = await page.locator('body').innerText()
  check('La app abre sin conexión', /Hoy|Inicio|Rutinas/i.test(sinRed))
  check('Y sigue funcionando sin conexión', !/no se pudo|error de conexión|sin conexión a internet/i.test(sinRed))
  await context.setOffline(false)

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '))
} catch (error) {
  check('La prueba ha terminado sin errores', false, String(error))
} finally {
  await browser.close()
}

const fallos = results.filter((r) => !r.ok)
console.log(`\n${results.length - fallos.length}/${results.length} comprobaciones correctas`)
if (fallos.length) {
  console.log('\nFallos:')
  for (const f of fallos) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
  process.exit(1)
}
