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
