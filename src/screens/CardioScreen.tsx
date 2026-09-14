import { useState } from 'react'
import type { CardioEntry } from '../types'
import { deleteCardio, listCardio, listSessionsByDate, saveCardio } from '../db/repository'
import { newId } from '../db'
import { useQuery } from '../hooks'
import { ConfirmDialog, Modal } from '../components/Modal'
import { NumberInput } from '../components/NumberInput'
import {
  formatDuration,
  formatNumber,
  paceMinPerKm,
  parseDurationInput,
  prettyDate,
  speedKmh,
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

  const totalKm = (entries ?? []).reduce((acc, e) => acc + (e.distanceKm ?? 0), 0)
  const totalMin = (entries ?? []).reduce((acc, e) => acc + e.durationMin, 0)

  return (
    <div className="screen">
      <button className="btn primary block lg" onClick={startNew}>
        ＋ Añadir sesión de cardio
      </button>

      {(entries?.length ?? 0) > 0 ? (
        <div className="stats">
          <div className="stat">
            <div className="value">{formatNumber(Math.round(totalKm), 0)} km</div>
            <div className="label">Distancia total</div>
          </div>
          <div className="stat">
            <div className="value">{Math.round(totalMin / 60)} h</div>
            <div className="label">Tiempo total</div>
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
        const seconds = entry.durationMin * 60
        const pace = paceMinPerKm(entry.distanceKm, seconds)
        const speed = speedKmh(entry.distanceKm, seconds)
        const isCarrera = /carrera|marcha|caminata|cinta/i.test(entry.activity)

        return (
          <div key={entry.id} className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>
                  {entry.activity} · {prettyDate(entry.date)}
                </div>
                <div className="small muted">
                  {formatDuration(seconds)}
                  {entry.distanceKm ? ` · ${formatNumber(entry.distanceKm)} km` : ''}
                  {entry.elevationM ? ` · +${entry.elevationM} m` : ''}
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

  const { data: sessionsToday } = useQuery(() => listSessionsByDate(draft.date), [draft.date], [])

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
              const finalEntry: CardioEntry = {
                ...draft,
                durationMin: parsed && parsed > 0 ? parsed / 60 : draft.durationMin,
              }
              void onSave(finalEntry)
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="field">
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
