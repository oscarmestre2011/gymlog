/*
 * Comprueba que APIs hay disponibles para (1) no apagar la pantalla y (2) poder avisar del
 * fin del descanso, en Android/Chrome y en iPhone/Safari.
 *
 * Motivo: son dos peticiones del usuario y la viabilidad es distinta en cada movil.
 * La pantalla se puede mantener encendida con la API de bloqueo de pantalla (Wake Lock).
 * El sonido con la pantalla APAGADA es otra cosa: cuando el movil duerme, el navegador
 * suspende la pagina y los temporizadores no corren. Aqui se mide solo que APIs existen;
 * el comportamiento real se prueba aparte.
 *
 * Uso:  node scripts/check-alert-apis.mjs
 */
import { chromium, webkit, devices } from 'playwright'

const APP = 'https://oscarmestre2011.github.io/gymlog/'

async function probar(nombre, motor, dispositivo) {
  const browser = await motor.launch()
  try {
    const context = await browser.newContext({ ...devices[dispositivo], locale: 'es-ES' })
    const page = await context.newPage()
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2000)

    const api = await page.evaluate(() => {
      const ctxPrueba = window.AudioContext ?? window.webkitAudioContext
      return {
        pantallaEncendida: 'wakeLock' in navigator,
        // Vibracion: no existe en Safari.
        vibracion: 'vibrate' in navigator,
        // Sonido: el contexto de audio se puede crear sin interaccion del usuario?
        audioContextDisponible: typeof ctxPrueba === 'function',
        audioContextEstadoInicial: (() => {
          if (typeof ctxPrueba !== 'function') return 'no hay'
          try {
            const ctx = new ctxPrueba()
            const estado = ctx.state
            void ctx.close()
            return estado
          } catch (e) {
            return `error: ${String(e).slice(0, 40)}`
          }
        })(),
        notificaciones: 'Notification' in window,
        // Vibracion larga soportada (patron repetido)?
        servicioTrabajador: 'serviceWorker' in navigator,
        paginaVisible: document.visibilityState,
      }
    })

    console.log(`\n=== ${nombre} ===`)
    console.log(`  mantener la pantalla encendida (wakeLock):   ${api.pantallaEncendida ? 'SI' : 'no'}`)
    console.log(`  vibracion (navigator.vibrate):                ${api.vibracion ? 'SI' : 'no'}`)
    console.log(`  sonido (AudioContext):                        ${api.audioContextDisponible ? 'SI' : 'no'}`)
    console.log(`  estado del audio al crearlo sin tocar nada:   ${api.audioContextEstadoInicial}`)
    console.log(`  notificaciones del sistema:                   ${api.notificaciones ? 'SI' : 'no'}`)
    console.log(`  service worker (para avisar en segundo plano):${api.servicioTrabajador ? ' SI' : ' no'}`)
    console.log('  (el estado "suspended" significa que el sonido necesita que el usuario haya tocado la pantalla antes)')

    return { nombre, api }
  } finally {
    await browser.close()
  }
}

const resultados = []
resultados.push(await probar('Android / Chrome', chromium, 'Pixel 7'))
resultados.push(await probar('iPhone / Safari', webkit, 'iPhone 13'))

console.log('\n--- Resumen ---')
for (const r of resultados) {
  console.log(
    `  ${r.nombre}: pantalla ${r.api.pantallaEncendida ? 'SI' : 'NO'} · sonido ${r.api.audioContextDisponible ? 'SI' : 'NO'} · vibracion ${r.api.vibracion ? 'SI' : 'NO'}`,
  )
}
