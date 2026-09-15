import { useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, ExerciseSet, RoutineExercise, Session, Settings } from '../types'
import {
  deleteSet,
  duplicateSet,
  getLastSetsForExercise,
  getSettings,
  listExercises,
  moveSetsToExercise,
  renumberSets,
  updateSession,
  updateSet,
  upsertExercise,
} from '../db/repository'
import { newId } from '../db'
import type { NewSetInput } from '../App'
import type { RestTimer } from '../hooks'
import { ConfirmDialog } from '../components/Modal'
import {
  descansoTrasSerie,
  etiquetaDeDescanso,
  etiquetaDeSuperserie,
  groupRoutineExercises,
  marcaDeCambio,
  sePuedeAnadir,
  resumenEnSuperserie,
  letraDeGrupo,
  resumenDeSuperserie,
  sustituirEjercicio,
} from '../lib/supersets'
import { ExercisePicker, summarizeSets } from '../components/ExercisePicker'
import { NumberInput, targetLabel, targetSummary } from '../components/NumberInput'
import {
  exerciseSummary,
  formatKilograms,
  formatNumber,
  groupByExercise,
  suggestNextWeight,
  totalVolume,
  formatDuration,
} from '../lib/format'

interface ExerciseEntry {
  exerciseId: string
  name: string
  targetSets: number
  targetRepsMin: number
  targetRepsMax: number
  restSeconds: number
  /**
   * Si el ejercicio va dentro de una superserie. Hay que CONSERVAR estos campos al
   * actualizar la sesion: si se pierden, al recargar la superserie desaparece y los
   * ejercicios vuelven a comportarse como sueltos.
   */
  kind?: 'single' | 'superset'
  groupSize?: number
  transitionSeconds?: number
  notes?: string
}

interface HistoryInfo {
  sets: ExerciseSet[]
  date: string
}

export function SessionScreen({
  session,
  sets,
  settings,
  rest,
  onLogSet,
  onChanged,
  onFinish,
  onDiscard,
  onBackToApp,
  notify,
}: {
  session: Session
  sets: ExerciseSet[]
  settings: Settings
  /** Estado del cronometro de descanso; el tipo completo vive en hooks.ts. */
  rest: Pick<RestTimer, 'remaining' | 'total' | 'running' | 'start'>
  onLogSet: (input: NewSetInput, restSeconds: number, etiqueta?: string) => Promise<void>
  onChanged: () => Promise<void>
  onFinish: () => Promise<void>
  onDiscard: () => Promise<void>
  /** Sale a mirar otra pantalla sin cerrar la sesión: se puede volver cuando se quiera. */
  onBackToApp: () => void
  notify: (message: string, duracionMs?: number) => void
}) {
  const [entries, setEntries] = useState<ExerciseEntry[]>(() => session.routineSnapshot.map(toEntry))
  const [openNote, setOpenNote] = useState<string | null>(null)
  /** Ejercicio que se esta sustituyendo por otro (null si no hay ninguno). */
  const [sustituyendo, setSustituyendo] = useState<ExerciseEntry | null>(null)
  const [comment, setComment] = useState(session.metrics.notes ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [bodyweight, setBodyweight] = useState<number | undefined>(session.metrics.bodyweightKg)
  const [energy, setEnergy] = useState<number | undefined>(session.metrics.energy)
  const [contextOpen, setContextOpen] = useState(false)

  const [history, setHistory] = useState<Record<string, HistoryInfo | undefined>>({})
  const [library, setLibrary] = useState<Exercise[]>([])
  const [elapsed, setElapsed] = useState(() => Math.round((Date.now() - session.startedAt) / 1000))
  const topRef = useRef<HTMLDivElement>(null)

  /* ------------------------- datos de apoyo ------------------------- */

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [lib, cfg] = await Promise.all([listExercises(), getSettings()])
      if (!alive) return
      setLibrary(lib)

      const ids = [...new Set([...session.routineSnapshot.map((e) => e.exerciseId), ...sets.map((s) => s.exerciseId)])]
      const map: Record<string, HistoryInfo | undefined> = {}
      for (const id of ids) {
        const past = await getLastSetsForExercise(id, session.id)
        if (past.length === 0) {
          map[id] = undefined
          continue
        }
        // La fecha de la sesion anterior se resuelve con los propios datos.
        map[id] = { sets: past, date: '' }
      }
      if (!alive) return
      setHistory(map)
      void cfg
    })()
    return () => {
      alive = false
    }
    // Solo al montar y al cambiar de sesion: el historico no cambia durante la sesion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Cronometro de duracion de la sesion.
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - session.startedAt) / 1000)), 15000)
    return () => window.clearInterval(id)
  }, [session.startedAt])

  const byExercise = useMemo(() => {
    const grouped = groupByExercise(sets)
    const map = new Map<string, ExerciseSet[]>()
    for (const g of grouped) map.set(g.exerciseId, g.items)
    return map
  }, [sets])

  const incrementFor = (exerciseId: string): number =>
    library.find((e) => e.id === exerciseId)?.increment ?? 2.5

  /** Ejercicios presentes: los de la rutina mas los añadidos durante la sesion. */
  const orderedEntries = useMemo(() => {
    const fromSets = groupByExercise(sets).map((g) => g.exerciseId)
    const known = new Set(entries.map((e) => e.exerciseId))
    const extras = fromSets.filter((id) => !known.has(id))
    const extraEntries: ExerciseEntry[] = extras.map((id) => {
      const first = sets.find((s) => s.exerciseId === id)
      return {
        exerciseId: id,
        name: first?.exerciseName ?? 'Ejercicio',
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 12,
        restSeconds: settings.defaultRestSeconds,
      }
    })
    return [...entries, ...extraEntries]
  }, [entries, sets, settings.defaultRestSeconds])

  /* --------------------------- acciones --------------------------- */

  const persistEntries = async (next: ExerciseEntry[]) => {
    setEntries(next)
    const snapshot: RoutineExercise[] = next.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      targetSets: e.targetSets,
      targetRepsMin: e.targetRepsMin,
      targetRepsMax: e.targetRepsMax,
      restSeconds: e.restSeconds,
      // Se conservan las superseries: sin esto, al recargar la sesion se perderian.
      kind: e.kind,
      groupSize: e.groupSize,
      transitionSeconds: e.transitionSeconds,
      notes: e.notes,
    }))
    await updateSession(session.id, { routineSnapshot: snapshot })
  }

  const handleAddExercise = async (exerciseId: string, name: string) => {
    if (entries.some((e) => e.exerciseId === exerciseId)) {
      notify('Ese ejercicio ya está en la sesión')
      setPickerOpen(false)
      return
    }
    const cfg = await getSettings()
    await persistEntries([
      ...entries,
      {
        exerciseId,
        name,
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 12,
        restSeconds: cfg.defaultRestSeconds,
      },
    ])
    const past = await getLastSetsForExercise(exerciseId, session.id)
    setHistory((h) => ({ ...h, [exerciseId]: past.length > 0 ? { sets: past, date: '' } : undefined }))
    setPickerOpen(false)
    notify(`${name} añadido`)
  }

  /**
   * Crea un ejercicio que no estaba en la biblioteca, desde dentro de la sesion.
   *
   * Se marca como "mio" para que se pueda encontrar y completar despues en la pestana
   * Ejercicios: aqui se crea con lo minimo (nombre y peso corporal) porque el usuario esta
   * entrenando y no es momento de rellenar formularios.
   */
  const handleCreateExercise = async (name: string) => {
    const exercise: Exercise = {
      id: newId('e_'),
      name,
      group: 'Cuerpo completo',
      equipment: 'Otro',
      side: 'bilateral',
      increment: 2.5,
      custom: true,
      createdAt: Date.now(),
    }
    await upsertExercise(exercise)
    setLibrary((lib) => [...lib, exercise])
    await handleAddExercise(exercise.id, name)
    notify(`«${name}» añadido. Puedes completar su descripción en la pestaña Ejercicios.`)
  }

  const handleSaveSet = async (
    entry: ExerciseEntry,
    data: { weight?: number; reps?: number; rir?: number; isWarmup?: boolean; notes?: string },
    existing?: ExerciseSet,
    advanceRest = true,
  ) => {
    const weight = data.weight ?? existing?.weight ?? 0
    const reps = data.reps ?? existing?.reps ?? 0
    if (reps <= 0) {
      notify('Falta el número de repeticiones')
      return
    }

    if (existing) {
      await updateSet(existing.id, {
        weight,
        reps,
        rir: data.rir,
        isWarmup: data.isWarmup ?? existing.isWarmup,
        notes: data.notes,
      })
      await onChanged()
      if (advanceRest) {
        // Se calcula el descanso con las series que quedaran guardadas, no con las actuales.
        const siguiente = descansoTrasSerie(entry, seriesTrasGuardar(entry, existing), entries)
        rest.start(siguiente.segundos, etiquetaDeDescanso(siguiente))
      }
      return
    }

    const order = orderedEntries.findIndex((e) => e.exerciseId === entry.exerciseId)
    /*
     * El descanso depende de las RONDAS de la superserie, asi que hay que calcularlo con la
     * serie nueva ya incluida: si se calculara con las series de antes, al guardar el ultimo
     * ejercicio de la ronda seguiria creyendo que falta gente.
     */
    const descanso = advanceRest
      ? descansoTrasSerie(entry, seriesTrasGuardar(entry, undefined), entries)
      : { segundos: 0, motivo: 'normal' as const }

    await onLogSet(
      {
        sessionId: session.id,
        exerciseId: entry.exerciseId,
        exerciseName: entry.name,
        order: order < 0 ? orderedEntries.length : order,
        weight,
        reps,
        rir: data.rir,
        isWarmup: data.isWarmup ?? false,
        notes: data.notes,
      },
      descanso.segundos,
      etiquetaDeDescanso(descanso),
    )
  }

  /**
   * Las series tal y como quedaran despues de guardar esta.
   *
   * `existing` es la serie que se esta corrigiendo (si es una edicion) o undefined si es una
   * serie nueva. Solo se usa para decidir el descanso, asi que basta con que refleje cuantas
   * series hay de cada ejercicio.
   */
  function seriesTrasGuardar(entry: ExerciseEntry, existing?: ExerciseSet): ExerciseSet[] {
    if (existing) {
      // Editando: el numero de series no cambia.
      return sets
    }
    return [
      ...sets,
      {
        id: 'provisional',
        sessionId: session.id,
        exerciseId: entry.exerciseId,
        exerciseName: entry.name,
        order: 0,
        setNumber: 0,
        weight: 0,
        reps: 0,
        isWarmup: false,
        completedAt: Date.now(),
      },
    ]
  }

  const handleRepeat = async (set: ExerciseSet) => {
    if (set.reps <= 0) return
    const fresh = await duplicateSet(set.id)
    if (fresh) {
      await onChanged()
      const entry = entries.find((e) => e.exerciseId === set.exerciseId)
      const descanso = entry
        ? descansoTrasSerie(entry, [...sets, fresh], entries)
        : { segundos: settings.defaultRestSeconds, motivo: 'normal' as const }
      rest.start(descanso.segundos, etiquetaDeDescanso(descanso))
    }
  }

  const handleDeleteSet = async (entry: ExerciseEntry, set: ExerciseSet) => {
    await deleteSet(set.id)
    await renumberSets(session.id, entry.exerciseId)
    await onChanged()
  }

  const handleRemoveExercise = async (entry: ExerciseEntry) => {
    const own = byExercise.get(entry.exerciseId) ?? []
    for (const s of own) await deleteSet(s.id)
    await persistEntries(entries.filter((e) => e.exerciseId !== entry.exerciseId))
    await onChanged()
    notify(`${entry.name} quitado de la sesión`)
  }

  /**
   * Sustituye un ejercicio de la sesion por otro, sin salir del entrenamiento.
   *
   * Pasa en cualquier gimnasio: la maquina esta ocupada, o el ejercicio no va bien ese dia.
   *
   * Lo que NO hace, a proposito: borrar las series ya apuntadas. Se quedan donde estan, con el
   * ejercicio anterior y su nombre, porque no se borra el trabajo del usuario por un toque. Si
   * quiere quitarlas, las borra a mano. Las series nuevas se marcan con "Cambiado desde X" para
   * que despues se entienda por que hay series de dos ejercicios distintos.
   */
  const handleSwapExercise = async (viejo: ExerciseEntry, nuevo: { exerciseId: string; name: string }) => {
    /*
     * No se puede cambiar a un ejercicio que YA esta en la sesion: quedarian dos tarjetas
     * iguales y el usuario no sabria cual es cual. Se comprueba por identificador y por nombre,
     * porque dos ejercicios distintos pueden llamarse igual (por ejemplo uno de una rutina
     * antigua y otro de la biblioteca).
     */
    const otros = entries.filter((e) => e.exerciseId !== viejo.exerciseId)
    if (!sePuedeAnadir(otros, nuevo)) {
      notify(`«${nuevo.name}» ya está en esta sesión: elige otro ejercicio`)
      return
    }

    const seriesDelViejo = byExercise.get(viejo.exerciseId) ?? []
    const seriesDelNuevo = byExercise.get(nuevo.exerciseId) ?? []
    const marca = marcaDeCambio(viejo.name, nuevo.name)

    await persistEntries(sustituirEjercicio(entries, viejo.exerciseId, nuevo))
    await moveSetsToExercise(session.id, viejo.exerciseId, nuevo.exerciseId, marca)
    await onChanged()

    const aviso =
      seriesDelViejo.length > 0
        ? `${viejo.name} → ${nuevo.name}. Las ${seriesDelViejo.length} series suyas se quedan en el historial`
        : `${viejo.name} → ${nuevo.name}`
    notify(
      seriesDelNuevo.length > 0
        ? `${viejo.name} → ${nuevo.name}. Ya tenía ${seriesDelNuevo.length} series apuntadas antes`
        : aviso,
    )
  }

  const handleFinish = async () => {
    setConfirmFinish(false)
    await updateSession(session.id, {
      metrics: { ...session.metrics, notes: comment || undefined, bodyweightKg: bodyweight, energy: energy as 1 | 2 | 3 | 4 | 5 | undefined },
    })
    await onFinish()
  }

  /* ---------------------------- resumen ---------------------------- */

  const sessionVolume = totalVolume(sets)
  const workingSets = sets.filter((s) => !s.isWarmup).length

  return (
    <div className="screen" ref={topRef}>
      {/* ------------------------------ resumen ------------------------------ */}
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="badge">⏱ {formatDuration(elapsed)}</span>
          <span className="small muted">
            {workingSets} {workingSets === 1 ? 'serie' : 'series'} · {formatKilograms(sessionVolume)} de volumen
          </span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary grow" onClick={() => setConfirmFinish(true)}>
            Terminar y guardar
          </button>
          <button
            className="btn ghost"
            onClick={onBackToApp}
            title="Salir a mirar progreso o rutinas sin cerrar la sesión"
          >
            ☰
          </button>
          <button className="btn ghost" onClick={() => setConfirmDiscard(true)} aria-label="Descartar sesión">
            🗑
          </button>
        </div>
        <button
          className="tiny muted"
          style={{ background: 'transparent', border: 0, padding: '8px 0 0', textAlign: 'left' }}
          onClick={onBackToApp}
        >
          La sesión sigue abierta si sales a mirar otras pantallas →
        </button>
      </div>

      {/* ----------------------------- ejercicios ---------------------------- */}
      {orderedEntries.length === 0 ? (
        <div className="empty">
          <div className="big">🏋️</div>
          <p>Sesión libre sin ejercicios todavía.</p>
          <button className="btn primary" onClick={() => setPickerOpen(true)}>
            ＋ Añadir el primer ejercicio
          </button>
        </div>
      ) : null}

      {/*
        Los ejercicios se muestran agrupados: los sueltos por un lado y las superseries
        juntas, para que se vea de un vistazo que van encadenados y en que orden.
      */}
      {groupRoutineExercises(orderedEntries).map((grupo, indiceGrupo) => {
        const esSuperserie = grupo.kind === 'superset'
        const letra = letraDeGrupo(indiceGrupo)
        const tarjetas = grupo.exercises.map((entry, posicion) => (
          <ExerciseCard
            key={entry.exerciseId}
            entry={entry}
            sets={byExercise.get(entry.exerciseId) ?? []}
            history={history[entry.exerciseId]}
            increment={incrementFor(entry.exerciseId)}
            descripcion={library.find((e) => e.id === entry.exerciseId)?.description}
            onSaveSet={handleSaveSet}
            onRepeat={handleRepeat}
            onDeleteSet={handleDeleteSet}
            onRemoveExercise={() => void handleRemoveExercise(entry)}
            onSwapExercise={() => setSustituyendo(entry)}
            onChangeTargets={(patch) =>
              void persistEntries(entries.map((e) => (e.exerciseId === entry.exerciseId ? { ...e, ...patch } : e)))
            }
            noteOpen={openNote === entry.exerciseId}
            onToggleNote={() => setOpenNote((cur) => (cur === entry.exerciseId ? null : entry.exerciseId))}
            etiqueta={esSuperserie ? etiquetaDeSuperserie(letra, posicion) : undefined}
            claseExtra={esSuperserie ? 'inside-superset' : undefined}
            resumen={esSuperserie ? resumenEnSuperserie(grupo.exercises, posicion) : undefined}
          />
        ))

        if (!esSuperserie) return <div key={`suelto-${grupo.exercises[0].exerciseId}`}>{tarjetas}</div>

        return (
          <div key={`superserie-${letra}-${grupo.exercises[0].exerciseId}`} className="superset-block">
            <div className="superset-head">
              <span className="badge gold">Superserie {letra}</span>
              <span className="tiny muted">{resumenDeSuperserie(grupo.exercises)}</span>
            </div>
            {tarjetas}
          </div>
        )
      })}

      {orderedEntries.length > 0 ? (
        <button className="btn block" onClick={() => setPickerOpen(true)}>
          ＋ Añadir ejercicio
        </button>
      ) : null}

      {/* ------------------------------ contexto ----------------------------- */}
      <div className="card">
        <button
          className="row between"
          style={{ background: 'transparent', border: 0, width: '100%', padding: 0 }}
          onClick={() => setContextOpen((v) => !v)}
        >
          <span className="card-title" style={{ margin: 0 }}>
            Notas de la sesión
          </span>
          <span className="muted">{contextOpen ? '▾' : '▸'}</span>
        </button>
        {contextOpen ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="bw">Peso corporal (kg)</label>
                <NumberInput
                  value={bodyweight}
                  onChange={setBodyweight}
                  ariaLabel="Peso corporal"
                  placeholder="79,2"
                />
              </div>
              <div className="field">
                <label htmlFor="energy">Energía (1-5)</label>
                <div className="row" style={{ gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className={`chip${energy === n ? ' active' : ''}`}
                      style={{ flex: 1, padding: '10px 0', textAlign: 'center' }}
                      onClick={() => setEnergy(energy === n ? undefined : n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="session-notes">Sensaciones</label>
              <textarea
                id="session-notes"
                className="input"
                placeholder="Cómo ha ido, molestias, cambios…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* ------------------------------- modales ----------------------------- */}
      {/* Selector para cambiar un ejercicio por otro sin salir del entrenamiento. */}
      {sustituyendo ? (
        <ExercisePicker
          title={`Cambiar ${sustituyendo.name}`}
          subtitle="Elige el ejercicio que vas a hacer en su lugar"
          usedIds={entries.filter((e) => e.exerciseId !== sustituyendo.exerciseId).map((e) => e.exerciseId)}
          usedNames={entries.filter((e) => e.exerciseId !== sustituyendo.exerciseId).map((e) => e.name)}
          onPick={(exerciseId, name) => {
            const viejo = sustituyendo
            setSustituyendo(null)
            void handleSwapExercise(viejo, { exerciseId, name })
          }}
          onClose={() => setSustituyendo(null)}
        />
      ) : null}

      {pickerOpen ? (
        <ExercisePicker
          usedIds={orderedEntries.map((e) => e.exerciseId)}
          onPick={(id, name) => void handleAddExercise(id, name)}
          onCreate={(name) => void handleCreateExercise(name)}
          onEdit={() => notify('Los ejercicios se editan en la pestaña Ejercicios')}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {confirmFinish ? (
        <ConfirmDialog
          title="Terminar sesión"
          message={`Se guardarán ${workingSets} series con ${formatKilograms(sessionVolume)} de volumen. Después podrás consultarla en Progreso.`}
          confirmLabel="Terminar"
          onConfirm={() => void handleFinish()}
          onCancel={() => setConfirmFinish(false)}
        />
      ) : null}

      {confirmDiscard ? (
        <ConfirmDialog
          title="Descartar sesión"
          message="Se borrarán todas las series registradas en esta sesión. No se puede deshacer."
          confirmLabel="Descartar"
          onConfirm={() => void onDiscard()}
          onCancel={() => setConfirmDiscard(false)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tarjeta de ejercicio                                                */
/* ------------------------------------------------------------------ */

function ExerciseCard({
  entry,
  sets,
  history,
  increment,
  descripcion,
  onSaveSet,
  onRepeat,
  onDeleteSet,
  onRemoveExercise,
  onSwapExercise,
  onChangeTargets,
  noteOpen,
  onToggleNote,
  etiqueta,
  claseExtra,
  resumen,
}: {
  entry: ExerciseEntry
  sets: ExerciseSet[]
  history?: HistoryInfo
  increment: number
  /** Descripcion escrita por el usuario en la biblioteca de ejercicios. */
  descripcion?: string
  /** Etiqueta dentro de una superserie: A1, A2... */
  etiqueta?: string
  /** Clase para marcar visualmente que va dentro de una superserie. */
  claseExtra?: string
  /** Texto de objetivo propio de las superseries (sustituye al normal). */
  resumen?: string
  onSaveSet: (
    entry: ExerciseEntry,
    data: { weight?: number; reps?: number; rir?: number; isWarmup?: boolean; notes?: string },
    existing?: ExerciseSet,
    advanceRest?: boolean,
  ) => Promise<void>
  onRepeat: (set: ExerciseSet) => Promise<void>
  onDeleteSet: (entry: ExerciseEntry, set: ExerciseSet) => Promise<void>
  onRemoveExercise: () => void
  /** Cambiar este ejercicio por otro en mitad del entrenamiento. */
  onSwapExercise: () => void
  onChangeTargets: (patch: Partial<ExerciseEntry>) => void
  noteOpen: boolean
  onToggleNote: () => void
}) {
  const isBodyweight = sets.length > 0 && sets.every((s) => s.weight === 0)
  const lastWorking = sets.filter((s) => !s.isWarmup)
  const suggestion = useMemo(
    () => suggestNextWeight(lastWorking, entry.targetRepsMax, increment),
    [lastWorking, entry.targetRepsMax, increment],
  )
  const previous = history?.sets ?? []

  const doneCount = sets.length
  const targetReached = doneCount >= entry.targetSets

  /**
   * Plegar el ejercicio cuando ya esta hecho.
   *
   * Pedido por el usuario: al entrenar, las tarjetas de los ejercicios terminados ocupan sitio y
   * obligan a bajar. Se recoge sola al llegar a las series previstas, y se puede volver a abrir
   * (por ejemplo para apuntar una serie de mas o cambiar el peso).
   */
  const [plegado, setPlegado] = useState(false)
  const plegadoAntes = useRef(targetReached)
  useEffect(() => {
    // Solo se pliega sola AL TERMINAR: si el usuario la abre, no se vuelve a cerrar sola.
    if (targetReached && !plegadoAntes.current) setPlegado(true)
    plegadoAntes.current = targetReached
  }, [targetReached])

  return (
    <div className={`exercise-card${claseExtra ? ` ${claseExtra}` : ''}${plegado ? ' plegado' : ''}`}>
      <div className="exercise-head">
        <div className="grow">
          <div className="name">
            {etiqueta ? <span className="superset-tag">{etiqueta}</span> : null}
            {entry.name}
          </div>
          <div className="target">
            {resumen ?? targetSummary(entry.targetSets, entry.targetRepsMin, entry.targetRepsMax, entry.restSeconds)}
            {doneCount > 0 ? ` · hechas ${doneCount}/${entry.targetSets}` : ''}
          </div>
        </div>
        {targetReached ? <span className="badge live">✓</span> : null}
        {/* Plegar o desplegar: con los ejercicios ya hechos, la sesion se hace larguisima. */}
        <button
          className="icon-btn"
          onClick={() => setPlegado((v) => !v)}
          aria-label={plegado ? `Abrir ${entry.name}` : `Cerrar ${entry.name}`}
          aria-expanded={!plegado}
        >
          {plegado ? '▾' : '▴'}
        </button>
        {/* Cambiar este ejercicio por otro sin salir del entrenamiento. */}
        <button className="icon-btn" onClick={onSwapExercise} aria-label={`Cambiar ${entry.name} por otro`}>
          ⇄
        </button>
        <button className="icon-btn" onClick={onToggleNote} aria-label="Notas del ejercicio">
          {entry.notes ? '📝' : '＋'}
        </button>
        <button className="icon-btn danger" onClick={onRemoveExercise} aria-label="Quitar ejercicio">
          🗑
        </button>
      </div>

      {plegado ? (
        <div className="exercise-plegado">
          <span className="tiny muted">
            {doneCount === 0
              ? 'Sin series apuntadas'
              : `Hechas ${doneCount}/${entry.targetSets}${sets.length > 0 ? ` · ${exerciseSummary(sets)}` : ''}`}
          </span>
        </div>
      ) : null}

      <div className="exercise-body" hidden={plegado}>
        {previous.length > 0 ? (
          <div className="last-time">
            <b>Última vez:</b> {summarizeSets(previous)}
          </div>
        ) : (
          <div className="no-history">Sin referencia previa: apunta el peso para poder comparar.</div>
        )}

        {/* Descripción del ejercicio: lo que el usuario escribió en la biblioteca. */}
        {descripcion ? (
          <div className="exercise-note">
            <b>Cómo se hace:</b> {descripcion}
          </div>
        ) : null}

        {suggestion ? (
          <div className="suggestion">
            {suggestion.weight !== (lastWorking[0]?.weight ?? 0) ? '💡 ' : '· '}
            {suggestion.reason}
            {suggestion.weight !== (lastWorking[0]?.weight ?? 0)
              ? ` → prueba con ${formatNumber(suggestion.weight)} kg`
              : ''}
          </div>
        ) : null}

        {noteOpen ? (
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor={`note-${entry.exerciseId}`}>Nota del ejercicio</label>
            <input
              id={`note-${entry.exerciseId}`}
              className="input"
              placeholder="Agarre, rango, molestias…"
              value={entry.notes ?? ''}
              onChange={(e) => onChangeTargets({ notes: e.target.value })}
            />
          </div>
        ) : null}

        {sets.length > 0 ? (
          <>
            <div className="set-head">
              <span>#</span>
              <span>{isBodyweight ? 'Lastre' : 'Peso'}</span>
              <span>Reps</span>
              <span>RIR</span>
              <span />
            </div>
            {sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                entry={entry}
                onSave={onSaveSet}
                onRepeat={() => void onRepeat(set)}
                onDelete={() => void onDeleteSet(entry, set)}
              />
            ))}
          </>
        ) : null}

        <NewSetRow entry={entry} isBodyweight={isBodyweight} increment={increment} onSave={onSaveSet} />

        {sets.length > 0 ? (
          <div className="row between" style={{ marginTop: 10 }}>
            <span className="tiny muted">{exerciseSummary(sets)}</span>
            <button
              className="btn sm ghost"
              onClick={() => {
                const last = sets[sets.length - 1]
                if (last) void onRepeat(last)
              }}
            >
              ↻ Repetir última
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fila de serie ya registrada                                         */
/* ------------------------------------------------------------------ */

function SetRow({
  set,
  entry,
  onSave,
  onRepeat,
  onDelete,
}: {
  set: ExerciseSet
  entry: ExerciseEntry
  onSave: (
    entry: ExerciseEntry,
    data: { weight?: number; reps?: number; rir?: number; isWarmup?: boolean },
    existing?: ExerciseSet,
    advanceRest?: boolean,
  ) => Promise<void>
  onRepeat: () => void
  onDelete: () => void
}) {
  const [weight, setWeight] = useState<number | undefined>(set.weight)
  const [reps, setReps] = useState<number | undefined>(set.reps)
  const [rir, setRir] = useState<number | undefined>(set.rir)

  useEffect(() => {
    setWeight(set.weight)
    setReps(set.reps)
    setRir(set.rir)
  }, [set.weight, set.reps, set.rir])

  // Al salir del campo se guarda. Se usa el valor que devuelve onCommit, ya
  // ajustado, para no depender de que el estado se haya actualizado a tiempo.
  const commit = (valor?: number) => {
    void onSave(entry, { weight: valor ?? 0, reps: reps ?? 0, rir }, set, false)
  }

  return (
    <div className={`set-row done${set.isWarmup ? ' warmup' : ''}`}>
      <span className="idx">{set.setNumber}</span>
      <NumberInput
        value={weight}
        onChange={setWeight}
        onCommit={(v) => commit(v)}
        ariaLabel={`Peso serie ${set.setNumber}`}
      />
      <NumberInput
        value={reps}
        onChange={setReps}
        onCommit={commit}
        ariaLabel={`Repeticiones serie ${set.setNumber}`}
        integer
      />
      <NumberInput
        value={rir}
        onChange={setRir}
        onCommit={commit}
        ariaLabel={`RIR serie ${set.setNumber}`}
        integer
        placeholder="—"
      />
      <div className="actions">
        <button className="icon-btn" onClick={onRepeat} aria-label="Repetir serie" title="Repetir serie">
          ↻
        </button>
        <button className="icon-btn danger" onClick={onDelete} aria-label="Borrar serie">
          ✕
        </button>
      </div>
      {/*
        Nota de la serie. Aqui aparece, por ejemplo, "Cambiado desde X" cuando se ha sustituido
        el ejercicio: sin mostrarla, la marca se guardaba pero el usuario no veia por que habia
        series de dos ejercicios distintos en la misma sesion.
      */}
      {set.notes ? <div className="set-note">{set.notes}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fila para apuntar la siguiente serie                                */
/* ------------------------------------------------------------------ */

function NewSetRow({
  entry,
  isBodyweight,
  increment,
  onSave,
}: {
  entry: ExerciseEntry
  isBodyweight: boolean
  increment: number
  onSave: (
    entry: ExerciseEntry,
    data: { weight?: number; reps?: number; rir?: number; isWarmup?: boolean },
    existing?: ExerciseSet,
    advanceRest?: boolean,
  ) => Promise<void>
}) {
  const [weight, setWeight] = useState<number | undefined>(undefined)
  const [reps, setReps] = useState<number | undefined>(undefined)
  const [rir, setRir] = useState<number | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [prefilled, setPrefilled] = useState(false)

  // Al abrir el ejercicio, se precarga lo de la ultima vez para solo tener que confirmar.
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (prefilled) return
      const past = await getLastSetsForExercise(entry.exerciseId)
      if (!alive || past.length === 0) return
      const last = past.filter((s) => !s.isWarmup)
      const source = last.length > 0 ? last[last.length - 1] : past[past.length - 1]
      setWeight(source.weight)
      setReps(source.reps)
      setPrefilled(true)
    })()
    return () => {
      alive = false
    }
  }, [entry.exerciseId, prefilled])

  const save = async (isWarmup: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      await onSave(entry, { weight: weight ?? 0, reps, rir, isWarmup }, undefined, true)
      setReps(undefined)
      setRir(undefined)
    } finally {
      setBusy(false)
    }
  }

  const canSave = (reps ?? 0) > 0

  return (
    <div style={{ marginTop: 10 }}>
      <div className="set-head">
        <span>+</span>
        <span>{isBodyweight ? 'Lastre' : 'Peso'}</span>
        <span>Reps</span>
        <span>RIR</span>
        <span />
      </div>
      <div className="set-row">
        <span className="idx">＋</span>
        <NumberInput
          value={weight}
          onChange={setWeight}
          placeholder="0"
          ariaLabel="Peso de la nueva serie"
        />
        <NumberInput
          value={reps}
          onChange={setReps}
          placeholder={targetLabel(entry.targetRepsMin, entry.targetRepsMax)}
          ariaLabel="Repeticiones de la nueva serie"
          integer
        />
        <NumberInput value={rir} onChange={setRir} placeholder="—" ariaLabel="RIR de la nueva serie" integer />
        <button
          className="icon-btn"
          style={{
            background: canSave ? 'var(--accent)' : undefined,
            borderColor: canSave ? 'var(--accent)' : undefined,
            color: canSave ? 'var(--accent-ink)' : undefined,
            fontWeight: 700,
          }}
          onClick={() => void save(false)}
          disabled={!canSave || busy}
          aria-label="Guardar serie"
        >
          ✓
        </button>
      </div>
      <div className="row between" style={{ marginTop: 6 }}>
        <button className="btn sm ghost" onClick={() => void save(true)} disabled={busy}>
          + aproximación
        </button>
        <span className="tiny muted">Salto de {formatNumber(increment)} kg disponible</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function toEntry(re: RoutineExercise): ExerciseEntry {
  return {
    exerciseId: re.exerciseId,
    name: re.name,
    targetSets: re.targetSets,
    targetRepsMin: re.targetRepsMin,
    targetRepsMax: re.targetRepsMax,
    restSeconds: re.restSeconds,
    // Las superseries viajan con el ejercicio, tambien al empezar la sesion.
    kind: re.kind,
    groupSize: re.groupSize,
    transitionSeconds: re.transitionSeconds,
    notes: re.notes,
  }
}
