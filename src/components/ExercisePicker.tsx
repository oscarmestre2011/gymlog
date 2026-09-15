import { useEffect, useMemo, useState } from 'react'
import type { ExerciseSet, MuscleGroup, Exercise } from '../types'
import { listExercises } from '../db/repository'
import { useQuery } from '../hooks'
import { Modal } from './Modal'

const GROUPS: MuscleGroup[] = [
  'Pecho',
  'Espalda',
  'Hombro',
  'Biceps',
  'Triceps',
  'Cuadriceps',
  'Femoral',
  'Gluteo',
  'Gemelo',
  'Core',
  'Cuerpo completo',
]

/** Selector de ejercicio con buscador. Prioriza los que ya usas. */
export function ExercisePicker({
  onPick,
  onClose,
  onCreate,
  onEdit,
  usedIds = [],
  usedNames = [],
  title = 'Añadir ejercicio',
  subtitle,
}: {
  onPick: (exerciseId: string, name: string) => void
  onClose: () => void
  onCreate?: (name: string) => void
  /** Avisa de donde se editan los ejercicios (la biblioteca). */
  onEdit?: () => void
  usedIds?: string[]
  /** Nombres que ya estan en la sesion: no se ofrecen, para no repetir ejercicios. */
  usedNames?: string[]
  /** Titulo propio: al sustituir un ejercicio se dice cual se esta cambiando. */
  title?: string
  subtitle?: string
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'Todos' | 'Frecuentes'>('Frecuentes')
  const { data: exercises, loading } = useQuery(() => listExercises(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const all = exercises ?? []
    const normalized = normalize(query)
    let pool = all

    if (group === 'Frecuentes') {
      const favs = all.filter((e) => e.favorite || usedIds.includes(e.id))
      pool = favs.length > 0 ? favs : all
    } else if (group !== 'Todos') {
      pool = all.filter((e) => e.group === group)
    }

    if (!normalized) return pool.slice(0, 80)
    return pool.filter((e) => normalize(e.name).includes(normalized)).slice(0, 80)
  }, [exercises, group, query, usedIds])

  /**
   * Se marcan los que ya estan en la sesion, para que se vea antes de elegirlos.
   *
   * Se compara por identificador Y por nombre: dos ejercicios distintos pueden llamarse igual (uno
   * de una rutina antigua y otro de la biblioteca), y en la sesion eso deja dos tarjetas iguales.
   * Al sustituir un ejercicio, elegir uno repetido no tiene sentido, asi que se avisa aqui.
   */
  const yaEnLaSesion = (ejercicio: Exercise) =>
    usedIds.includes(ejercicio.id) ||
    usedNames.some((n) => n.trim().toLowerCase().replace(/\s+/g, ' ') === ejercicio.name.trim().toLowerCase().replace(/\s+/g, ' '))

  const exactExists = useMemo(() => {
    const normalized = normalize(query)
    if (!normalized) return true
    return (exercises ?? []).some((e) => normalize(e.name) === normalized)
  }, [exercises, query])

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <input
        className="input"
        placeholder="Buscar: press, squat, jalón…"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar ejercicio"
      />

      <div className="chips" style={{ marginTop: 12 }}>
        {(['Frecuentes', 'Todos', ...GROUPS] as (MuscleGroup | 'Todos' | 'Frecuentes')[]).map((g) => (
          <button
            key={g}
            className={`chip${group === g ? ' active' : ''}`}
            onClick={() => setGroup(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {onCreate && query.trim().length >= 3 && !exactExists ? (
        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          onClick={() => onCreate(query.trim())}
        >
          ＋ Crear «{query.trim()}»
        </button>
      ) : null}

      {loading ? (
        <div className="spinner" />
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="big">🔍</div>
          Ningún ejercicio coincide con «{query}».
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Puedes crearlo aquí, y luego completar su descripción y la parte del cuerpo en la pestaña
            Ejercicios.
          </p>
        </div>
      ) : (
        <div className="list" style={{ marginTop: 8, maxHeight: '46dvh', overflowY: 'auto' }}>
          {filtered.map((exercise) => {
            const repetido = yaEnLaSesion(exercise)
            return (
              <button
                key={exercise.id}
                className="list-item"
                style={{
                  background: 'transparent',
                  border: 0,
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'left',
                  width: '100%',
                  opacity: repetido ? 0.45 : 1,
                }}
                // Un ejercicio que ya esta en la sesion no se puede volver a poner: dejaria dos
                // tarjetas iguales.
                disabled={repetido}
                onClick={() => onPick(exercise.id, exercise.name)}
              >
                <div className="main">
                  <div className="title">
                    {exercise.name}
                    {exercise.custom ? (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        mío
                      </span>
                    ) : null}
                    {repetido ? (
                      <span className="badge" style={{ marginLeft: 8 }} title="Ya está en la sesión">
                        ya en la sesión
                      </span>
                    ) : null}
                  </div>
                <div className="meta">
                  {exercise.group} · {exercise.equipment}
                  {exercise.side !== 'bilateral' ? ` · ${exercise.side.replace('-', ' ')}` : ''}
                </div>
                {/*
                  La descripcion se ve AQUI, al elegir el ejercicio: es justo el momento en
                  que hace falta recordar como se hacia.
                */}
                {exercise.description ? (
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    {exercise.description}
                  </div>
                ) : null}
              </div>
              {exercise.favorite ? <span className="badge">★</span> : null}
            </button>
            )
          })}
        </div>
      )}
      {onEdit ? (
        <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Para cambiar la descripción o la parte del cuerpo de un ejercicio, ve a la pestaña{' '}
          <b>Ejercicios</b>.
        </p>
      ) : null}
    </Modal>
  )
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Resumen corto de una serie para la "ultima vez". */
export function summarizeSets(sets: ExerciseSet[]): string {
  const working = sets.filter((s) => !s.isWarmup)
  const pool = working.length > 0 ? working : sets
  return pool
    .map((s) => (s.weight > 0 ? `${s.reps}×${s.weight}kg` : `${s.reps} reps`))
    .join(' · ')
}
