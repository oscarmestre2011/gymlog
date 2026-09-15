/*
 * Prueba del aviso de copia de seguridad.
 *
 * Es la unica proteccion real de los datos (viven solo en el movil), asi que se comprueba
 * que avisa cuando toca, que NO avisa cuando no toca, que se puede descartar y que el
 * boton descarga de verdad un archivo con los datos.
 *
 * Uso:  node scripts/test-backup-reminder.mjs [url]
 */
import { chromium, devices } from 'playwright'
import { readFile } from 'node:fs/promises'
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
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'es-ES',
    acceptDownloads: true,
  })
  const page = await context.newPage()

  /** Deja los ajustes y los datos como se pida, sin pasar por la interfaz. */
  const preparar = async ({ sesiones = 0, ultimaCopiaHace = null, intervalo = 7 }) => {
    await page.evaluate(
      async ({ sesiones, ultimaCopiaHace, intervalo }) => {
        const peticion = indexedDB.open('gymlog')
        const db = await new Promise((resolve) => {
          peticion.onsuccess = () => resolve(peticion.result)
        })

        // Ajustes: intervalo y fecha de ultima copia.
        const ajustes = db.transaction('settings', 'readwrite').objectStore('settings')
        const actual = await new Promise((resolve) => {
          const p = ajustes.get('app')
          p.onsuccess = () => resolve(p.result ?? { id: 'app' })
        })
        await new Promise((resolve) => {
          const p = ajustes.put({
            ...actual,
            id: 'app',
            backupReminderDays: intervalo,
            lastBackupAt: ultimaCopiaHace === null ? undefined : Date.now() - ultimaCopiaHace * 86400000,
          })
          p.onsuccess = () => resolve()
        })

        // Sesiones: se borran y se crean las que hagan falta.
        const almacen = db.transaction('sessions', 'readwrite').objectStore('sessions')
        almacen.clear()
        const ahora = Date.now()
        const hoy = new Date()
        const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
        for (let i = 0; i < sesiones; i += 1) {
          almacen.put({
            id: `prueba_sesion_${i}`,
            date: fecha,
            routineName: 'Fuerza A',
            routineSnapshot: [],
            startedAt: ahora - 3600000,
            endedAt: ahora,
            metrics: {},
          })
        }
        await new Promise((resolve) => {
          almacen.transaction.oncomplete = resolve
        })

        // Se olvida el descarte previo del aviso.
        localStorage.removeItem('gymlog.avisoCopiaDescartado')
      },
      { sesiones, ultimaCopiaHace, intervalo },
    )
  }

  const abrirInicio = async () => {
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(2200)
    if ((await page.locator('text=Bienvenido a').count()) > 0) {
      await page.getByText('Ya lo veré luego').click()
      await page.waitForTimeout(800)
    }
    await page.waitForSelector('.nav', { timeout: 25000 })
    await page.waitForTimeout(800)
  }

  /* ------------------------- 1. Primera instalación ------------------------ */
  console.log('\n--- 1. Recién instalada, sin entrenamientos ---')
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await abrirInicio()
  check(
    'No avisa si no hay entrenamientos que perder',
    (await page.locator('.reminder').count()) === 0,
    'sin aviso (correcto: no hay nada que perder)',
  )

  /* ------------------- 2. Con datos y sin copia hecha -------------------- */
  console.log('\n--- 2. Con entrenamientos y sin copia ---')
  await preparar({ sesiones: 3, ultimaCopiaHace: null })
  await abrirInicio()
  const aviso = await page.locator('.reminder').innerText()
  check('Avisa de que no hay ninguna copia', /Todavía no has hecho ninguna copia/i.test(aviso), aviso.split('\n')[0])
  check('Explica por qué importa', /solo están en este móvil/i.test(aviso))
  check('Ofrece descargar la copia', /Descargar copia ahora/i.test(aviso))
  await page.screenshot({ path: join(shotsDir, '26-aviso-copia.png') })

  /* --------------------- 3. El botón descarga de verdad ------------------- */
  console.log('\n--- 3. Descargar la copia ---')
  const [descarga] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: /Descargar copia ahora/i }).click(),
  ])
  const nombre = descarga.suggestedFilename()
  const ruta = await descarga.path()
  const contenido = JSON.parse(await readFile(ruta, 'utf8'))
  check('Se descarga un archivo con nombre identificable', /^kairos-copia-\d{4}-\d{2}-\d{2}\.json$/.test(nombre), nombre)
  check('El archivo es una copia de Kairós', contenido.format === 'gymlog-backup', String(contenido.format))
  check(
    'La copia lleva los entrenamientos',
    (contenido.data?.sessions?.length ?? 0) === 3,
    `${contenido.data?.sessions?.length ?? 0} sesiones`,
  )
  check('La copia lleva también los ajustes', Array.isArray(contenido.data?.settings), `settings: ${Array.isArray(contenido.data?.settings)}`)

  await page.waitForTimeout(1200)
  check('Tras descargar, el aviso desaparece', (await page.locator('.reminder').count()) === 0)
  const guardado = await page.evaluate(async () => {
    const peticion = indexedDB.open('gymlog')
    const db = await new Promise((resolve) => {
      peticion.onsuccess = () => resolve(peticion.result)
    })
    const p = db.transaction('settings', 'readonly').objectStore('settings').get('app')
    const ajustes = await new Promise((resolve) => {
      p.onsuccess = () => resolve(p.result)
    })
    return ajustes?.lastBackupAt ?? null
  })
  check('Se anota la fecha de la copia', typeof guardado === 'number' && guardado > 0, new Date(guardado ?? 0).toISOString().slice(0, 10))

  /* ----------------- 4. Copia vieja: vuelve a avisar -------------------- */
  console.log('\n--- 4. Con la copia de hace 20 días ---')
  await preparar({ sesiones: 3, ultimaCopiaHace: 20 })
  await abrirInicio()
  const avisoViejo = await page.locator('.reminder').innerText()
  check('Avisa cuando la copia está vieja', /Hace 20 días que no haces copia/i.test(avisoViejo), avisoViejo.split('\n')[0])

  /* --------------------------- 5. Se puede descartar -------------------- */
  console.log('\n--- 5. Descartar el aviso ---')
  await page.locator('.reminder button[aria-label="Recordármelo luego"]').click()
  await page.waitForTimeout(600)
  check('Al descartarlo desaparece', (await page.locator('.reminder').count()) === 0)
  await abrirInicio()
  check('No vuelve a salir al recargar', (await page.locator('.reminder').count()) === 0)

  /* ----------------- 6. Se puede desactivar el aviso ------------------- */
  console.log('\n--- 6. Recordatorio desactivado ---')
  await preparar({ sesiones: 3, ultimaCopiaHace: 20, intervalo: 0 })
  await abrirInicio()
  check('Con el recordatorio desactivado no aparece', (await page.locator('.reminder').count()) === 0)
  await page.locator('.nav button', { hasText: 'Ajustes' }).click()
  await page.waitForTimeout(900)
  const ajustes = await page.locator('body').innerText()
  check('En Ajustes se ve que el recordatorio está desactivado', /Sin recordatorio/i.test(ajustes))

  /* -------- 7. Cambiar el intervalo desde Ajustes (a cada mes) --------- */
  console.log('\n--- 7. Cambiar el intervalo a cada mes ---')
  await page.getByRole('button', { name: 'Cada mes' }).click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /Inicio/ }).click()
  await page.waitForTimeout(900)
  check(
    'Con intervalo de un mes, una copia de hace 20 días ya no avisa',
    (await page.locator('.reminder').count()) === 0,
    'sin aviso (correcto)',
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
