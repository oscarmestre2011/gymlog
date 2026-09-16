import { useState } from 'react'
import type { Routine, RoutineExercise } from '../types'
import { avisosDelPlan, diasDeRutina, nombreCortoDelDia, planSemanal, textoDeDias } from '../lib/planificacion'
import {
  TRANSICION_POR_DEFECTO,
  groupRoutineExercises,
  letraDeGrupo,
  resumenDeSuperserie,
} from '../lib/supersets'
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
  onIrAEjercicios,
}: {
  notify: (message: string) => void
  onStartRoutine: (routine: Routine) => void
  /** Ir a la biblioteca de ejercicios, para crear uno nuevo que falte. */
  onIrAEjercicios: () => void
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

      {/*
        PLAN DE LA SEMANA: que rutina toca cada dia. Sirve para ver los huecos y los dias
        repetidos de un vistazo, y para comprobar que la planificacion es la que se quiere (los
        dias se eligen al editar cada rutina).
      */}
      {(routines?.length ?? 0) > 0 ? (
        <div className="card">
          <h2 className="card-title" style={{ marginTop: 0 }}>
            Tu semana
          </h2>
          <div className="plan-semana">
            {planSemanal(routines ?? []).map((dia) => (
              <div key={dia.dia} className={`plan-dia${dia.rutinas.length === 0 ? ' vacio' : ''}`}>
                <span className="plan-nombre">{dia.corto}</span>
                <span className="plan-rutinas">
                  {dia.rutinas.length === 0
                    ? '—'
                    : dia.rutinas.map((r) => `${r.code ? `${r.code} · ` : ''}${r.name}`).join(' + ')}
                </span>
              </div>
            ))}
          </div>

          {avisosDelPlan(routines ?? []).map((aviso) => (
            <p key={aviso} className="tiny warn" style={{ margin: '8px 0 0' }}>
              {aviso}
            </p>
          ))}

          <p className="tiny muted" style={{ margin: '10px 0 0' }}>
            Cada rutina tiene sus días: se eligen dentro de ella, con la ✎ de su tarjeta. En Inicio aparecerá la que toque ese día.
          </p>
        </div>
      ) : null}

      <p className="tiny muted" style={{ margin: 0 }}>
        ¿Te falta algún ejercicio? Se añaden desde{' '}
        <button
          className="link-button"
          onClick={onIrAEjercicios}
          style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--accent)', font: 'inherit', cursor: 'pointer' }}
        >
          la biblioteca de ejercicios
        </button>
        , con su descripción y la parte del cuerpo que trabajan.
      </p>

      {(routines?.length ?? 0) === 0 ? (
        <div className="empty">
          <div className="big">📋</div>
          <p>No hay rutinas todavía.</p>
        </div>
      ) : null}

      {routines?.map((routine) => (
        <div key={routine.id} className="card routine-card">
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

  /** Cambia un valor en TODOS los ejercicios de una superserie (descanso, transicion). */
  const cambiarGrupo = (posiciones: number[], patch: Partial<RoutineExercise>) => {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((e, i) => (posiciones.includes(i) ? { ...e, ...patch } : e)),
    }))
  }

  /**
   * Enlaza el ejercicio de la posicion `index` con el siguiente para formar una superserie.
   *
   * Se guarda en cada ejercicio el tamano del grupo ("van 2 juntos"), no un identificador
   * compartido: asi no hay dos sitios que puedan quedar descuadrados entre si.
   */
  const agrupar = (index: number) => {
    setDraft((d) => {
      const siguiente = d.exercises[index + 1]
      const actual = d.exercises[index]
      if (!siguiente || !actual) return d
      const yaEraGrupo = actual.kind === 'superset' && (actual.groupSize ?? 1) >= 2
      const nuevoTamano = (yaEraGrupo ? (actual.groupSize ?? 1) : 1) + 1
      const transicion =
        actual.transitionSeconds ?? siguiente.transitionSeconds ?? TRANSICION_POR_DEFECTO
      return {
        ...d,
        exercises: d.exercises.map((e, i) => {
          if (i === index || i === index + 1) {
            return { ...e, kind: 'superset' as const, groupSize: nuevoTamano, transitionSeconds: transicion }
          }
          return e
        }),
      }
    })
  }

  /** Deshace la superserie que empieza en `inicio`: sus ejercicios vuelven a ir sueltos. */
  const separar = (inicio: number) => {
    setDraft((d) => {
      const primero = d.exercises[inicio]
      const tamano = primero?.groupSize ?? 1
      return {
        ...d,
        exercises: d.exercises.map((e, i) => {
          if (i >= inicio && i < inicio + tamano) {
            return { ...e, kind: 'single' as const, groupSize: 1 }
          }
          return e
        }),
      }
    })
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
          placeholder="Empuje dominante con sentadilla y press banca…"
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>

      {/*
        DIAS DE LA RUTINA. Antes los dias estaban escritos a mano en el programa (A lunes, B
        miercoles, C viernes), asi que no habia forma de cambiarlos. Ahora se eligen aqui, y la
        pantalla de Inicio propone la rutina que toca ese dia.
      */}
      <div className="field" style={{ marginTop: 14 }}>
        <label>¿Qué días toca?</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
            const puesto = diasDeRutina(draft).includes(dia)
            return (
              <button
                key={dia}
                className={`chip${puesto ? ' active' : ''}`}
                onClick={() =>
                  setDraft((d) => {
                    const actuales = diasDeRutina(d)
                    const siguientes = puesto
                      ? actuales.filter((x) => x !== dia)
                      : [...actuales, dia]
                    return {
                      ...d,
                      weekdays: siguientes,
                      // Se mantiene la etiqueta de texto en consonancia, para la tarjeta.
                      weekday: siguientes.length === 0 ? 'Cualquier día' : textoDeDias({ ...d, weekdays: siguientes }),
                    }
                  })
                }
                aria-pressed={puesto}
              >
                {nombreCortoDelDia(dia)}
              </button>
            )
          })}
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          {diasDeRutina(draft).length === 0
            ? 'Sin días: no se propondrá sola en Inicio. Puedes empezarla a mano cuando quieras.'
            : 'Ese día aparecerá en Inicio como el entrenamiento que toca. Puedes marcar varios días.'}
        </p>
      </div>

      <div className="section-head" style={{ marginTop: 18 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          Ejercicios ({draft.exercises.length})
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groupRoutineExercises(draft.exercises).map((grupo, indiceGrupo) => {
          // Posicion del primer y ultimo ejercicio del grupo dentro de la lista completa.
          const posiciones: number[] = grupo.exercises.map((e) => draft.exercises.indexOf(e))
          const primero = posiciones[0]
          const ultimo = posiciones[posiciones.length - 1]
          const esSuperserie = grupo.kind === 'superset'
          const letra = letraDeGrupo(indiceGrupo)
          return (
            <div key={`grupo-${indiceGrupo}-${grupo.exercises[0]?.exerciseId ?? ''}`}>
              {esSuperserie ? (
                <div className="superset-head">
                  <span className="badge gold">Superserie {letra}</span>
                  <span className="tiny muted">
                    {resumenDeSuperserie(grupo.exercises)}
                  </span>
                </div>
              ) : null}

              {grupo.exercises.map((exercise, posicion) => {
                const index = posiciones[posicion]
                return (
                  <div
                    key={`${exercise.exerciseId}-${index}`}
                    className={`card tight${esSuperserie ? ' inside-superset' : ''}`}
                    style={{ background: 'var(--bg-elev-2)', marginTop: posicion === 0 ? 6 : 4 }}
                  >
                    <div className="row between" style={{ marginBottom: 8 }}>
                      <div className="grow" style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                        {esSuperserie ? `${letra}${posicion + 1}. ` : `${index + 1}. `}
                        {exercise.name}
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
                      <label>{esSuperserie ? 'Descanso al acabar la ronda' : 'Descanso (segundos)'}</label>
                      <div className="row wrap" style={{ gap: 6 }}>
                        {[45, 60, 75, 90, 120, 150, 180].map((seconds) => (
                          <button
                            key={seconds}
                            className={`chip${exercise.restSeconds === seconds ? ' active' : ''}`}
                            onClick={() =>
                              esSuperserie
                                ? cambiarGrupo(posiciones, { restSeconds: seconds })
                                : patchExercise(index, { restSeconds: seconds })
                            }
                          >
                            {seconds >= 60 ? `${seconds / 60} min` : `${seconds} s`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Enlazar con el siguiente ejercicio para formar una superserie. */}
                    {posicion === grupo.exercises.length - 1 && !esSuperserie && ultimo < draft.exercises.length - 1 ? (
                      <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => agrupar(ultimo)}>
                        ⇄ Enlazar con el siguiente (superserie)
                      </button>
                    ) : null}
                    {esSuperserie && posicion === grupo.exercises.length - 1 ? (
                      <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => separar(primero)}>
                        ⇤ Separar la superserie
                      </button>
                    ) : null}
                  </div>
                )
              })}

              {/* Ajustes que son de toda la superserie, no de un ejercicio suelto. */}
              {esSuperserie ? (
                <div className="field" style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                  <label>Descanso entre ejercicios de la superserie</label>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {[5, 10, 15, 20, 30, 45].map((seconds) => (
                      <button
                        key={seconds}
                        className={`chip${(grupo.exercises[0].transitionSeconds ?? TRANSICION_POR_DEFECTO) === seconds ? ' active' : ''}`}
                        onClick={() => cambiarGrupo(posiciones, { transitionSeconds: seconds })}
                      >
                        {seconds} s
                      </button>
                    ))}
                  </div>
                  <p className="tiny muted" style={{ margin: '6px 0 0' }}>
                    Lo que se descansa al pasar de un ejercicio al siguiente. El descanso largo va al
                    acabar la ronda.
                  </p>
                </div>
              ) : null}
            </div>
          )
        })}
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
