import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db, getSettings } from './db'
import { DEFAULT_SETTINGS, type Settings } from './types'
import { duracionDelAviso, patronDeVibracion, sonarAviso, type DuracionAviso } from './lib/audio'

/** Lee los ajustes y los mantiene sincronizados con la interfaz. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => Promise<void>] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let alive = true
    getSettings().then((s) => {
      if (alive) setSettings(s)
    })
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback(async (patch: Partial<Settings>) => {
    const current = await getSettings()
    const next = { ...current, ...patch, id: 'app' as const }
    await db.settings.put(next)
    setSettings(next)
  }, [])

  return [settings, save]
}

/**
 * Consulta reactiva sencilla sobre IndexedDB.
 * Se re-ejecuta al cambiar `deps` o cuando se llama a `refresh`.
 */
export function useQuery<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  initial?: T,
): { data: T | undefined; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | undefined>(initial)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let alive = true
    setLoading(true)
    loaderRef
      .current()
      .then((result) => {
        if (alive) {
          setData(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, refresh }
}

const REST_KEY = 'gymlog.restEndsAt'
const REST_TOTAL_KEY = 'gymlog.restTotal'

export interface RestTimer {
  endsAt: number | null
  remaining: number
  total: number
  running: boolean
  /** Arranca el descanso. `etiqueta` explica para que es (superserie, ronda...). */
  start: (seconds: number, etiqueta?: string) => void
  stop: () => void
  addSeconds: (seconds: number) => void
  /** El aviso esta sonando ahora mismo (para que la barra lo muestre). */
  avisoSonando: boolean
  /** Para que es este descanso, si tiene explicacion. */
  etiqueta: string | null
}

/**
 * Cronometro de descanso.
 *
 * Guarda la HORA DE FIN, no una cuenta atras. Asi sigue siendo correcto aunque
 * el navegador suspenda la app en segundo plano, que es justo lo que pasa en
 * el gimnasio cuando se apaga la pantalla entre series.
 */
export function useRestTimer(
  soundOn: boolean,
  vibrateOn: boolean,
  alertLength: DuracionAviso = 'largo',
): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(() => {
    const raw = localStorage.getItem(REST_KEY)
    const value = raw ? Number(raw) : null
    return value && value > Date.now() ? value : null
  })
  const [total, setTotal] = useState<number>(() => Number(localStorage.getItem(REST_TOTAL_KEY)) || 90)
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)
  const [avisoSonando, setAvisoSonando] = useState(false)
  const [etiqueta, setEtiqueta] = useState<string | null>(null)

  useEffect(() => {
    if (endsAt === null) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  /**
   * Al volver a la app, ponerse al dia.
   *
   * Los temporizadores de una pagina se CONGELAN cuando el movil apaga la pantalla: el
   * intervalo de arriba deja de correr. Sin esto, al encender la pantalla el cronometro
   * seguia mostrando la hora de hace rato y el aviso no saltaba. Se comprobo en
   * scripts/test-pantalla-aviso.mjs.
   */
  useEffect(() => {
    if (endsAt === null) return
    const alVolver = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [endsAt])

  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0
  const running = endsAt !== null && remaining > 0

  /**
   * Aviso al terminar el descanso.
   *
   * Se lanza tambien al volver a la app si el descanso ya habia terminado mientras estaba
   * en segundo plano: si el movil apago la pantalla, este efecto no corrio hasta ahora, y
   * es mejor avisar tarde que no avisar. Va acompanado del aviso en pantalla, porque en
   * iPhone puede no haber sonido.
   */
  useEffect(() => {
    if (!endsAt || remaining > 0 || firedRef.current) return
    firedRef.current = true

    const duracion = duracionDelAviso(alertLength)
    setAvisoSonando(true)
    window.setTimeout(() => setAvisoSonando(false), duracion + 400)

    if (vibrateOn && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(patronDeVibracion(alertLength))
      } catch {
        /* algunos navegadores lo bloquean sin interaccion previa */
      }
    }

    if (soundOn) {
      // No se espera: el aviso suena mientras la interfaz sigue funcionando.
      void sonarAviso(alertLength)
    }
  }, [remaining, endsAt, soundOn, vibrateOn, alertLength])

  // El aviso se reinicia cuando se vuelve a arrancar el cronometro.
  useEffect(() => {
    if (running) setAvisoSonando(false)
  }, [running])

  const start = useCallback((seconds: number, texto?: string) => {
    if (seconds <= 0) return
    const end = Date.now() + seconds * 1000
    firedRef.current = false
    setAvisoSonando(false)
    setEtiqueta(texto ?? null)
    localStorage.setItem(REST_KEY, String(end))
    localStorage.setItem(REST_TOTAL_KEY, String(seconds))
    setTotal(seconds)
    setNow(Date.now())
    setEndsAt(end)
  }, [])

  const stop = useCallback(() => {
    localStorage.removeItem(REST_KEY)
    firedRef.current = false
    setAvisoSonando(false)
    setEtiqueta(null)
    setEndsAt(null)
  }, [])

  const addSeconds = useCallback((seconds: number) => {
    setEndsAt((current) => {
      const base = current ?? Date.now()
      const end = Math.max(Date.now(), base + seconds * 1000)
      localStorage.setItem(REST_KEY, String(end))
      return end
    })
    // Si se alarga el descanso, el aviso deja de tener sentido.
    firedRef.current = false
    setAvisoSonando(false)
  }, [])

  return useMemo(
    () => ({ endsAt, remaining, total, running, start, stop, addSeconds, avisoSonando, etiqueta }),
    [endsAt, remaining, total, running, start, stop, addSeconds, avisoSonando, etiqueta],
  )
}
