import { useEffect, useRef, useState } from 'react'

/**
 * Mantiene la pantalla encendida mientras la app esta en uso.
 *
 * Por que hace falta: si el movil apaga la pantalla, el navegador **suspende la pagina** y
 * los temporizadores no corren. Entonces el cronometro de descanso no avisa hasta que se
 * vuelve a encender la pantalla — que es justo lo que le pasaba al usuario. Manteniendo la
 * pantalla encendida, el aviso suena cuando toca.
 *
 * Detalles que hay que cuidar:
 * - El bloqueo se PIERDE al pasar la app a segundo plano, asi que hay que volver a pedirlo
 *   cada vez que vuelve a primer plano. Si no se hace, deja de funcionar sin avisar.
 * - Solo se puede pedir con la pagina visible. Si se pide estando oculta, da error.
 * - No todos los navegadores lo tienen (Safari lo incorporo mas tarde). Si no esta, la app
 *   funciona igual: simplemente no mantiene la pantalla encendida.
 */

/** Estado del bloqueo, para poder informar en Ajustes. */
export type EstadoPantalla = 'activo' | 'no-disponible' | 'denegado' | 'inactivo'

export function useWakeLock(activar: boolean): { estado: EstadoPantalla; reintentar: () => void } {
  const [estado, setEstado] = useState<EstadoPantalla>('inactivo')
  const bloqueoRef = useRef<{ release: () => Promise<void>; released: boolean } | null>(null)
  // Cambiarlo fuerza un nuevo intento de bloqueo (boton "volver a intentarlo" en Ajustes).
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!activar) {
      // Se suelta el bloqueo si estaba activo.
      void bloqueoRef.current?.release().catch(() => undefined)
      bloqueoRef.current = null
      setEstado('inactivo')
      return
    }

    const nav = navigator as Navigator & {
      wakeLock?: { request: (tipo: 'screen') => Promise<{ release: () => Promise<void>; released: boolean }> }
    }
    if (!nav.wakeLock) {
      setEstado('no-disponible')
      return
    }

    let vivo = true

    const pedir = async () => {
      // Con la pagina oculta no se puede pedir: el navegador lo rechaza.
      if (document.visibilityState !== 'visible') return
      try {
        const bloqueo = await nav.wakeLock!.request('screen')
        if (!vivo) {
          void bloqueo.release().catch(() => undefined)
          return
        }
        bloqueoRef.current = bloqueo
        setEstado('activo')
      } catch {
        if (vivo) setEstado('denegado')
      }
    }

    void pedir()

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        // Volver a la app: el bloqueo anterior se perdio, se pide otra vez.
        void pedir()
      } else {
        setEstado('inactivo')
      }
    }

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      void bloqueoRef.current?.release().catch(() => undefined)
      bloqueoRef.current = null
    }
  }, [activar, intento])

  return { estado, reintentar: () => setIntento((n) => n + 1) }
}
