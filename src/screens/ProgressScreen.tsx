import { useMemo, useState } from 'react'
import {
  getExerciseHistory,
  getSettings,
  listMeasurements,
  deleteSession,
  getDatosDeAnalisis,
  getPersonalRecords,
  getStats,
  listSessions,
  listSets,
  getWeeklyVolume,
  listTrainedExercises,
} from '../db/repository'
import { ConfirmDialog } from '../components/Modal'
import { exerciseSummary } from '../lib/format'
import { useQuery } from '../hooks'
import {
  formatDuration,
  formatKilograms,
  formatKilometers,
  formatNumber,
  prettyDate,
  startOfWeekISO,
  todayISO,
} from '../lib/format'
import { cinturaAltura, resumenDe, riesgoCinturaAltura } from '../lib/medidas'
import {
  desequilibrio,
  diasConActividad,
  resumenConstancia,
  semanaCompleta,
  volumenPorGrupo,
  volumenSemanalPorGrupo,
} from '../lib/analisis'
import { edadDesde, gastoEnReposo, gastoTotal, imcPerfil } from '../lib/perfil'
import { DEFAULT_SETTINGS } from '../types'
import { summarizeSets } from '../components/ExercisePicker'

/**
 * Progresion por ejercicio. Replica la tabla que el usuario ya mantiene a mano
 * en su vault, pero generada sola a partir de las series registradas.
 */
export function ProgressScreen({
  onVerMedidas,
  onVerPerfil,
}: {
  onVerMedidas?: () => void
  onVerPerfil?: () => void
}) {
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
  /*
   * Datos para el equilibrio muscular y para ver fuerza y cardio juntos. Se cargan de una vez
   * (son tres tablas completas) y de aqui salen las dos secciones nuevas.
   */
  const { data: analisis } = useQuery(() => getDatosDeAnalisis(), [])
  /** Se incrementa al borrar algo, para que las consultas se vuelvan a hacer. */
  const [refreshKey, setRefreshKey] = useState(0)
  const [porBorrar, setPorBorrar] = useState<string | null>(null)
  const { data: sesiones } = useQuery(() => listSessions(8), [refreshKey], [])

  const rows = useMemo(() => (history ?? []).slice().reverse(), [history])
  const chart = useMemo(() => (history ?? []).slice(-10), [history])
  const maxWeight = useMemo(() => Math.max(1, ...chart.map((c) => c.topWeight)), [chart])
  const best = useMemo(() => {
    const all = history ?? []
    if (all.length === 0) return null
    return all.reduce((top, item) => (item.best1RM > top.best1RM ? item : top))
  }, [history])

  /*
   * OJO: estos calculos van ANTES de los `return` tempranos, y no despues.
   *
   * Un `useMemo` despues de un return temprano rompe la pantalla entera: en el primer render (sin
   * datos) hay menos hooks que en el siguiente (con datos), React lo detecta y lanza el error 310
   * ("mas hooks que en el render anterior"). Se descubrio con una prueba: al apuntar una sesion y
   * abrir Progresion, la pantalla se caia entera con el cartel de "algo ha ido mal".
   *
   * REGLA: los hooks siempre antes de cualquier return.
   */

  /* -------------------- analisis: equilibrio y semana completa -------------------- */

  const semanas = useMemo(
    () => (analisis ? semanaCompleta(analisis.sessions, analisis.sets, analisis.cardio, 8) : []),
    [analisis],
  )
  const tablaGrupos = useMemo(
    () =>
      analisis
        ? volumenSemanalPorGrupo(analisis.sets, analisis.sessions, analisis.exercises, 4)
        : { semanas: [], grupos: [] },
    [analisis],
  )
  const grupos = tablaGrupos.grupos
  const semanasGrupos = tablaGrupos.semanas
  const avisoDesequilibrio = useMemo(
    () => desequilibrio(volumenPorGrupo(analisis?.sets ?? [], analisis?.sessions ?? [], analisis?.exercises ?? [])),
    [analisis],
  )
  const { data: totales } = useQuery(() => getStats(), [refreshKey], undefined)
  const constancia = useMemo(
    () => (analisis ? resumenConstancia(diasConActividad(analisis.sessions, analisis.cardio, 60)) : null),
    [analisis],
  )


  if (loading) return <div className="screen"><div className="spinner" /></div>

  if (!trained || trained.length === 0) {
    return (
      <div className="screen">
        {/*
          Las medidas van ARRIBA y se muestran tambien cuando aun no hay series: se pueden
          apuntar desde el primer dia, sin haber entrenado nunca.
        */}
        <ResumenPerfil onVer={onVerPerfil} />
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
      {/* ----------------------------- totales -------------------------------- */}
      {/*
        Los totales generales. Estaban en la portada, que se limpio para dejar solo el
        entrenamiento del dia: aqui es donde se consultan, junto al resto del progreso.
      */}
      {totales ? (
        <div className="stats">
          <div className="stat">
            <div className="value">{totales.sessions}</div>
            <div className="label">Sesiones</div>
          </div>
          <div className="stat">
            <div className="value">{formatKilograms(totales.volume)}</div>
            <div className="label">Volumen total</div>
          </div>
          <div className="stat">
            <div className="value">{formatKilometers(totales.cardioKm)}</div>
            <div className="label">Cardio acumulado</div>
          </div>
          <div className="stat">
            <div className="value">
              {totales.streakWeeks}
              <span className="small muted" style={{ fontWeight: 500 }}> sem</span>
            </div>
            <div className="label">Racha seguida</div>
          </div>
        </div>
      ) : null}

      {/* ------------------------ perfil y medidas ------------------------------ */}
      <ResumenPerfil onVer={onVerPerfil} />
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

      {/* --------------------------- sesiones pasadas -------------------------- */}
      {(sesiones?.length ?? 0) > 0 ? (
        <div className="card">
          <h2 className="card-title">Sesiones guardadas</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Las últimas {sesiones?.length ?? 0}. Toca la papelera para borrar una.
          </p>
          <div className="list">
            {sesiones?.map((s) => (
              <SesionRow
                key={s.id}
                sessionId={s.id}
                date={s.date}
                routineName={s.routineName}
                startedAt={s.startedAt}
                endedAt={s.endedAt}
                onDelete={() => setPorBorrar(s.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {porBorrar ? (
        <ConfirmDialog
          title="Borrar sesión"
          message="Se borrarán también las series de esa sesión. No se puede deshacer."
          confirmLabel="Borrar"
          onConfirm={async () => {
            await deleteSession(porBorrar)
            setPorBorrar(null)
            setRefreshKey((k) => k + 1)
          }}
          onCancel={() => setPorBorrar(null)}
        />
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

      {/* ------------------- fuerza y cardio, la semana completa --------------- */}
      {semanas.length > 0 ? (
        <div className="card">
          <h2 className="card-title">Fuerza y cardio, juntos</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            La semana entera de un vistazo. Antes estaban en sitios distintos y quien hace las dos
            cosas no podía ver la carga completa.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th className="num">Fuerza</th>
                  <th className="num">Series</th>
                  <th className="num">Cardio</th>
                </tr>
              </thead>
              <tbody>
                {semanas
                  .slice()
                  .reverse()
                  .map((s) => (
                    <tr key={s.weekStart}>
                      <td>
                        {prettyDate(s.weekStart)}
                        {s.weekStart === startOfWeekISO(todayISO()) ? <span className="badge"> actual</span> : null}
                      </td>
                      <td className="num">{s.volumen > 0 ? formatKilograms(s.volumen) : '—'}</td>
                      <td className="num">
                        {s.series}
                        {s.sesiones > 0 ? <span className="tiny muted"> · {s.sesiones} ses.</span> : null}
                      </td>
                      <td className="num">
                        {s.cardioVeces > 0 ? (
                          <>
                            {formatNumber(s.cardioMin)} min
                            {s.cardioKm > 0 ? <span className="tiny muted"> · {formatNumber(s.cardioKm, 1)} km</span> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {constancia ? (
            <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
              En las últimas 4 semanas: <b>{constancia.diasActivos} días</b> con actividad
              {constancia.ambos > 0 ? `, de ellos ${constancia.ambos} con fuerza y cardio el mismo día` : ''}
              {constancia.soloCardio > 0 ? ` · ${constancia.soloCardio} solo cardio` : ''}
              {constancia.soloFuerza > 0 ? ` · ${constancia.soloFuerza} solo fuerza` : ''}.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* -------------------- volumen por grupo muscular ---------------------- */}
      {grupos.length > 0 ? (
        <div className="card">
          <h2 className="card-title">Volumen por grupo muscular</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Series de trabajo por semana en las últimas {semanasGrupos.length}. Sirve para ver el
            equilibrio: si un grupo se queda muy por detrás, se está entrenando poco o se está
            saltando. Las series de aproximación no cuentan.
          </p>

          {avisoDesequilibrio ? (
            <p className="small warn" style={{ marginTop: 0 }}>
              Ojo con el equilibrio: <b>{avisoDesequilibrio.grupoAlto}</b> lleva{' '}
              {avisoDesequilibrio.seriesAlto} series y <b>{avisoDesequilibrio.grupoBajo}</b> solo{' '}
              {avisoDesequilibrio.seriesBajo}. Si no es a propósito, conviene igualarlo.
            </p>
          ) : null}

          <div className="tabla-grupos">
            {grupos.map((g) => {
              const maximo = Math.max(...grupos.map((x) => x.total))
              return (
                <div key={g.grupo} className="fila-grupo">
                  <span className="nombre">{g.grupo}</span>
                  <span className="barra">
                    <span
                      className="relleno"
                      style={{ width: `${maximo > 0 ? (g.total / maximo) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="valor">{g.total}</span>
                </div>
              )
            })}
          </div>

          <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Total de series por grupo en las últimas {semanasGrupos.length}. Como referencia, quien
            entrena fuerza suele moverse entre 10 y 20 series por grupo y semana; no es una norma
            rígida, sirve sobre todo para comparar tus grupos entre sí.
          </p>
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
/**
 * Resumen del perfil del deportista.
 *
 * Va ARRIBA del todo en Progresion: la edad, el peso, el IMC y lo que se estima que gasta al dia
 * son el marco en el que se lee todo lo demas (si el peso baja, si la cintura baja...).
 */
function ResumenPerfil({ onVer }: { onVer?: () => void }) {
  const { data: ajustes } = useQuery(() => getSettings(), [], DEFAULT_SETTINGS)
  const { data: mediciones } = useQuery(() => listMeasurements(), [], [])
  /** Los ajustes pueden no haber cargado todavia; hasta entonces se usan los de por defecto. */
  const settings = ajustes ?? DEFAULT_SETTINGS
  const peso = resumenDe(mediciones ?? [], 'weightKg').ultima ?? null
  const pesoKg = peso?.weightKg
  const edad = edadDesde(settings.birthDate)
  const imc = imcPerfil(pesoKg, settings.heightCm)
  const total = gastoTotal(gastoEnReposo(settings, pesoKg, edad), settings.activity)

  const hayAlgo = edad !== null || imc !== null || total !== null

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 className="card-title" style={{ margin: 0 }}>
          Perfil del deportista
        </h3>
        {peso ? <span className="tiny muted">peso del {prettyDate(peso.date)}</span> : null}
      </div>

      {hayAlgo ? (
        <div className="stats">
          {edad !== null ? (
            <div className="stat">
              <div className="value">{edad}</div>
              <div className="label">años</div>
            </div>
          ) : null}
          {pesoKg ? (
            <div className="stat">
              <div className="value">{formatNumber(pesoKg, 1)} kg</div>
              <div className="label">peso</div>
            </div>
          ) : null}
          {imc !== null ? (
            <div className="stat">
              <div className="value">{formatNumber(imc, 1)}</div>
              <div className="label">IMC</div>
            </div>
          ) : null}
          {total !== null ? (
            <div className="stat">
              <div className="value">{formatNumber(total)}</div>
              <div className="label">kcal al día</div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Con tu altura, tu fecha de nacimiento y tu peso, aquí verás tu edad, tu IMC y una
          estimación de lo que gastas al día.
        </p>
      )}

      {onVer ? (
        <button className="btn block" style={{ marginTop: 10 }} onClick={onVer}>
          {hayAlgo ? 'Ver mi perfil' : 'Completar mi perfil'}
        </button>
      ) : null}
    </div>
  )
}

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
  // Sin altura no se muestra el indicador (mejor no mostrarlo que mostrarlo mal).
  const altura = settings?.heightCm && settings.heightCm > 0 ? settings.heightCm : undefined
  const whTr = ultima && altura ? cinturaAltura(ultima, altura) : null
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

/* ------------------------------------------------------------------ */

/**
 * Una sesion pasada, con su resumen y la opcion de borrarla.
 *
 * Vivia en la pantalla de Inicio, en la lista de "ultimas sesiones". Al limpiar Inicio se ha traido
 * aqui: el historial de entrenamientos es de Progresion, y ademas asi no se pierde la opcion de
 * borrar una sesion equivocada.
 */
function SesionRow({
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
        {list.length > 0 ? (
          <div
            className="tiny muted"
            style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
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
