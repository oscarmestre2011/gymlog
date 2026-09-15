import { useCallback, useEffect, useState, useRef } from 'react'
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
import { useWakeLock } from './hooks/useWakeLock'
import { desbloquearAudio } from './lib/audio'
import { HomeScreen } from './screens/HomeScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import { SessionScreen } from './screens/SessionScreen'
import { RoutinesScreen } from './screens/RoutinesScreen'
import { ExerciseLibraryScreen } from './screens/ExerciseLibraryScreen'
import { MeasurementsScreen } from './screens/MeasurementsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { Novedades } from './components/Novedades'
import { copiaAutomaticaSiToca } from './lib/copiaAutomatica'
import { VERSIONES } from './lib/changelog'
import { ProgressScreen } from './screens/ProgressScreen'
import { CardioScreen } from './screens/CardioScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { RestBar } from './components/RestBar'
import { RoutinePicker } from './components/RoutinePicker'
import { ErrorBoundary } from './components/ErrorBoundary'
import { StartupError } from './components/StartupError'
import { KairosMark } from './components/KairosMark'
import { todayISO, weekdayName } from './lib/format'

export type Tab = 'inicio' | 'rutinas' | 'ejercicios' | 'progreso' | 'cardio' | 'ajustes'

/** Datos de una serie nueva, tal y como los acepta el almacen. */
/** Tiempo maximo que se espera al almacenamiento local antes de dar error. */
const STARTUP_TIMEOUT_MS = 10000

export type NewSetInput = Parameters<typeof addSet>[0]

/**
 * Arranque de la app.
 *
 * Envuelve todo en una red de seguridad y controla el arranque: si el
 * almacenamiento del movil no responde, se muestra un error con salida en lugar
 * de dejar la pantalla oscura esperando para siempre.
 */
export function App({ updateEvent = 'gymlog:update-ready' }: { updateEvent?: string } = {}) {
  return (
    <ErrorBoundary>
      <AppContent updateEvent={updateEvent} />
    </ErrorBoundary>
  )
}

function AppContent({ updateEvent }: { updateEvent: string }) {
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
  const [updateReady, setUpdateReady] = useState(false)
  /** Si el arranque ha fallado, se guarda el motivo para poder explicarlo. */
  const [startupError, setStartupError] = useState<string | null>(null)
  /** Cambiarlo fuerza un nuevo intento de arranque. */
  const [startupAttempt, setStartupAttempt] = useState(0)
  /**
   * La bienvenida se muestra solo la primera vez. Vive en los ajustes y no en
   * localStorage, para que viaje con la copia de seguridad y no vuelva a salir si
   * alguien restaura sus datos en un movil nuevo.
   */
  const [verBienvenida, setVerBienvenida] = useState(false)
  /** Pantalla de medidas corporales: se entra desde Progresion. */
  const [verMedidas, setVerMedidas] = useState(false)
  /** Pantalla de novedades: se entra desde el aviso de version nueva. */
  const [verNovedades, setVerNovedades] = useState(false)
  /** Perfil del deportista: se entra desde Progresion y desde Ajustes. */
  const [verPerfil, setVerPerfil] = useState(false)
  /** El aviso de version nueva se mide para dejarle hueco y que no tape la cabecera. */
  const avisoRef = useRef<HTMLDivElement | null>(null)

  const rest = useRestTimer(settings.soundOn, settings.vibrateOn, settings.alertLength)
  /**
   * Mantiene la pantalla encendida mientras la app esta en uso.
   *
   * Si el movil apaga la pantalla, el navegador suspende la pagina y el aviso del descanso
   * no suena hasta volver a encenderla: es lo que le pasaba al usuario. Con esto, no se
   * apaga mientras esta usando la app.
   */
  const pantalla = useWakeLock(settings.keepScreenOn)

  /* ------------------------- desbloquear el audio ------------------------ */
  /**
   * El audio del navegador nace bloqueado hasta que el usuario toca la pantalla. Se
   * desbloquea en el primer toque, para que despues el aviso del descanso pueda sonar
   * aunque hayan pasado minutos.
   */
  useEffect(() => {
    const desbloquear = () => {
      void desbloquearAudio()
      window.removeEventListener('pointerdown', desbloquear)
      window.removeEventListener('keydown', desbloquear)
    }
    window.addEventListener('pointerdown', desbloquear)
    window.addEventListener('keydown', desbloquear)
    return () => {
      window.removeEventListener('pointerdown', desbloquear)
      window.removeEventListener('keydown', desbloquear)
    }
  }, [])

  /* --------------------------- version nueva ---------------------------- */
  // El service worker avisa cuando hay una version nueva descargada. Se ofrece
  // recargar, pero no se obliga: el usuario puede estar en mitad de una serie.
  useEffect(() => {
    const onUpdate = () => setUpdateReady(true)
    window.addEventListener(updateEvent, onUpdate)
    return () => window.removeEventListener(updateEvent, onUpdate)
  }, [updateEvent])

  const applyUpdate = useCallback(() => {
    setUpdateReady(false)
    window.location.reload()
  }, [])

  /* ------------------------------ arranque ------------------------------ */
  /**
   * El arranque lleva tiempo limite a proposito. Si el almacenamiento del movil
   * no responde, esperar para siempre deja la pantalla oscura sin explicacion: el
   * peor fallo posible, porque el usuario no sabe si esperar o cerrar la app.
   */
  useEffect(() => {
    let alive = true

    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(
        () =>
          reject(
            new Error(
              `El almacenamiento del móvil no ha respondido en ${STARTUP_TIMEOUT_MS / 1000} segundos.`,
            ),
          ),
        STARTUP_TIMEOUT_MS,
      )
    })

    const iniciar = async () => {
      if (await needsSeed()) await seedIfEmpty()
      const [cfg, active] = await Promise.all([getSettings(), getActiveSession()])
      if (!alive) return
      setSettings(cfg)
      // Si es la primera vez y no hay una sesion a medias, se explica que es esto.
      if (!cfg.hasSeenWelcome && !active) setVerBienvenida(true)
      if (active) {
        setSession(active)
        setSets(await listSets(active.id))
        setViewingSession(true)
      }
      setStartupError(null)
      setReady(true)
    }

    Promise.race([iniciar(), timeout]).catch((error: unknown) => {
      if (!alive) return
      setStartupError(error instanceof Error ? error.message : String(error))
    })

    return () => {
      alive = false
    }
  }, [startupAttempt])

  /**
   * Deja hueco para el aviso de version nueva.
   *
   * El alto del aviso cambia segun el texto y el ancho de la pantalla (al anadir un boton crecio
   * y tapaba la cabecera). En lugar de fijar un numero a mano, se mide el aviso de verdad y se
   * publica en la variable CSS que usa el hueco. Se vuelve a medir si cambia el tamano.
   */
  useEffect(() => {
    const aviso = avisoRef.current
    if (!updateReady || !aviso) {
      document.documentElement.style.removeProperty('--alto-aviso')
      return
    }
    const medir = () => {
      const alto = Math.ceil(aviso.getBoundingClientRect().height)
      if (alto > 0) document.documentElement.style.setProperty('--alto-aviso', `${alto}px`)
    }
    medir()
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    observador?.observe(aviso)
    window.addEventListener('resize', medir)
    return () => {
      observador?.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [updateReady])

  /**
   * Aviso breve en pantalla.
   *
   * Los mensajes de error duran mas: si algo falla (por ejemplo al guardar la copia), el usuario
   * necesita tiempo para leer QUE ha fallado. Con 2,6 segundos se iba antes de que diera tiempo.
   * Se puede forzar la duracion con el segundo argumento.
   */
  const notify = useCallback((message: string, duracionMs?: number) => {
    setToast(message)
    const esError = /no se pudo|no ha dado|no deja|no queda|denegado|no se ha podido|ya no existe/i.test(message)
    const tiempo = duracionMs ?? (esError ? 6500 : 2600)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), tiempo)
  }, [])

  /* -------------------- copia automatica, si toca ------------------------ */
  /**
   * Al abrir, se intenta una copia en la carpeta elegida si ya toca.
   *
   * Solo se informa cuando hay algo que decir: copia hecha, o permiso caducado (que el usuario
   * tiene que resolver). Si no hay carpeta configurada o esta desactivado, no se dice nada: la
   * app no debe dar la lata con lo que el usuario ya decidio.
   */
  useEffect(() => {
    let vivo = true
    void copiaAutomaticaSiToca()
      .then((resultado) => {
        if (!vivo || !resultado) return
        if (resultado.estado === 'guardada') {
          notify(`Copia guardada en ${resultado.carpeta}`)
        } else if (resultado.estado === 'sin-permiso') {
          notify('La copia automática necesita permiso: revísalo en Ajustes')
        }
      })
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [notify])


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
    async (input: NewSetInput, restSeconds: number, etiqueta?: string) => {
      await addSet(input)
      await reloadSets(input.sessionId)
      if (settings.autoStartRest && restSeconds > 0) rest.start(restSeconds, etiqueta)
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

  /**
   * Guarda los ajustes en la base de datos Y en el estado de la app.
   *
   * Hace falta lo segundo: si solo se guardaran, el resto de la app (el cronometro, el
   * bloqueo de pantalla, la duracion del aviso) seguiria usando los valores antiguos hasta
   * recargar. Se detecto con la opcion de mantener la pantalla encendida.
   */
  const guardarAjustes = useCallback(
    async (patch: Partial<Settings>) => {
      await saveSettings(patch)
      setSettings((actuales) => ({ ...actuales, ...patch }))
    },
    [],
  )

  /* -------------------------------- render ------------------------------- */

  // Arranque fallido: se explica el motivo en lugar de dejar la pantalla oscura.
  if (startupError) {
    return (
      <div className="app">
        <StartupError
          message={startupError}
          onRetry={() => {
            setStartupError(null)
            setStartupAttempt((n) => n + 1)
          }}
        />
      </div>
    )
  }

  // Cargando: se dice lo que esta pasando, para que no parezca una pantalla negra.
  if (!ready) {
    return (
      <div className="app">
        <div className="screen" style={{ justifyContent: 'center', minHeight: '70dvh' }}>
          <div className="spinner" />
          <p className="center small muted">Abriendo tus entrenamientos…</p>
        </div>
      </div>
    )
  }

  // Bienvenida: se muestra una sola vez, sin barra de navegacion, para explicar
  // que es la app, que trae y donde van los datos antes de empezar a usarla.
  if (verBienvenida) {
    return (
      <div className="app">
        <WelcomeScreen
          onDone={() => setVerBienvenida(false)}
          onStartFresh={() => {
            setVerBienvenida(false)
            void handleStart(undefined, todayISO())
          }}
        />
      </div>
    )
  }

  const titles: Record<Tab, string> = {
    inicio: 'Kairós',
    rutinas: 'Mis rutinas',
    ejercicios: 'Ejercicios',
    progreso: 'Progresión',
    cardio: 'Cardio',
    ajustes: 'Ajustes',
  }

  const showingSession = viewingSession && session !== null
  const title = showingSession && session ? session.routineName : titles[tab]

  if (verNovedades) {
    return (
      <div className="app">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setVerNovedades(false)} aria-label="Volver">
            ←
          </button>
          <div className="grow">
            <h1>Novedades</h1>
            <div className="sub">Lo último de Kairós</div>
          </div>
        </header>
        {/* Se destacan las ultimas versiones, que es lo que interesa al actualizar. */}
        <Novedades cuantas={2} destacar={VERSIONES[0]?.version} />
      </div>
    )
  }

  if (verPerfil) {
    return (
      <div className="app">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setVerPerfil(false)} aria-label="Volver">
            ←
          </button>
          <div className="grow">
            <h1>Perfil del deportista</h1>
            <div className="sub">Tus datos y lo que sale de ellos</div>
          </div>
        </header>
        <ProfileScreen />
      </div>
    )
  }

  if (verMedidas) {
    return (
      <div className="app">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setVerMedidas(false)} aria-label="Volver">
            ←
          </button>
          <div className="grow">
            <h1>Medidas corporales</h1>
            <div className="sub">Peso, abdomen, pecho y muslo</div>
          </div>
        </header>
        <MeasurementsScreen notify={notify} />
      </div>
    )
  }

  return (
    <div className={`app${updateReady ? ' has-update' : ''}`}>
      <header className="topbar">
        {!showingSession && tab === 'inicio' ? <KairosMark size={26} titulo="Kairós" /> : null}
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
          settings={settings}
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
            <RoutinesScreen
              notify={notify}
              onStartRoutine={(routine) => void handleStart(routine)}
              onIrAEjercicios={() => setTab('ejercicios')}
            />
          ) : tab === 'ejercicios' ? (
            <ExerciseLibraryScreen notify={notify} />
          ) : tab === 'progreso' ? (
            <ProgressScreen onVerMedidas={() => setVerMedidas(true)} onVerPerfil={() => setVerPerfil(true)} />
          ) : tab === 'cardio' ? (
            <CardioScreen notify={notify} />
          ) : (
            <SettingsScreen
            settings={settings}
            onSave={guardarAjustes}
            notify={notify}
            estadoPantalla={pantalla.estado}
            reintentarPantalla={pantalla.reintentar}
            onVerPerfil={() => setVerPerfil(true)}
          />
          )}
        </>
      )}

      {rest.running || (rest.endsAt !== null && rest.remaining === 0) ? (
        <RestBar
          remaining={rest.remaining}
          total={rest.total}
          etiqueta={rest.etiqueta}
          avisoSonando={rest.avisoSonando}
          onAdd={(s) => rest.addSeconds(s)}
          onStop={rest.stop}
        />
      ) : null}

      <nav className="nav">
        {(
          [
            ['inicio', '🏠', 'Inicio'],
            ['rutinas', '📋', 'Rutinas'],
            ['ejercicios', '🏋️', 'Ejercicios'],
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

      {updateReady ? (
        <div className="update-banner" role="status" ref={avisoRef}>
          <span className="grow">
            <b>Hay una versión nueva.</b> Tus datos no se tocan.
          </span>
          <button className="btn sm ghost" onClick={() => setVerNovedades(true)}>
            Ver qué cambia
          </button>
          <button className="btn sm primary" onClick={applyUpdate}>
            Actualizar
          </button>
          <button
            className="icon-btn"
            onClick={() => setUpdateReady(false)}
            aria-label="Ahora no"
            title="Ahora no"
          >
            ✕
          </button>
        </div>
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
