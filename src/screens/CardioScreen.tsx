import { useState } from 'react'
import type { CardioEntry, IntensidadCardio } from '../types'
import {
  INTENSIDADES,
  TIPOS_CARDIO,
  contarSeries,
  nivelIntensidad,
  UNIDADES,
  metrosAKm,
  plantillaBase,
  serieExtra,
  resumenDeSeries,
  tipoDe,
  totalesDe,
  tramoNuevo,
  type UnidadTramo,
} from '../lib/cardio'
import { newId } from '../db'
import { deleteCardio, listCardio, listSessionsByDate, saveCardio } from '../db/repository'
import { useQuery } from '../hooks'
import { ConfirmDialog, Modal } from '../components/Modal'
import { NumberInput } from '../components/NumberInput'
import {
  formatDuration,
  formatHoursMinutes,
  formatKilometers,
  formatNumber,
  paceMinPerKm,
  parseDurationInput,
  prettyDate,
  speedKmh,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
} from '../lib/format'

const ACTIVITIES = ['Bici', 'Carrera', 'Marcha', 'Caminata', 'Cinta', 'Elíptica', 'Natación', 'Remo', 'Otro']

export function CardioScreen({ notify }: { notify: (message: string) => void }) {
  const [editing, setEditing] = useState<CardioEntry | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CardioEntry | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: entries } = useQuery(() => listCardio(), [refreshKey])

  const startNew = () => {
    setEditing({
      id: newId('c_'),
      activity: 'Bici',
      date: todayISO(),
      durationMin: 60,
      createdAt: Date.now(),
    })
  }

  /**
   * Totales de cardio: de siempre, de este mes y de esta semana.
   *
   * Se dan con la distancia EXACTA (con metros) y el tiempo EXACTO (horas y minutos):
   * antes se redondeaba a kilometros enteros y a horas enteras, asi que sumando salidas
   * largas en bici se perdian cientos de metros y decenas de minutos.
   */
  const sumar = (lista: CardioEntry[]) => ({
    km: lista.reduce((acc, e) => acc + (e.distanceKm ?? 0), 0),
    minutos: lista.reduce((acc, e) => acc + e.durationMin, 0),
    sesiones: lista.length,
  })

  const hoy = todayISO()
  const todas = entries ?? []
  const totales = {
    todo: sumar(todas),
    mes: sumar(todas.filter((e) => e.date >= startOfMonthISO(hoy))),
    semana: sumar(todas.filter((e) => e.date >= startOfWeekISO(hoy))),
  }

  return (
    <div className="screen">
      <button className="btn primary block lg" onClick={startNew}>
        ＋ Añadir sesión de cardio
      </button>

      {todas.length > 0 ? (
        <div className="card">
          <h2 className="card-title">Totales</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th className="num">Distancia</th>
                  <th className="num">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>Esta semana</b>
                    <div className="tiny muted">desde el lunes {prettyDate(startOfWeekISO(hoy))}</div>
                  </td>
                  <td className="num">{formatKilometers(totales.semana.km)}</td>
                  <td className="num">{formatHoursMinutes(totales.semana.minutos)}</td>
                </tr>
                <tr>
                  <td>
                    <b>Este mes</b>
                    <div className="tiny muted">desde el {prettyDate(startOfMonthISO(hoy))}</div>
                  </td>
                  <td className="num">{formatKilometers(totales.mes.km)}</td>
                  <td className="num">{formatHoursMinutes(totales.mes.minutos)}</td>
                </tr>
                <tr>
                  <td>
                    <b>Total</b>
                    <div className="tiny muted">
                      {todas.length} {todas.length === 1 ? 'sesión' : 'sesiones'}
                    </div>
                  </td>
                  <td className="num">{formatKilometers(totales.todo.km)}</td>
                  <td className="num">{formatHoursMinutes(totales.todo.minutos)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(entries?.length ?? 0) === 0 ? (
        <div className="empty">
          <div className="big">🚴</div>
          <p>Sin cardio registrado.</p>
          <p className="small">
            Apunta aquí la bici, la carrera o las caminatas, como haces en el diario del vault.
          </p>
        </div>
      ) : null}

      {entries?.map((entry) => {
        /*
         * Los totales se calculan con totalesDe: en un entrenamiento por series salen de la suma de
         * los tramos (que es lo que se apunto), y en un continuo de sus propios campos.
         */
        const totales = totalesDe(entry)
        const km = totales.km
        const seconds = totales.minutos * 60
        const pace = paceMinPerKm(km, seconds)
        const speed = speedKmh(km, seconds)
        const isCarrera = /carrera|marcha|caminata|cinta/i.test(entry.activity)
        const resumen = resumenDeSeries(entry.segmentos ?? [])

        return (
          <div key={entry.id} className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>
                  {entry.activity}
                  {tipoDe(entry) !== 'continuo' ? (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      {tipoDe(entry) === 'series' ? 'series' : 'fartlek'}
                    </span>
                  ) : null}
                  {' · '}
                  {prettyDate(entry.date)}
                </div>
                <div className="small muted">
                  {formatDuration(seconds)}
                  {km ? ` · ${formatNumber(km)} km` : ''}
                  {entry.elevationM ? ` · +${entry.elevationM} m` : ''}
                  {resumen ? ` · ${resumen}` : ''}
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={() => setEditing({ ...entry })}
                aria-label="Editar"
              >
                ✎
              </button>
              <button
                className="icon-btn danger"
                onClick={() => setPendingDelete(entry)}
                aria-label="Borrar"
              >
                🗑
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              {pace ? (
                <div className="kv">
                  <span className="k">Ritmo medio</span>
                  <span className="v">{pace}</span>
                </div>
              ) : null}
              {speed && !isCarrera ? (
                <div className="kv">
                  <span className="k">Velocidad media</span>
                  <span className="v">{formatNumber(speed, 1)} km/h</span>
                </div>
              ) : null}
              {entry.avgHr ? (
                <div className="kv">
                  <span className="k">FC media</span>
                  <span className="v">
                    {entry.avgHr} bpm{entry.maxHr ? ` (máx ${entry.maxHr})` : ''}
                  </span>
                </div>
              ) : null}
              {entry.notes ? (
                <div className="kv">
                  <span className="k">Notas</span>
                  <span className="v" style={{ fontWeight: 400 }}>
                    {entry.notes}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )
      })}

      {editing ? (
        <CardioEditor
          entry={editing}
          onSave={async (entry) => {
            await saveCardio(entry)
            setEditing(null)
            setRefreshKey((k) => k + 1)
            notify('Cardio guardado')
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Borrar registro de cardio"
          message={`${pendingDelete.activity} del ${prettyDate(pendingDelete.date)}. No se puede deshacer.`}
          onConfirm={async () => {
            await deleteCardio(pendingDelete.id)
            setPendingDelete(null)
            setRefreshKey((k) => k + 1)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CardioEditor({
  entry,
  onSave,
  onClose,
}: {
  entry: CardioEntry
  onSave: (entry: CardioEntry) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<CardioEntry>(entry)
  const [durationText, setDurationText] = useState(() => {
    const h = Math.floor(entry.durationMin / 60)
    const m = Math.round(entry.durationMin % 60)
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
  })
  const [durationError, setDurationError] = useState<string | null>(null)
  /**
   * Con que se apuntan los tramos: tiempo, metros o km.
   *
   * Pista y series cortas se apuntan en METROS (400 m, 200 m) y las series largas en km. Antes solo
   * se podia en minutos, que no sirve para un 6x400.
   */
  const [unidad, setUnidad] = useState<UnidadTramo>(entry.unidadTramos ?? 'tiempo')

  const { data: sessionsToday } = useQuery(() => listSessionsByDate(draft.date), [draft.date], [])

  const esPorTramos = tipoDe(draft) !== 'continuo'
  const totalesTramos = totalesDe(draft)
  const seriesContadas = contarSeries(draft.segmentos ?? [])
  const resumenTramos = resumenDeSeries(draft.segmentos ?? [])

  const seconds = draft.durationMin * 60
  const pace = paceMinPerKm(draft.distanceKm, seconds)
  const speed = speedKmh(draft.distanceKm, seconds)

  const commitDuration = () => {
    const parsed = parseDurationInput(durationText)
    if (parsed === null || parsed <= 0) {
      setDurationError('No entiendo ese tiempo. Prueba con 1h 23m, 83:32 o 45 (minutos).')
      return
    }
    setDurationError(null)
    setDraft((d) => ({ ...d, durationMin: parsed / 60 }))
  }

  return (
    <Modal
      title={entry.createdAt && entry.durationMin > 0 ? 'Editar cardio' : 'Nuevo cardio'}
      onClose={onClose}
      actions={
        <>
          <button className="btn ghost grow" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary grow"
            onClick={() => {
              const parsed = parseDurationInput(durationText)
              /*
               * En un entrenamiento por series, el total se pone a la SUMA DE LOS TRAMOS: si se
               * dejara el total del formulario continuo, quedaria guardado un dato que contradice a
               * los tramos (se detecto con una prueba: 47 minutos en los tramos y 60 guardados).
               */
              const finalEntry: CardioEntry = esPorTramos
                ? {
                    ...draft,
                    durationMin: totalesTramos.minutos,
                    distanceKm: totalesTramos.km || undefined,
                    unidadTramos: unidad,
                  }
                : { ...draft, durationMin: parsed && parsed > 0 ? parsed / 60 : draft.durationMin }
              void onSave(finalEntry)
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      {/*
        TIPO DE ENTRENAMIENTO. Antes solo se podia apuntar un bloque continuo; un entrenamiento de
        series son tramos con ritmos distintos, y un fartlek son cambios de ritmo sin estructura.
      */}
      <div className="field">
        <label>Tipo de entrenamiento</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {TIPOS_CARDIO.map((opcion) => (
            <button
              key={opcion.valor}
              className={`chip${tipoDe(draft) === opcion.valor ? ' active' : ''}`}
              onClick={() =>
                setDraft((d) => {
                  const tipo = opcion.valor
                  if (tipo === 'continuo') {
                    return { ...d, tipo, segmentos: undefined }
                  }
                  // Al pasar a series o fartlek se propone una plantilla, para no empezar de cero.
                  if ((d.segmentos?.length ?? 0) > 0) return { ...d, tipo }
                  // Plantilla BASE de cuatro tramos: calentamiento, primer tramo fuerte, su
                  // recuperacion y vuelta a la calma. El que quiera mas series las anade.
                  return { ...d, tipo, segmentos: plantillaBase(tipo, () => newId('cs_')) }
                })
              }
            >
              {opcion.texto}
            </button>
          ))}
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          {TIPOS_CARDIO.find((o) => o.valor === tipoDe(draft))?.ayuda}
        </p>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="c-activity">Actividad</label>
        <div className="chips">
          {ACTIVITIES.map((activity) => (
            <button
              key={activity}
              className={`chip${draft.activity === activity ? ' active' : ''}`}
              onClick={() => setDraft({ ...draft, activity })}
            >
              {activity}
            </button>
          ))}
        </div>
      </div>

      {esPorTramos ? (
        <div style={{ marginTop: 12 }}>
          {/* Como se apuntan los tramos: por tiempo, por metros o por km. */}
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Los tramos, ¿cómo los apuntas?</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {UNIDADES.map((opcion) => (
                <button
                  key={opcion.valor}
                  className={`chip${unidad === opcion.valor ? ' active' : ''}`}
                  onClick={() => setUnidad(opcion.valor)}
                >
                  {opcion.texto}
                </button>
              ))}
            </div>
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>
              {UNIDADES.find((u) => u.valor === unidad)?.ayuda}
            </p>
          </div>

          {/* Cabecera: sin ella, las dos casillas de cada tramo no dicen qué son. */}
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="tramo-cabecera">Tramo</span>
            <span className="tramo-cabecera">
              {unidad === 'tiempo' ? 'Minutos' : unidad === 'metros' ? 'Metros' : 'Km'}
            </span>
            <span className="tramo-cabecera">
              {unidad === 'tiempo' ? 'Km (opcional)' : 'Minutos (opcional)'}
            </span>
          </div>

          <div className="row between" style={{ marginBottom: 8 }}>
            <label style={{ margin: 0 }}>Tramos ({draft.segmentos?.length ?? 0})</label>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn sm ghost"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    segmentos: [...(d.segmentos ?? []), tramoNuevo('fuerte', newId('cs_'))],
                  }))
                }
              >
                ＋ Tramo
              </button>
              <button
                className="btn sm ghost"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    segmentos: serieExtra(d.segmentos ?? [], () => newId('cs_')),
                  }))
                }
                title="Añade una serie más con su recuperación, antes de la vuelta a la calma"
              >
                ⚡ + Serie
              </button>
            </div>
          </div>

          <div className="tramos">
            {(draft.segmentos ?? []).map((tramo, indice) => (
              <div key={tramo.id} className="tramo">
                <span className={`tramo-marca nivel-${nivelIntensidad(tramo.intensidad)}`} aria-hidden="true" />
                <div className="tramo-campos">
                  <div className="tramo-fila">
                    <span className="tramo-numero">{indice + 1}</span>
                    {/*
                      Con "por tiempo" se apuntan minutos; con metros o km, la distancia. La
                      distancia SIEMPRE se guarda en kilometros (los metros se convierten), para que
                      los totales sumen bien.
                    */}
                    {unidad === 'tiempo' ? (
                      <NumberInput
                        value={tramo.durationMin}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            segmentos: (d.segmentos ?? []).map((x) =>
                              x.id === tramo.id ? { ...x, durationMin: v } : x,
                            ),
                          }))
                        }
                        placeholder="min"
                        ariaLabel={`Minutos del tramo ${indice + 1}`}
                      />
                    ) : (
                      <NumberInput
                        value={unidad === 'metros' ? (tramo.distanceKm ? Math.round(tramo.distanceKm * 1000) : undefined) : tramo.distanceKm}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            segmentos: (d.segmentos ?? []).map((x) =>
                              x.id === tramo.id
                                ? { ...x, distanceKm: unidad === 'metros' ? metrosAKm(v) : v }
                                : x,
                            ),
                          }))
                        }
                        placeholder={unidad === 'metros' ? 'metros' : 'km'}
                        integer={unidad === 'metros'}
                        ariaLabel={
                          unidad === 'metros'
                            ? `Metros del tramo ${indice + 1}`
                            : `Kilómetros del tramo ${indice + 1}`
                        }
                      />
                    )}
                    <NumberInput
                      value={unidad === 'tiempo' ? tramo.distanceKm : tramo.durationMin}
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          segmentos: (d.segmentos ?? []).map((x) =>
                            x.id === tramo.id
                              ? unidad === 'tiempo'
                                ? { ...x, distanceKm: v }
                                : { ...x, durationMin: v }
                              : x,
                          ),
                        }))
                      }
                      placeholder={unidad === 'tiempo' ? 'km' : 'min'}
                      ariaLabel={
                        unidad === 'tiempo'
                          ? `Kilómetros del tramo ${indice + 1}`
                          : `Minutos del tramo ${indice + 1}`
                      }
                    />
                    <button
                      className="icon-btn danger"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          segmentos: (d.segmentos ?? []).filter((x) => x.id !== tramo.id),
                        }))
                      }
                      aria-label={`Quitar el tramo ${indice + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="chips" style={{ marginTop: 4 }}>
                    {INTENSIDADES.map((opcion) => (
                      <button
                        key={opcion.valor}
                        className={`chip sm${tramo.intensidad === opcion.valor ? ' active' : ''}`}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            segmentos: (d.segmentos ?? []).map((x) =>
                              x.id === tramo.id ? { ...x, intensidad: opcion.valor as IntensidadCardio } : x,
                            ),
                          }))
                        }
                      >
                        {opcion.corto}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {resumenTramos ? (
            <div className="notice info" style={{ marginTop: 10 }}>
              <div>
                Total: <b>{formatDuration(Math.round(totalesTramos.minutos * 60))}</b>
                {totalesTramos.km > 0
                  ? unidad === 'metros'
                    ? ` · ${formatNumber(Math.round(totalesTramos.km * 1000))} m`
                    : ` · ${formatNumber(totalesTramos.km)} km`
                  : ''}
              </div>
              {seriesContadas > 0 ? <div>{seriesContadas} series fuertes</div> : null}
            </div>
          ) : (
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Añade tramos, o usa «⚡ +4 series» para empezar con una estructura y cambiarla.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="c-date">Fecha</label>
          <input
            id="c-date"
            className="input"
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value || todayISO() })}
          />
        </div>
        <div className="field">
          <label htmlFor="c-duration">Duración</label>
          <input
            id="c-duration"
            className="input"
            placeholder="1h 23m"
            value={durationText}
            onChange={(e) => setDurationText(e.target.value)}
            onBlur={commitDuration}
          />
        </div>
      </div>
      {durationError ? (
        <div className="notice warn" style={{ marginTop: 8 }}>
          {durationError}
        </div>
      ) : null}

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="c-distance">Distancia (km)</label>
          <NumberInput
            value={draft.distanceKm}
            onChange={(v) => setDraft({ ...draft, distanceKm: v })}
            onCommit={(v) => setDraft((d) => ({ ...d, distanceKm: v }))}
            placeholder="42,27"
            ariaLabel="Distancia en kilómetros"
          />
        </div>
        <div className="field">
          <label htmlFor="c-elevation">Desnivel (m)</label>
          <NumberInput
            value={draft.elevationM}
            onChange={(v) => setDraft({ ...draft, elevationM: v })}
            onCommit={(v) => setDraft((d) => ({ ...d, elevationM: v }))}
            placeholder="190"
            integer
            ariaLabel="Desnivel en metros"
          />
        </div>
      </div>
        </>
      )}

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="c-hr">FC media (bpm)</label>
          <NumberInput
            value={draft.avgHr}
            onChange={(v) => setDraft({ ...draft, avgHr: v })}
            placeholder="89"
            integer
            ariaLabel="Frecuencia cardiaca media"
          />
        </div>
        <div className="field">
          <label htmlFor="c-hrmax">FC máxima (bpm)</label>
          <NumberInput
            value={draft.maxHr}
            onChange={(v) => setDraft({ ...draft, maxHr: v })}
            placeholder="116"
            integer
            ariaLabel="Frecuencia cardiaca máxima"
          />
        </div>
      </div>

      {pace || speed ? (
        <div className="notice info" style={{ marginTop: 12 }}>
          {pace ? <div>Ritmo medio: <b>{pace}</b></div> : null}
          {speed ? <div>Velocidad media: <b>{formatNumber(speed, 1)} km/h</b></div> : null}
        </div>
      ) : null}

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="c-notes">Notas</label>
        <textarea
          id="c-notes"
          className="input"
          placeholder="Ruta, sensaciones, fuente del dato (Strava, reloj…)"
          value={draft.notes ?? ''}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
      </div>

      {(sessionsToday?.length ?? 0) > 0 ? (
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="c-session">Vincular a una sesión de ese día</label>
          <select
            id="c-session"
            className="input"
            value={draft.sessionId ?? ''}
            onChange={(e) => setDraft({ ...draft, sessionId: e.target.value || undefined })}
          >
            <option value="">Sin vincular</option>
            {sessionsToday?.map((session) => (
              <option key={session.id} value={session.id}>
                {session.routineName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </Modal>
  )
}
