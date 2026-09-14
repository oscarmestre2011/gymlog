import { useState } from 'react'
import { useQuery } from '../hooks'
import { listRoutines } from '../db/repository'
import type { Routine } from '../types'
import { Modal } from './Modal'
import { prettyDate, todayISO } from '../lib/format'

/** Selector de rutina al empezar: lo primero que se ve al llegar al gimnasio. */
export function RoutinePicker({
  date,
  onPick,
  onClose,
}: {
  date: string
  onPick: (routine?: Routine, date?: string) => void
  onClose: () => void
}) {
  const [chosenDate, setChosenDate] = useState(date)
  const { data: routines, loading } = useQuery(() => listRoutines(), [])

  return (
    <Modal
      title="Empezar sesión"
      subtitle={`${prettyDate(chosenDate)}${chosenDate === todayISO() ? ' (hoy)' : ''}`}
      onClose={onClose}
      actions={
        <button className="btn ghost block" onClick={() => onPick(undefined, chosenDate)}>
          Sesión libre (sin rutina)
        </button>
      }
    >
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="picker-date">Fecha</label>
        <input
          id="picker-date"
          className="input"
          type="date"
          value={chosenDate}
          onChange={(e) => setChosenDate(e.target.value || todayISO())}
        />
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (routines?.length ?? 0) === 0 ? (
        <div className="notice info">
          Todavía no tienes rutinas guardadas. Ve a la pestaña <b>Rutinas</b> para crear la primera.
        </div>
      ) : (
        <div className="list">
          {routines?.map((routine) => (
            <button
              key={routine.id}
              className="list-item"
              style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', width: '100%' }}
              onClick={() => onPick(routine, chosenDate)}
            >
              <div className="main">
                <div className="title">
                  {routine.code ? `${routine.code} · ` : ''}
                  {routine.name}
                </div>
                <div className="meta">
                  {routine.exercises.length} ejercicios
                  {routine.description ? ` · ${routine.description}` : ''}
                </div>
              </div>
              <span aria-hidden style={{ color: 'var(--text-dim)' }}>
                ▶
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
