import { useMemo, useState } from 'react'
import type { Routine, Settings } from '../types'
import {
  deleteSession,
  getActiveSession,
  getStats,
  listCardio,
  listRoutines,
  listSets,
} from '../db/repository'
import { useQuery } from '../hooks'
import { diaDeLaFecha, rutinasDelDia } from '../lib/planificacion'
import { listMeasurements } from '../db/repository'
import { MeasurementReminder } from '../components/MeasurementReminder'
import { descargarCopiaDeSeguridad, compartirCopiaDeSeguridad } from '../lib/descargar'
import { BackupReminder } from '../components/BackupReminder'
import { ConfirmDialog } from '../components/Modal'
import { RoutinePicker } from '../components/RoutinePicker'
import {
  formatDuration,
  formatKilometers,
  prettyDate,
  todayISO,
  weekdayName,
} from '../lib/format'
import type { Tab } from '../App'

export function HomeScreen({
  settings,
  onStart,
  onOpenSession,
  onGoTo,
  notify,
  onVerAyuda,
  onGuardarAjuste,
}: {
  /** Ajustes actuales, gestionados por la app para que un cambio se refleje al momento. */
  settings: Settings
  onStart: (routine?: Routine, date?: string) => Promise<void>
  onOpenSession: (id: string) => Promise<void>
  onGoTo: (tab: Tab) => void
  notify: (message: string) => void
  /** Abre la ayuda e instrucciones. */
  onVerAyuda: () => void
  /**
   * Guarda un ajuste por el camino de siempre (el de la app). Se usa para anotar la fecha de la
   * copia: asi la pantalla se entera al momento y no hay dos caminos que puedan contradecirse.
   */
  onGuardarAjuste: (patch: Partial<Settings>) => Promise<void>
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: routines } = useQuery(() => listRoutines(), [])

  const { data: stats } = useQuery(() => getStats(), [refreshKey])
  const { data: cardio } = useQuery(() => listCardio(3), [refreshKey])
  const { data: mediciones } = useQuery(() => listMeasurements(), [refreshKey], [])
  const { data: active } = useQuery(() => getActiveSession(), [refreshKey])
  const { data: activeSets } = useQuery(
    () => (active ? listSets(active.id) : Promise.resolve([])),
    [active?.id, refreshKey],
    [],
  )

  const today = todayISO()
  const todayName = weekdayName(today)
  const diaDeHoy = diaDeLaFecha(today)

  /*
   * Los entrenamientos PLANIFICADOS para hoy.
   *
   * Sale de los dias que tenga puestas cada rutina (se eligen al editarla), no de una lista escrita
   * en el programa como antes. Si no hay nada programado para hoy se dice, en vez de proponer una
   * rutina cualquiera: proponer la equivocada es peor que no proponer nada.
   */
  const planificadas = useMemo(() => rutinasDelDia(routines ?? [], diaDeHoy), [routines, diaDeHoy])


  return (
    <div className="screen">
      {/*
        El ENTRENAMIENTO DEL DIA va primero: es lo unico que tiene que resolver esta pantalla.
        Los avisos (copia y medidas) van despues, y solo aparecen cuando hay algo que decir.
      */}
      {/* ------------------------------ sesion ------------------------------ */}
      {active ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="badge live">⏱ Sesión sin terminar</span>
            <span className="small muted">{prettyDate(active.date)}</span>
          </div>
          <div style={{ fontWeight: 650, marginBottom: 2 }}>{active.routineName}</div>
          <div className="small muted" style={{ marginBottom: 12 }}>
            {activeSets?.length ?? 0} series apuntadas
          </div>
          <button className="btn primary block lg" onClick={() => void onOpenSession(active.id)}>
            Continuar sesión
          </button>
        </div>
      ) : (
        /*
         * EL ENTRENAMIENTO QUE TOCA HOY, que es lo unico que tiene que resolver esta pantalla.
         *
         * Los dias salen de la propia rutina (se eligen al prepararla). Si hoy no hay nada
         * programado se dice claramente y se ofrece elegir, en lugar de proponer una rutina
         * cualquiera: proponer la equivocada es peor que no proponer nada.
         */
        <div className="card">
          <div className="small muted" style={{ marginBottom: 6 }}>
            Hoy es {todayName}
          </div>

          {planificadas.length === 0 ? (
            <>
              <div style={{ fontSize: '1.12rem', fontWeight: 700, marginBottom: 4 }}>
                Hoy no toca entrenar
              </div>
              <div className="small muted" style={{ marginBottom: 12 }}>
                Ninguna rutina está programada para hoy. Puedes entrenar igualmente si te apetece.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1.12rem', fontWeight: 700, marginBottom: 6 }}>
                {planificadas.length === 1
                  ? planificadas[0].name
                  : `${planificadas.length} entrenamientos para hoy`}
              </div>
              <div className="list" style={{ marginBottom: 12 }}>
                {planificadas.map((r) => (
                  <button
                    key={r.id}
                    className="list-item"
                    style={{ background: 'transparent', border: 0, textAlign: 'left', width: '100%', padding: '6px 0' }}
                    onClick={() => void onStart(r, today)}
                  >
                    <div className="main">
                      <div className="title">
                        {r.code ? <span className="badge" style={{ marginRight: 6 }}>{r.code}</span> : null}
                        {r.name}
                      </div>
                      <div className="meta">
                        {r.exercises.length} ejercicios
                        {r.description ? ` · ${r.description}` : ''}
                      </div>
                    </div>
                    <span className="btn sm primary">▶ Empezar</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <button className="btn block" onClick={() => setPickerOpen(true)}>
            {planificadas.length > 0 ? 'Hacer otra cosa' : 'Elegir rutina y entrenar'}
          </button>
        </div>
      )}

      {/*
        Aviso de copia de seguridad. Los datos viven solo en este movil: si se borran los datos del
        navegador no hay forma de recuperarlos sin copia. Solo aparece cuando hay algo que decir.
      */}
      <BackupReminder
        settings={settings}
        hayDatos={(stats?.sessions ?? 0) > 0 || (stats?.sets ?? 0) > 0 || (stats?.cardioKm ?? 0) > 0}
        onDescargar={async () => {
          await descargarCopiaDeSeguridad()
          notify('Copia descargada: guárdala en un sitio seguro')
          onGuardarAjuste({ lastBackupAt: Date.now() })
        }}
        onCompartir={async () => {
          const resultado = await compartirCopiaDeSeguridad()
          if (resultado.estado === 'cancelada') return
          // La fecha se anota por el mismo camino que el resto de ajustes, para que la pantalla
          // se entere al momento (y no al recargar).
          if (resultado.cuando) await onGuardarAjuste({ lastBackupAt: resultado.cuando })
          notify(
            resultado.estado === 'compartida'
              ? 'Copia enviada: guárdala donde quieras'
              : 'Copia descargada: guárdala en un sitio seguro',
          )
        }}
      />

      {/* Aviso de que toca medirse: cada dos semanas, que es su ritmo real. */}
      <MeasurementReminder mediciones={mediciones ?? []} onVer={() => onGoTo('progreso')} />

      {/*
        Accesos discretos al final. Antes esta pantalla tenia los totales, las ultimas sesiones, el
        cardio reciente y la copia: todo eso esta ya en sus apartados, y repetirlo aqui obligaba a
        bajar por media pantalla para llegar al entrenamiento del dia.
      */}
      <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
        <button
          className="btn sm ghost"
          onClick={async () => {
            const resultado = await compartirCopiaDeSeguridad()
            if (resultado.estado === 'cancelada') return
            if (resultado.cuando) await onGuardarAjuste({ lastBackupAt: resultado.cuando })
            notify(
              resultado.estado === 'compartida'
                ? 'Copia enviada: guárdala donde quieras'
                : 'Copia descargada: guárdala en un sitio seguro',
            )
          }}
        >
          ↗ Copia de seguridad
        </button>
        <button className="btn sm ghost" onClick={() => onGoTo('progreso')}>
          📈 Progreso
        </button>
        <button className="btn sm ghost" onClick={onVerAyuda}>
          📖 Ayuda
        </button>
      </div>

      {/* -------------------------------- cardio ---------------------------- */}
      {(cardio?.length ?? 0) > 0 ? (
        <div className="card">
          <div className="section-head">
            <h2 className="card-title" style={{ margin: 0 }}>
              Cardio reciente
            </h2>
            <button className="btn sm ghost" onClick={() => onGoTo('cardio')}>
              Añadir
            </button>
          </div>
          <div className="list">
            {cardio?.map((entry) => (
              <div key={entry.id} className="list-item">
                <div className="main">
                  <div className="title">
                    {entry.activity} · {prettyDate(entry.date)}
                  </div>
                  <div className="meta">
                    {formatDuration(entry.durationMin * 60)}
                    {entry.distanceKm ? ` · ${formatKilometers(entry.distanceKm)}` : ''}
                    {entry.elevationM ? ` · +${entry.elevationM} m` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ------------------------------- modales ---------------------------- */}
      {pickerOpen ? (
        <RoutinePicker
          date={today}
          onPick={(routine, date) => void onStart(routine, date)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Borrar sesión"
          message="Se borrarán la sesión y todas sus series. No se puede deshacer."
          onConfirm={async () => {
            const target = pendingDelete
            setPendingDelete(null)
            if (target) {
              await deleteSession(target)
              setRefreshKey((k) => k + 1)
              notify('Sesión borrada')
            }
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  )
}
