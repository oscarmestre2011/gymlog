import { useMemo, useState } from 'react'
import {
  getExerciseHistory,
  getSettings,
  listMeasurements,
  getPersonalRecords,
  getWeeklyVolume,
  listTrainedExercises,
} from '../db/repository'
import { useQuery } from '../hooks'
import { formatKilograms, formatNumber, prettyDate, startOfWeekISO, todayISO } from '../lib/format'
import { cinturaAltura, resumenDe, riesgoCinturaAltura } from '../lib/medidas'
import { DEFAULT_SETTINGS } from '../types'
import { summarizeSets } from '../components/ExercisePicker'

/**
 * Progresion por ejercicio. Replica la tabla que el usuario ya mantiene a mano
 * en su vault, pero generada sola a partir de las series registradas.
 */
export function ProgressScreen({ onVerMedidas }: { onVerMedidas?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const { data: trained, loading } = useQuery(() => listTrainedExercises(), [])

  const current = useMemo(() => {
    if (!trained || trained.length === 0) return null
    return trained.find((t) => t.id === selected) ?? trained[0]
  }, [trained, selected])

  const { data: history } = useQuery(
    () => (current ? getExerciseHistory(current.id) : Promise.resolve([])),
    [current?.id],
    [],
  )
  const { data: records } = useQuery(() => getPersonalRecords(), [])
  const { data: weekly } = useQuery(() => getWeeklyVolume(8), [])

  const rows = useMemo(() => (history ?? []).slice().reverse(), [history])
  const chart = useMemo(() => (history ?? []).slice(-10), [history])
  const maxWeight = useMemo(() => Math.max(1, ...chart.map((c) => c.topWeight)), [chart])
  const best = useMemo(() => {
    const all = history ?? []
    if (all.length === 0) return null
    return all.reduce((top, item) => (item.best1RM > top.best1RM ? item : top))
  }, [history])

  if (loading) return <div className="screen"><div className="spinner" /></div>

  if (!trained || trained.length === 0) {
    return (
      <div className="screen">
        {/*
          Las medidas van ARRIBA y se muestran tambien cuando aun no hay series: se pueden
          apuntar desde el primer dia, sin haber entrenado nunca.
        */}
        <ResumenMedidas onVer={onVerMedidas} />
        <div className="empty">
          <div className="big">📈</div>
          <p>Todavía no hay series registradas.</p>
          <p className="small">Cuando termines tu primera sesión, aquí verás la progresión ejercicio a ejercicio.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      {/* --------------------------- medidas corporales ------------------------- */}
      <ResumenMedidas onVer={onVerMedidas} />

      {/* ------------------------- selector de ejercicio ------------------------ */}
      <div className="chips">
        {trained.map((exercise) => (
          <button
            key={exercise.id}
            className={`chip${current?.id === exercise.id ? ' active' : ''}`}
            onClick={() => setSelected(exercise.id)}
          >
            {exercise.name}
          </button>
        ))}
      </div>

      {/* ------------------------------ resumen -------------------------------- */}
      {current ? (
        <div className="card">
          <div className="section-head">
            <h2 className="card-title" style={{ margin: 0 }}>
              {current.name}
            </h2>
            <span className="tiny muted">{current.sets} series registradas</span>
          </div>

          {best ? (
            <div className="stats" style={{ marginBottom: 12 }}>
              <div className="stat">
                <div className="value">{formatNumber(best.best1RM)} kg</div>
                <div className="label">Mejor 1RM estimado</div>
              </div>
              <div className="stat">
                <div className="value">{formatNumber(Math.max(...(history ?? []).map((h) => h.topWeight)))} kg</div>
                <div className="label">Peso máximo</div>
              </div>
            </div>
          ) : null}

          {chart.length > 1 ? (
            <>
              <div className="tiny muted">Peso máximo por sesión</div>
              <div className="spark">
                {chart.map((item) => (
                  <div
                    key={item.sessionId}
                    className="bar"
                    style={{ height: `${Math.max(6, (item.topWeight / maxWeight) * 100)}%` }}
                    title={`${prettyDate(item.date)}: ${formatNumber(item.topWeight)} kg`}
                  />
                ))}
              </div>
              <div className="row between tiny muted" style={{ marginTop: 6 }}>
                <span>{prettyDate(chart[0].date)}</span>
                <span>{prettyDate(chart[chart.length - 1].date)}</span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------- historial ------------------------------ */}
      {rows.length > 0 ? (
        <div className="card">
          <h2 className="card-title">Historial</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Series</th>
                  <th className="num">Mejor</th>
                  <th className="num">Volumen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, index) => {
                  const previous = rows[index + 1]
                  const trend = previous ? item.topWeight - previous.topWeight : 0
                  return (
                    <tr key={item.sessionId} className={trend > 0 ? 'up' : trend < 0 ? 'down' : ''}>
                      <td>{prettyDate(item.date)}</td>
                      <td className="tiny">{summarizeSets(item.sets)}</td>
                      <td className="num">
                        {formatNumber(item.topWeight)} kg
                        {trend > 0 ? ' ↑' : trend < 0 ? ' ↓' : ''}
                      </td>
                      <td className="num">{formatKilograms(item.volume)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ---------------------------- volumen semanal --------------------------- */}
      {(weekly?.length ?? 0) > 0 ? (
        <div className="card">
          <h2 className="card-title">Volumen por semana</h2>
          <div className="list">
            {weekly
              ?.slice()
              .reverse()
              .map((week) => (
                <div key={week.weekStart} className="kv">
                  <span className="k">
                    Semana del {prettyDate(week.weekStart)}
                    {week.weekStart === startOfWeekISO(todayISO()) ? ' (actual)' : ''}
                  </span>
                  <span className="v">
                    {formatKilograms(week.volume)} · {week.sets} series
                  </span>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {/* -------------------------------- records ------------------------------ */}
      {(records?.length ?? 0) > 0 ? (
        <div className="card">
          <h2 className="card-title">🏆 Records personales</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Ejercicio</th>
                  <th className="num">Peso</th>
                  <th className="num">1RM est.</th>
                  <th className="num">Reps</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {records?.slice(0, 15).map((record) => (
                  <tr key={record.exerciseId}>
                    <td>{record.exerciseName}</td>
                    <td className="num">{formatNumber(record.topWeight)} kg</td>
                    <td className="num">{formatNumber(record.best1RM)} kg</td>
                    <td className="num">{record.bestSetReps}</td>
                    <td>{record.date ? prettyDate(record.date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
            El 1RM es una estimación (fórmula de Epley) para comparar sesiones, no un intento real.
          </p>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

/**
 * Resumen de medidas corporales dentro de la pantalla de progresion.
 *
 * Se muestran peso y cintura, que son las dos senales que el propio plan marca como
 * fiables ("cintura quincenal abajo y fuerza arriba"), con acceso al historial completo.
 */
function ResumenMedidas({ onVer }: { onVer?: () => void }) {
  const { data: mediciones } = useQuery(() => listMeasurements(), [], [])
  const { data: settings } = useQuery(() => getSettings(), [], DEFAULT_SETTINGS)
  const lista = mediciones ?? []

  if (lista.length === 0) {
    return (
      <div className="card">
        <div className="row between">
          <div className="grow">
            <h3 className="card-title" style={{ margin: 0 }}>
              Medidas corporales
            </h3>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              Apunta peso y cintura cada dos semanas para ver la evolución real.
            </p>
          </div>
        </div>
        {onVer ? (
          <button className="btn block" style={{ marginTop: 10 }} onClick={onVer}>
            📏 Añadir la primera medición
          </button>
        ) : null}
      </div>
    )
  }

  const peso = resumenDe(lista, 'weightKg')
  const abdomen = resumenDe(lista, 'abdomenCm')
  const ultima = lista[0]
  const whTr = ultima ? cinturaAltura(ultima, settings?.heightCm || undefined) : null
  const riesgo = riesgoCinturaAltura(whTr)

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 className="card-title" style={{ margin: 0 }}>
          Medidas corporales
        </h3>
        <span className="tiny muted">{prettyDate(ultima.date)}</span>
      </div>

      <div className="stats">
        {peso.ultima ? (
          <div className="stat">
            <div className="value">{formatNumber(peso.ultima.weightKg as number, 1)} kg</div>
            <div className="label">Peso</div>
            {peso.cambio ? (
              <div className={`tiny ${peso.cambio < 0 ? 'good' : 'warn'}`}>
                {peso.cambio > 0 ? '↑' : '↓'} {formatNumber(Math.abs(peso.cambio), 1)} kg
              </div>
            ) : null}
          </div>
        ) : null}
        {abdomen.ultima ? (
          <div className="stat">
            <div className="value">{formatNumber(abdomen.ultima.abdomenCm as number, 1)} cm</div>
            <div className="label">Abdomen</div>
            {abdomen.cambio ? (
              <div className={`tiny ${abdomen.cambio < 0 ? 'good' : 'warn'}`}>
                {abdomen.cambio > 0 ? '↑' : '↓'} {formatNumber(Math.abs(abdomen.cambio), 1)} cm
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {riesgo ? (
        <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Cintura/altura {formatNumber(whTr as number, 2)} · {riesgo.texto}
        </p>
      ) : null}

      {onVer ? (
        <button className="btn block" style={{ marginTop: 10 }} onClick={onVer}>
          Ver todas las medidas
        </button>
      ) : null}
    </div>
  )
}
