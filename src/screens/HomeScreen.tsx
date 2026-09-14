import { useMemo, useState } from 'react'
import type { Routine } from '../types'
import {
  deleteSession,
  getActiveSession,
  getStats,
  listCardio,
  listRoutines,
  listSessions,
  listSets,
} from '../db/repository'
import { useQuery } from '../hooks'
import { ConfirmDialog } from '../components/Modal'
import { RoutinePicker } from '../components/RoutinePicker'
import {
  exerciseSummary,
  formatDuration,
  formatKilograms,
  formatKilometers,
  prettyDate,
  todayISO,
  weekdayName,
} from '../lib/format'
import type { Tab } from '../App'

/** Dia de la semana (0 = domingo) que le toca a cada rutina del programa A/B/C. */
const ROUTINE_WEEKDAY: Record<string, number> = { A: 1, B: 3, C: 5 }

export function HomeScreen({
  onStart,
  onOpenSession,
  onGoTo,
  notify,
}: {
  onStart: (routine?: Routine, date?: string) => Promise<void>
  onOpenSession: (id: string) => Promise<void>
  onGoTo: (tab: Tab) => void
  notify: (message: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: routines } = useQuery(() => listRoutines(), [])
  const { data: stats } = useQuery(() => getStats(), [refreshKey])
  const { data: sessions } = useQuery(() => listSessions(8), [refreshKey])
  const { data: cardio } = useQuery(() => listCardio(3), [refreshKey])
  const { data: active } = useQuery(() => getActiveSession(), [refreshKey])
  const { data: activeSets } = useQuery(
    () => (active ? listSets(active.id) : Promise.resolve([])),
    [active?.id, refreshKey],
    [],
  )

  const today = todayISO()
  const todayName = weekdayName(today)
  const suggested = useMemo(() => {
    const weekday = new Date().getDay()
    const list = routines ?? []
    const byCode = list.find((r) => ROUTINE_WEEKDAY[r.code ?? ''] === weekday)
    if (byCode) return byCode
    // Si hoy no toca rutina, propone la de la rutina por defecto (Fuerza A).
    return list.find((r) => r.isDefault) ?? list[0]
  }, [routines])

  const recentSummaries = useMemo(() => sessions ?? [], [sessions])

  return (
    <div className="screen">
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
        <div className="card">
          <div className="small muted" style={{ marginBottom: 4 }}>
            Hoy es {todayName}
          </div>
          <div style={{ fontSize: '1.12rem', fontWeight: 700, marginBottom: 4 }}>
            {suggested ? suggested.name : 'Sin rutina configurada'}
          </div>
          {suggested ? (
            <div className="small muted" style={{ marginBottom: 12 }}>
              {suggested.exercises.length} ejercicios
              {suggested.description ? ` · ${suggested.description}` : ''}
            </div>
          ) : (
            <div className="small muted" style={{ marginBottom: 12 }}>
              Crea tu primera rutina para empezar en un toque.
            </div>
          )}
          <button className="btn primary block lg" onClick={() => setPickerOpen(true)}>
            ▶ Empezar entrenamiento
          </button>
          {suggested ? (
            <button
              className="btn ghost block"
              style={{ marginTop: 8 }}
              onClick={() => void onStart(suggested, today)}
            >
              Empezar directamente: {suggested.code ?? '·'} {suggested.name}
            </button>
          ) : null}
        </div>
      )}

      {/* ------------------------------- stats ------------------------------ */}
      <div className="stats">
        <div className="stat">
          <div className="value">{stats?.sessions ?? 0}</div>
          <div className="label">Sesiones</div>
        </div>
        <div className="stat">
          <div className="value">{formatKilograms(stats?.volume ?? 0)}</div>
          <div className="label">Volumen total</div>
        </div>
        <div className="stat">
          {/*
            Se da la distancia EXACTA, con la misma funcion que la hoja de cardio.
            Antes se redondeaba a kilometros enteros y por eso aqui ponia 5 km mientras
            en la hoja de cardio ponia 4,5 km: dos sitios del mismo dato en desacuerdo.
          */}
          <div className="value">{formatKilometers(stats?.cardioKm ?? 0)}</div>
          <div className="label">Cardio acumulado</div>
        </div>
        <div className="stat">
          <div className="value">
            {stats?.streakWeeks ?? 0}
            <span className="small muted" style={{ fontWeight: 500 }}>
              {' '}
              sem
            </span>
          </div>
          <div className="label">Racha seguida</div>
        </div>
      </div>

      {/* ---------------------------- ultimas sesiones ---------------------- */}
      <div className="card">
        <div className="section-head">
          <h2 className="card-title" style={{ margin: 0 }}>
            Últimas sesiones
          </h2>
          <button className="btn sm ghost" onClick={() => onGoTo('progreso')}>
            Ver progresión
          </button>
        </div>

        {recentSummaries.length === 0 ? (
          <div className="empty" style={{ padding: '20px 8px' }}>
            <div className="big">📋</div>
            Todavía no hay sesiones guardadas.
          </div>
        ) : (
          <div className="list">
            {recentSummaries.map((session) => (
              <SessionRow
                key={session.id}
                sessionId={session.id}
                date={session.date}
                routineName={session.routineName}
                startedAt={session.startedAt}
                endedAt={session.endedAt}
                onDelete={() => setPendingDelete(session.id)}
              />
            ))}
          </div>
        )}
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

/* ------------------------------------------------------------------ */

function SessionRow({
  sessionId,
  date,
  routineName,
  startedAt,
  endedAt,
  onDelete,
}: {
  sessionId: string
  date: string
  routineName: string
  startedAt: number
  endedAt: number | null
  onDelete: () => void
}) {
  const { data: sets } = useQuery(() => listSets(sessionId), [sessionId], [])
  const list = sets ?? []
  const volume = list.filter((s) => !s.isWarmup).reduce((acc, s) => acc + s.weight * s.reps, 0)
  const duration = endedAt ? Math.round((endedAt - startedAt) / 1000) : null
  const exercises = [...new Set(list.map((s) => s.exerciseName))]

  return (
    <div className="list-item">
      <div className="main">
        <div className="title">{routineName}</div>
        <div className="meta">
          {prettyDate(date)}
          {duration ? ` · ${formatDuration(duration)}` : ''}
          {list.length > 0 ? ` · ${list.length} series` : ''}
          {volume > 0 ? ` · ${formatKilograms(volume)}` : ''}
        </div>
        {exercises.length > 0 ? (
          <div className="tiny muted" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {exerciseSummary(list)}
          </div>
        ) : null}
      </div>
      <button className="icon-btn danger" onClick={onDelete} aria-label="Borrar sesión">
        🗑
      </button>
    </div>
  )
}
