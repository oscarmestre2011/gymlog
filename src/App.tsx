import { useCallback, useEffect, useState } from 'react'
import { needsSeed, seedIfEmpty } from './db/seed'
import {
  addSet,
  deleteSession,
  finishSession,
  getActiveSession,
  getSession,
  getSettings,
  listSets,
  saveSettings,
  startSession,
} from './db/repository'
import type { ExerciseSet, Routine, Session, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'
import { useRestTimer } from './hooks'
import { HomeScreen } from './screens/HomeScreen'
import { SessionScreen } from './screens/SessionScreen'
import { RoutinesScreen } from './screens/RoutinesScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { CardioScreen } from './screens/CardioScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { RestBar } from './components/RestBar'
import { RoutinePicker } from './components/RoutinePicker'
import { todayISO, weekdayName } from './lib/format'

export type Tab = 'inicio' | 'rutinas' | 'progreso' | 'cardio' | 'ajustes'

/** Datos de una serie nueva, tal y como los acepta el almacen. */
export type NewSetInput = Parameters<typeof addSet>[0]

export function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('inicio')
  const [session, setSession] = useState<Session | null>(null)
  /**
   * Si se esta viendo la pantalla de la sesion en curso.
   *
   * Es un estado aparte a proposito: con la barra inferior se puede salir a
   * mirar el progreso o las rutinas SIN abandonar la sesion. Antes, tocar la
   * barra soltaba la sesion en curso, que es justo lo que no se debe hacer.
   */
  const [viewingSession, setViewingSession] = useState(false)
  const [sets, setSets] = useState<ExerciseSet[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const rest = useRestTimer(settings.soundOn, settings.vibrateOn)

  /* ------------------------------ arranque ------------------------------ */
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (await needsSeed()) await seedIfEmpty()
      const [cfg, active] = await Promise.all([getSettings(), getActiveSession()])
      if (!alive) return
      setSettings(cfg)
      if (active) {
        setSession(active)
        setSets(await listSets(active.id))
        setViewingSession(true)
      }
      setReady(true)
    })().catch(() => setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2600)
  }, [])

  const reloadSets = useCallback(async (sessionId: string) => {
    setSets(await listSets(sessionId))
  }, [])

  const reloadSession = useCallback(async () => {
    if (!session) return
    const fresh = await getSession(session.id)
    if (fresh) setSession(fresh)
    await reloadSets(session.id)
  }, [session, reloadSets])

  /* -------------------------- acciones de sesion ------------------------- */

  const handleStart = useCallback(
    async (routine?: Routine, date?: string) => {
      const active = await getActiveSession()
      if (active) {
        setSession(active)
        await reloadSets(active.id)
        setViewingSession(true)
        setPickerOpen(false)
        return
      }
      const created = await startSession({ routine, date })
      setSession(created)
      setSets([])
      setViewingSession(true)
      setPickerOpen(false)
      setRefreshKey((k) => k + 1)
      notify(routine ? `Sesión iniciada: ${routine.name}` : 'Sesión libre iniciada')
    },
    [notify, reloadSets],
  )

  const handleLogSet = useCallback(
    async (input: NewSetInput, restSeconds: number) => {
      await addSet(input)
      await reloadSets(input.sessionId)
      if (settings.autoStartRest && restSeconds > 0) rest.start(restSeconds)
    },
    [reloadSets, rest, settings.autoStartRest],
  )

  const handleFinish = useCallback(async () => {
    if (!session) return
    await finishSession(session.id)
    setSession(null)
    setSets([])
    setViewingSession(false)
    rest.stop()
    setTab('inicio')
    setRefreshKey((k) => k + 1)
    notify('Sesión guardada')
  }, [session, rest, notify])

  const handleDiscard = useCallback(async () => {
    if (!session) return
    await deleteSession(session.id)
    setSession(null)
    setSets([])
    setViewingSession(false)
    rest.stop()
    setTab('inicio')
    setRefreshKey((k) => k + 1)
    notify('Sesión descartada')
  }, [session, rest, notify])

  /* -------------------------------- render ------------------------------- */

  if (!ready) {
    return (
      <div className="app">
        <div className="spinner" />
      </div>
    )
  }

  const titles: Record<Tab, string> = {
    inicio: 'GymLog',
    rutinas: 'Mis rutinas',
    progreso: 'Progresión',
    cardio: 'Cardio',
    ajustes: 'Ajustes',
  }

  const showingSession = viewingSession && session !== null
  const title = showingSession && session ? session.routineName : titles[tab]

  return (
    <div className="app">
      <header className="topbar">
        <div className="grow">
          <h1>{title}</h1>
          <div className="sub">
            {showingSession && session
              ? `${weekdayName(session.date)} ${session.date} · en curso`
              : `${weekdayName(todayISO())} ${todayISO()}`}
          </div>
        </div>
        {showingSession ? <span className="badge live">En curso</span> : null}
      </header>

      {showingSession && session ? (
        <SessionScreen
          session={session}
          sets={sets}
          settings={settings}
          rest={rest}
          onLogSet={handleLogSet}
          onChanged={reloadSession}
          onFinish={handleFinish}
          onDiscard={handleDiscard}
          onBackToApp={() => setViewingSession(false)}
          notify={notify}
        />
      ) : tab === 'inicio' ? (
        <HomeScreen
          key={`inicio-${refreshKey}`}
          onStart={handleStart}
          onOpenSession={async (id) => {
            const found = await getSession(id)
            if (found) {
              setSession(found)
              await reloadSets(found.id)
              setViewingSession(true)
            }
          }}
          onGoTo={(t) => setTab(t)}
          notify={notify}
        />
      ) : (
        <>
          {session ? <SessionBanner onResume={() => setViewingSession(true)} /> : null}
          {tab === 'rutinas' ? (
            <RoutinesScreen notify={notify} onStartRoutine={(routine) => void handleStart(routine)} />
          ) : tab === 'progreso' ? (
            <ProgressScreen />
          ) : tab === 'cardio' ? (
            <CardioScreen notify={notify} />
          ) : (
            <SettingsScreen settings={settings} onSave={saveSettings} notify={notify} />
          )}
        </>
      )}

      {rest.running || (rest.endsAt !== null && rest.remaining === 0) ? (
        <RestBar
          remaining={rest.remaining}
          total={rest.total}
          onAdd={(s) => rest.addSeconds(s)}
          onStop={rest.stop}
        />
      ) : null}

      <nav className="nav">
        {(
          [
            ['inicio', '🏠', 'Inicio'],
            ['rutinas', '📋', 'Rutinas'],
            ['progreso', '📈', 'Progreso'],
            ['cardio', '🚴', 'Cardio'],
            ['ajustes', '⚙️', 'Ajustes'],
          ] as [Tab, string, string][]
        ).map(([key, icon, label]) => (
          <button
            key={key}
            className={!showingSession && tab === key ? 'active' : ''}
            onClick={() => {
              // Navegar NUNCA abandona la sesion en curso: solo cambia de pantalla.
              setTab(key)
              setViewingSession(false)
            }}
          >
            <span className="ico" aria-hidden>
              {icon}
            </span>
            {label}
          </button>
        ))}
      </nav>

      {pickerOpen ? (
        <RoutinePicker
          date={todayISO()}
          onPick={(routine) => void handleStart(routine, todayISO())}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {toast ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(var(--nav-h) + var(--safe-b) + 18px)',
            background: 'var(--bg-elev-2)',
            border: '1px solid var(--border)',
            borderRadius: 99,
            padding: '10px 18px',
            fontSize: '0.85rem',
            zIndex: 60,
            boxShadow: 'var(--shadow)',
            maxWidth: '90vw',
          }}
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Aviso de que hay una sesion abierta, para las pantallas que no son la sesion.
 * Evita la sensacion de haber perdido el entrenamiento al salir a mirar algo.
 */
function SessionBanner({ onResume }: { onResume: () => void }) {
  return (
    <div className="screen" style={{ paddingBottom: 0 }}>
      <div className="card" style={{ borderColor: 'var(--accent)' }}>
        <div className="row between" style={{ gap: 10 }}>
          <div className="grow">
            <div style={{ fontWeight: 650, fontSize: '0.94rem' }}>Entrenamiento abierto</div>
            <div className="small muted">
              Tienes una sesión sin terminar. Sigue apuntando series cuando quieras.
            </div>
          </div>
          <button className="btn primary" onClick={onResume}>
            Volver
          </button>
        </div>
      </div>
    </div>
  )
}
