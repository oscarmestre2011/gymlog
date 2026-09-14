import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db, getSettings } from './db'
import { DEFAULT_SETTINGS, type Settings } from './types'

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
  start: (seconds: number) => void
  stop: () => void
  addSeconds: (seconds: number) => void
}

/**
 * Cronometro de descanso.
 *
 * Guarda la HORA DE FIN, no una cuenta atras. Asi sigue siendo correcto aunque
 * el navegador suspenda la app en segundo plano, que es justo lo que pasa en
 * el gimnasio cuando se apaga la pantalla entre series.
 */
export function useRestTimer(soundOn: boolean, vibrateOn: boolean): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(() => {
    const raw = localStorage.getItem(REST_KEY)
    const value = raw ? Number(raw) : null
    return value && value > Date.now() ? value : null
  })
  const [total, setTotal] = useState<number>(() => Number(localStorage.getItem(REST_TOTAL_KEY)) || 90)
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)

  useEffect(() => {
    if (endsAt === null) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0
  const running = endsAt !== null && remaining > 0

  // Aviso al terminar el descanso.
  useEffect(() => {
    if (!endsAt || remaining > 0 || firedRef.current) return
    firedRef.current = true

    if (vibrateOn && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200])
      } catch {
        /* algunos navegadores lo bloquean sin interaccion previa */
      }
    }

    if (soundOn) {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx) {
          const ctx = new Ctx()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.0001, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
          osc.start()
          osc.stop(ctx.currentTime + 0.62)
          window.setTimeout(() => void ctx.close(), 900)
        }
      } catch {
        /* sin audio: no es critico */
      }
    }
  }, [remaining, endsAt, soundOn, vibrateOn])

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return
    const end = Date.now() + seconds * 1000
    firedRef.current = false
    localStorage.setItem(REST_KEY, String(end))
    localStorage.setItem(REST_TOTAL_KEY, String(seconds))
    setTotal(seconds)
    setNow(Date.now())
    setEndsAt(end)
  }, [])

  const stop = useCallback(() => {
    localStorage.removeItem(REST_KEY)
    firedRef.current = false
    setEndsAt(null)
  }, [])

  const addSeconds = useCallback((seconds: number) => {
    setEndsAt((current) => {
      const base = current ?? Date.now()
      const end = Math.max(Date.now(), base + seconds * 1000)
      localStorage.setItem(REST_KEY, String(end))
      return end
    })
  }, [])

  return useMemo(
    () => ({ endsAt, remaining, total, running, start, stop, addSeconds }),
    [endsAt, remaining, total, running, start, stop, addSeconds],
  )
}
