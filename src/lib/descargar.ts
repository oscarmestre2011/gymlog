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

/** Lo que devuelve compartir: como acabo y cuando, para poder anotarlo. */
export interface ResultadoCopia {
  estado: ResultadoCompartir
  /** Momento en que se hizo la copia, o null si no se llego a hacer. */
  cuando: number | null
}

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
 * OJO CON LA COMPROBACION PREVIA, que aqui estuvo un fallo: antes se preguntaba al navegador si
 * sabia compartir archivos (`navigator.canShare`), y si decia que no se descargaba directamente. En
 * el movil del usuario esa comprobacion decia que no, asi que el boton de compartir hacia
 * exactamente lo mismo que el de guardar: descargar, sin compartir nunca.
 *
 * Ahora se INTENTA COMPARTIR sin preguntar antes, y solo se descarga si el intento falla de verdad.
 * Es la unica forma fiable: `canShare` no funciona igual en todos los navegadores.
 */
export async function compartirCopiaDeSeguridad(): Promise<ResultadoCopia> {
  const copia = await exportBackup()
  const fecha = new Date().toISOString().slice(0, 10)
  const nombre = `kairos-copia-${fecha}.json`
  const contenido = JSON.stringify(copia, null, 2)

  const nav = navigator as Navigator & {
    share?: (datos: { files?: File[]; title?: string; text?: string }) => Promise<void>
  }

  // Sin funcion de compartir no hay nada que intentar: se descarga.
  if (typeof nav.share !== 'function') {
    await descargarArchivo(contenido, nombre, 'application/json')
    return { estado: 'no-soportado', cuando: Date.now() }
  }

  try {
    const archivo = new File([contenido], nombre, { type: 'application/json' })
    await nav.share({
      files: [archivo],
      title: 'Copia de Kairós',
      text: 'Copia de mis entrenamientos. Guarda este archivo: sirve para recuperarlos.',
    })
    return { estado: 'compartida', cuando: Date.now() }
  } catch (error) {
    // Cancelar el dialogo no es un fallo: no se hace nada mas y no se anota la copia.
    if ((error as { name?: string })?.name === 'AbortError') return { estado: 'cancelada', cuando: null }
    // Y si compartir falla de verdad, se descarga: mejor eso que quedarse sin copia.
    await descargarArchivo(contenido, nombre, 'application/json')
    return { estado: 'descargada', cuando: Date.now() }
  }
}
