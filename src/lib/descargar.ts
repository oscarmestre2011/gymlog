import { exportBackup, saveSettings } from '../db/repository'

/**
 * Descarga un archivo desde la propia app (sin servidor).
 *
 * Se espera un instante antes de dar por terminada la descarga: el navegador la lanza
 * de forma asincrona y conviene no borrar el objeto URL antes de que la haya cogido.
 */
export function descargarArchivo(contenido: string, nombre: string, tipo = 'text/plain'): Promise<void> {
  return new Promise((resolve) => {
    const blob = new Blob([contenido], { type: tipo })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombre
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      resolve()
    }, 500)
  })
}

/**
 * Descarga la copia de seguridad completa y anota cuando se hizo.
 *
 * La fecha es lo que permite que la app avise cuando lleva tiempo sin copia (ver
 * lib/backup.ts). Se anota DESPUES de descargar, para que si algo falla el aviso siga.
 */
export async function descargarCopiaDeSeguridad(): Promise<void> {
  const copia = await exportBackup()
  const fecha = new Date().toISOString().slice(0, 10)
  await descargarArchivo(JSON.stringify(copia, null, 2), `kairos-copia-${fecha}.json`, 'application/json')
  await saveSettings({ lastBackupAt: Date.now() })
}

/** Como ha terminado el intento de compartir la copia. */
export type ResultadoCompartir = 'compartida' | 'descargada' | 'cancelada' | 'no-soportado'

/** Se puede compartir ARCHIVOS en este navegador (no solo texto)? */
export function puedeCompartirArchivos(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { canShare?: (datos: { files?: File[] }) => boolean }
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try {
    // Se prueba con un archivo de mentira: es la unica forma fiable de saberlo, porque algunos
    // navegadores comparten texto pero no archivos.
    const prueba = new File(['x'], 'prueba.json', { type: 'application/json' })
    return nav.canShare({ files: [prueba] })
  } catch {
    return false
  }
}

/**
 * Comparte la copia de seguridad por donde elija el usuario (WhatsApp, correo, Drive...).
 *
 * POR QUE IMPORTA: una copia que se queda en el mismo movil no protege de perder el movil, que es
 * el unico riesgo serio que le queda a la app. Compartirla es un toque, y el archivo sale del
 * telefono. Si el navegador no sabe compartir archivos (o el usuario cancela), se descarga, que es
 * lo que se hacia antes: nunca se queda sin copia.
 *
 * Devuelve como ha terminado, para poder avisar en consecuencia.
 */
export async function compartirCopiaDeSeguridad(): Promise<ResultadoCompartir> {
  const copia = await exportBackup()
  const fecha = new Date().toISOString().slice(0, 10)
  const nombre = `kairos-copia-${fecha}.json`
  const contenido = JSON.stringify(copia, null, 2)

  if (!puedeCompartirArchivos()) {
    await descargarArchivo(contenido, nombre, 'application/json')
    await saveSettings({ lastBackupAt: Date.now() })
    return 'no-soportado'
  }

  const archivo = new File([contenido], nombre, { type: 'application/json' })
  try {
    const nav = navigator as Navigator & {
      share: (datos: { files?: File[]; title?: string; text?: string }) => Promise<void>
    }
    await nav.share({
      files: [archivo],
      title: 'Copia de Kairós',
      text: 'Copia de mis entrenamientos. Guarda este archivo: sirve para recuperarlos.',
    })
    await saveSettings({ lastBackupAt: Date.now() })
    return 'compartida'
  } catch (error) {
    // Cancelar el dialogo no es un fallo: no se hace nada mas y no se anota la copia.
    if ((error as { name?: string })?.name === 'AbortError') return 'cancelada'
    // Y si compartir falla por lo que sea, se descarga: mejor eso que quedarse sin copia.
    await descargarArchivo(contenido, nombre, 'application/json')
    await saveSettings({ lastBackupAt: Date.now() })
    return 'descargada'
  }
}
