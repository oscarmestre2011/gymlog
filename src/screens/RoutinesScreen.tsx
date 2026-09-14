import { useState } from 'react'
import type { Routine, RoutineExercise } from '../types'
import { deleteRoutine, duplicateRoutine, listRoutines, saveRoutine } from '../db/repository'
import { newId } from '../db'
import { useQuery } from '../hooks'
import { ConfirmDialog, Modal } from '../components/Modal'
import { ExercisePicker } from '../components/ExercisePicker'
import { NumberInput } from '../components/NumberInput'
import { formatDuration } from '../lib/format'

export function RoutinesScreen({
  notify,
  onStartRoutine,
}: {
  notify: (message: string) => void
  onStartRoutine: (routine: Routine) => void
}) {
  const [editing, setEditing] = useState<Routine | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Routine | null>(null)
  const { data: routines, refresh } = useQuery(() => listRoutines(), [])

  const createNew = () => {
    const routine: Routine = {
      id: newId('r_'),
      code: '',
      name: 'Nueva rutina',
      description: '',
      exercises: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setEditing(routine)
  }

  return (
    <div className="screen">
      <button className="btn primary block lg" onClick={createNew}>
        ＋ Nueva rutina
      </button>

      {(routines?.length ?? 0) === 0 ? (
        <div className="empty">
          <div className="big">📋</div>
          <p>No hay rutinas todavía.</p>
        </div>
      ) : null}

      {routines?.map((routine) => (
        <div key={routine.id} className="card">
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>
                {routine.code ? `${routine.code} · ` : ''}
                {routine.name}
              </div>
              {routine.description ? (
                <div className="small muted">{routine.description}</div>
              ) : null}
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {routine.exercises.length} ejercicios ·{' '}
                {formatDuration(
                  routine.exercises.reduce((acc, e) => acc + e.targetSets * (e.restSeconds + 40), 0),
                )}{' '}
                estimados
              </div>
            </div>
            {routine.isDefault ? <span className="badge gold">habitual</span> : null}
          </div>

          <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn primary grow" onClick={() => onStartRoutine(routine)}>
              ▶ Empezar
            </button>
            <button className="btn" onClick={() => setEditing({ ...routine, exercises: routine.exercises.map((e) => ({ ...e })) })}>
              ✎ Editar
            </button>
            <button
              className="btn ghost"
              onClick={async () => {
                await duplicateRoutine(routine.id)
                refresh()
                notify('Rutina duplicada')
              }}
              aria-label="Duplicar rutina"
            >
              ⧉
            </button>
            <button
              className="btn ghost danger"
              onClick={() => setPendingDelete(routine)}
              aria-label="Borrar rutina"
            >
              🗑
            </button>
          </div>

          {routine.exercises.length > 0 ? (
            <div className="tiny muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
              {routine.exercises
                .map((e) => `${e.name} ${e.targetSets}×${e.targetRepsMin === e.targetRepsMax ? e.targetRepsMin : `${e.targetRepsMin}-${e.targetRepsMax}`}`)
                .join(' · ')}
            </div>
          ) : null}
        </div>
      ))}

      {editing ? (
        <RoutineEditor
          routine={editing}
          onSave={async (routine) => {
            await saveRoutine(routine)
            setEditing(null)
            refresh()
            notify('Rutina guardada')
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Borrar rutina"
          message={`Se borrará «${pendingDelete.name}». Las sesiones ya registradas no se tocan.`}
          onConfirm={async () => {
            await deleteRoutine(pendingDelete.id)
            setPendingDelete(null)
            refresh()
            notify('Rutina borrada')
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Editor de rutina                                                    */
/* ------------------------------------------------------------------ */

function RoutineEditor({
  routine,
  onSave,
  onClose,
}: {
  routine: Routine
  onSave: (routine: Routine) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Routine>(routine)
  const [pickerOpen, setPickerOpen] = useState(false)

  const patchExercise = (index: number, patch: Partial<RoutineExercise>) => {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }))
  }

  const move = (index: number, direction: -1 | 1) => {
    setDraft((d) => {
      const next = [...d.exercises]
      const target = index + direction
      if (target < 0 || target >= next.length) return d
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...d, exercises: next }
    })
  }

  return (
    <Modal
      title={routine.name ? `Editar: ${routine.name}` : 'Nueva rutina'}
      onClose={onClose}
      actions={
        <>
          <button className="btn ghost grow" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary grow" onClick={() => void onSave(draft)}>
            Guardar rutina
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div className="field">
          <label htmlFor="r-code">Código</label>
          <input
            id="r-code"
            className="input"
            placeholder="A"
            maxLength={3}
            value={draft.code ?? ''}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="r-default">¿Rutina habitual?</label>
          <select
            id="r-default"
            className="input"
            value={draft.isDefault ? 'si' : 'no'}
            onChange={(e) => setDraft({ ...draft, isDefault: e.target.value === 'si' })}
          >
            <option value="no">No</option>
            <option value="si">Sí, proponerla al abrir</option>
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="r-name">Nombre</label>
        <input
          id="r-name"
          className="input"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="r-desc">Descripción</label>
        <input
          id="r-desc"
          className="input"
          placeholder="Lunes, empuje + pierna…"
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>

      <div className="section-head" style={{ marginTop: 18 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          Ejercicios ({draft.exercises.length})
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {draft.exercises.map((exercise, index) => (
          <div key={`${exercise.exerciseId}-${index}`} className="card tight" style={{ background: 'var(--bg-elev-2)' }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="grow" style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                {index + 1}. {exercise.name}
              </div>
              <button className="icon-btn" onClick={() => move(index, -1)} aria-label="Subir">
                ↑
              </button>
              <button className="icon-btn" onClick={() => move(index, 1)} aria-label="Bajar">
                ↓
              </button>
              <button
                className="icon-btn danger"
                onClick={() =>
                  setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== index) }))
                }
                aria-label="Quitar"
              >
                ✕
              </button>
            </div>
            <div className="grid-3">
              <div className="field">
                <label>Series</label>
                <NumberInput
                  value={exercise.targetSets}
                  onChange={(v) => patchExercise(index, { targetSets: v ?? 1 })}
                  integer
                  ariaLabel={`Series de ${exercise.name}`}
                />
              </div>
              <div className="field">
                <label>Reps mín</label>
                <NumberInput
                  value={exercise.targetRepsMin}
                  onChange={(v) => patchExercise(index, { targetRepsMin: v ?? 1 })}
                  integer
                  ariaLabel={`Reps mínimas de ${exercise.name}`}
                />
              </div>
              <div className="field">
                <label>Reps máx</label>
                <NumberInput
                  value={exercise.targetRepsMax}
                  onChange={(v) => patchExercise(index, { targetRepsMax: v ?? 1 })}
                  integer
                  ariaLabel={`Reps máximas de ${exercise.name}`}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Descanso (segundos)</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {[45, 60, 75, 90, 120, 150, 180].map((seconds) => (
                  <button
                    key={seconds}
                    className={`chip${exercise.restSeconds === seconds ? ' active' : ''}`}
                    onClick={() => patchExercise(index, { restSeconds: seconds })}
                  >
                    {seconds >= 60 ? `${seconds / 60} min` : `${seconds} s`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn block" style={{ marginTop: 12 }} onClick={() => setPickerOpen(true)}>
        ＋ Añadir ejercicio
      </button>

      {pickerOpen ? (
        <ExercisePicker
          usedIds={draft.exercises.map((e) => e.exerciseId)}
          onPick={(exerciseId, name) => {
            setDraft((d) => ({
              ...d,
              exercises: [
                ...d.exercises,
                {
                  exerciseId,
                  name,
                  targetSets: 3,
                  targetRepsMin: 8,
                  targetRepsMax: 12,
                  restSeconds: 90,
                },
              ],
            }))
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </Modal>
  )
}
