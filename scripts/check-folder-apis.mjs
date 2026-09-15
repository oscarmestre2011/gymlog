/*
 * Comprueba que APIs ofrece cada motor de navegador para escribir en una carpeta.
 *
 * Motivo: la pregunta es si los datos se pueden guardar en una carpeta del movil. La
 * respuesta depende de si el navegador ofrece la API de acceso al sistema de archivos
 * (File System Access) o guardado por hoja de compartir. Aqui se mide en Chromium (que es
 * lo que usa Android) y en WebKit (lo mas parecido a Safari, que es lo que usa iPhone).
 *
 * OJO: esto solo comprueba que la API EXISTE. Que exista no significa que el usuario
 * pueda elegir la carpeta sin que el navegador lo permita o lo limite.
 *
 * Uso:  node scripts/check-folder-apis.mjs
 */
import { chromium, webkit, devices } from 'playwright'

const resultados = []

async function probar(nombre, motor, dispositivo) {
  const browser = await motor.launch()
  try {
    const context = await browser.newContext({ ...devices[dispositivo], locale: 'es-ES' })
    const page = await context.newPage()
    /*
     * OJO: hay que medirlo sobre una pagina REAL y en HTTPS. Con about:blank el contexto
     * no es seguro y el navegador no expone ninguna de estas APIs: la primera version de
     * este script daba "no" en todo por ese motivo.
     */
    await page.goto('https://oscarmestre2011.github.io/gymlog/', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(1500)

    const api = await page.evaluate(() => {
      const tiene = (nombre) => typeof window[nombre] === 'function'
      return {
        elegirCarpeta: tiene('showDirectoryPicker'),
        elegirArchivo: tiene('showOpenFilePicker'),
        guardarArchivo: tiene('showSaveFilePicker'),
        compartir: typeof navigator.share === 'function',
        compartirArchivos: typeof navigator.canShare === 'function',
        // Almacenamiento persistente: evita que el navegador borre los datos por falta de espacio.
        almacenamientoPersistente: typeof navigator.storage?.persist === 'function',
        estimacion: typeof navigator.storage?.estimate === 'function',
        origenPrivado: Boolean(navigator.storage?.getDirectory),
        trabajadorArchivos: typeof Worker === 'function' && typeof FileSystemHandle !== 'undefined',
      }
    })

    const contexto = await page.evaluate(() => ({
      secure: window.isSecureContext,
      origen: location.origin,
    }))

    console.log(`\n=== ${nombre} ===`)
    console.log(`  contexto seguro: ${contexto.secure ? 'si' : 'no'}`)
    console.log(`  elegir una CARPETA (showDirectoryPicker):     ${api.elegirCarpeta ? 'SI' : 'no'}`)
    console.log(`  elegir un archivo (showOpenFilePicker):       ${api.elegirArchivo ? 'SI' : 'no'}`)
    console.log(`  guardar un archivo (showSaveFilePicker):      ${api.guardarArchivo ? 'SI' : 'no'}`)
    console.log(`  compartir (navigator.share):                  ${api.compartir ? 'SI' : 'no'}`)
    console.log(`  compartir ARCHIVOS (navigator.canShare):      ${api.compartirArchivos ? 'SI' : 'no'}`)
    console.log(`  almacenamiento persistente (storage.persist): ${api.almacenamientoPersistente ? 'SI' : 'no'}`)
    console.log(`  estimacion de espacio (storage.estimate):     ${api.estimacion ? 'SI' : 'no'}`)
    console.log(`  puede borrar el navegador los datos?          ${api.almacenamientoPersistente ? 'se le puede pedir que NO' : 'sin control'}`)

    resultados.push({ nombre, api })
  } finally {
    await browser.close()
  }
}

await probar('Android / Chrome (Chromium)', chromium, 'Pixel 7')
await probar('iPhone / Safari (WebKit)', webkit, 'iPhone 13')

console.log('\n--- Resumen ---')
for (const r of resultados) {
  const carpeta = r.api.elegirCarpeta ? 'carpeta SI' : 'carpeta NO'
  const compartir = r.api.compartirArchivos ? 'compartir archivos SI' : 'compartir archivos NO'
  console.log(`  ${r.nombre}: ${carpeta} / ${compartir}`)
}
