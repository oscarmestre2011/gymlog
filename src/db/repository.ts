import { db, newId } from './index'
import type {
  BackupFile,
  BodyMeasurement,
  CardioEntry,
  Exercise,
  ExerciseSet,
  Routine,
  RoutineExercise,
  Session,
  Settings,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { startOfWeekISO, todayISO } from '../lib/format'

export type { Settings }

/* ------------------------------------------------------------------ */
/* Sesiones                                                            */
/* ------------------------------------------------------------------ */

/** Sesion en curso, si la hay. */
export async function getActiveSession(): Promise<Session | undefined> {
  const open = await db.sessions.filter((s) => s.endedAt === null).toArray()
  return open.sort((a, b) => b.startedAt - a.startedAt)[0]
}

export async function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id)
}

/**
 * Sesiones de mas reciente a mas antigua.
 *
 * El orden es por FECHA de la sesion (que el usuario puede cambiar a mano al
 * empezar), no por el momento en que se creo el registro: si apuntas hoy la
 * sesion de ayer, debe aparecer donde le corresponde.
 */
export async function listSessions(limit?: number): Promise<Session[]> {
  const all = await db.sessions.toArray()
  const sorted = all.sort(
    (a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt,
  )
  return limit ? sorted.slice(0, limit) : sorted
}

export async function listSessionsByDate(date: string): Promise<Session[]> {
  const all = await db.sessions.where('date').equals(date).toArray()
  return all.sort((a, b) => b.startedAt - a.startedAt)
}

/**
 * Empieza una sesion. Si se pasa rutina, se congela una copia de sus ejercicios
 * para que editar la rutina despues no altere el historico.
 */
export async function startSession(input: {
  date?: string
  routine?: Routine
  routineName?: string
}): Promise<Session> {
  const routineSnapshot: RoutineExercise[] = input.routine
    ? input.routine.exercises.map((e) => ({ ...e }))
    : []
  const session: Session = {
    id: newId('s_'),
    date: input.date ?? todayISO(),
    routineId: input.routine?.id,
    routineName: input.routine?.name ?? input.routineName ?? 'Sesión libre',
    routineSnapshot,
    startedAt: Date.now(),
    endedAt: null,
    metrics: {},
  }
  await db.sessions.add(session)
  return session
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  await db.sessions.update(id, patch)
}

/** Cierra la sesion y borra sus series si quedo vacia. */
export async function finishSession(id: string): Promise<void> {
  const count = await db.sets.where('sessionId').equals(id).count()
  if (count === 0) {
    await deleteSession(id)
    return
  }
  await db.sessions.update(id, { endedAt: Date.now() })
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, db.cardio, async () => {
    await db.sets.where('sessionId').equals(id).delete()
    const cardio = await db.cardio.where('sessionId').equals(id).toArray()
    for (const c of cardio) {
      await db.cardio.update(c.id, { sessionId: undefined })
    }
    await db.sessions.delete(id)
  })
}

/** Reabre una sesion cerrada para corregir algo. */
export async function reopenSession(id: string): Promise<void> {
  await db.sessions.update(id, { endedAt: null })
}

/* ------------------------------------------------------------------ */
/* Series                                                              */
/* ------------------------------------------------------------------ */

/** Series de una sesion, ordenadas por ejercicio y numero de serie. */
export async function listSets(sessionId: string): Promise<ExerciseSet[]> {
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
  return sets.sort((a, b) => a.order - b.order || a.setNumber - b.setNumber)
}

export async function addSet(input: Omit<ExerciseSet, 'id' | 'completedAt' | 'setNumber'> & {
  setNumber?: number
  completedAt?: number
}): Promise<ExerciseSet> {
  const existing = await db.sets.where('sessionId').equals(input.sessionId).toArray()
  const sameExercise = existing.filter((s) => s.exerciseId === input.exerciseId)
  const setNumber = input.setNumber ?? sameExercise.length + 1
  const set: ExerciseSet = {
    ...input,
    id: newId('t_'),
    setNumber,
    completedAt: input.completedAt ?? Date.now(),
  }
  await db.sets.add(set)
  return set
}

export async function updateSet(id: string, patch: Partial<ExerciseSet>): Promise<void> {
  await db.sets.update(id, patch)
}

export async function deleteSet(id: string): Promise<void> {
  await db.sets.delete(id)
}

/**
 * Repite una serie (el gesto mas habitual: mismo peso, mismas reps).
 * Devuelve la serie nueva.
 */
export async function duplicateSet(setId: string): Promise<ExerciseSet | undefined> {
  const original = await db.sets.get(setId)
  if (!original) return undefined
  return addSet({
    sessionId: original.sessionId,
    exerciseId: original.exerciseId,
    exerciseName: original.exerciseName,
    order: original.order,
    weight: original.weight,
    reps: original.reps,
    rir: original.rir,
    isWarmup: original.isWarmup,
    notes: original.notes,
  })
}

/** Renumera las series de un ejercicio tras borrar una intermedia. */
export async function renumberSets(sessionId: string, exerciseId: string): Promise<void> {
  const sets = await db.sets
    .where('sessionId')
    .equals(sessionId)
    .filter((s) => s.exerciseId === exerciseId)
    .toArray()
  sets.sort((a, b) => a.setNumber - b.setNumber)
  for (let i = 0; i < sets.length; i += 1) {
    if (sets[i].setNumber !== i + 1) {
      await db.sets.update(sets[i].id, { setNumber: i + 1 })
    }
  }
}

/** Series de un ejercicio en todas las sesiones, de mas antigua a mas reciente. */
export async function listSetsByExercise(exerciseId: string): Promise<ExerciseSet[]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  return sets.sort((a, b) => a.completedAt - b.completedAt)
}

/** Variables disponibles como "ultima vez" al empezar un ejercicio. */
export async function getLastSetsForExercise(
  exerciseId: string,
  excludeSessionId?: string,
): Promise<ExerciseSet[]> {
  const sets = await listSetsByExercise(exerciseId)
  const past = sets.filter((s) => s.sessionId !== excludeSessionId)
  if (past.length === 0) return []
  const lastSessionId = past[past.length - 1].sessionId
  return past.filter((s) => s.sessionId === lastSessionId)
}

/** Ultimo peso usado con ese ejercicio (para prellenar el formulario). */
export async function getLastWeight(exerciseId: string, excludeSessionId?: string): Promise<number | undefined> {
  const last = await getLastSetsForExercise(exerciseId, excludeSessionId)
  const working = last.filter((s) => !s.isWarmup)
  const pool = working.length > 0 ? working : last
  if (pool.length === 0) return undefined
  return pool[pool.length - 1].weight
}

/** Ultima sesion en la que se hizo ese ejercicio, con fecha y series. */
export async function getLastPerformance(
  exerciseId: string,
  excludeSessionId?: string,
): Promise<{ date: string; sets: ExerciseSet[] } | undefined> {
  const sets = await listSetsByExercise(exerciseId)
  const past = sets.filter((s) => s.sessionId !== excludeSessionId)
  if (past.length === 0) return undefined
  const lastSessionId = past[past.length - 1].sessionId
  const session = await db.sessions.get(lastSessionId)
  return {
    date: session?.date ?? '',
    sets: past.filter((s) => s.sessionId === lastSessionId),
  }
}

/* ------------------------------------------------------------------ */
/* Progresion                                                          */
/* ------------------------------------------------------------------ */

export interface ExerciseSessionSummary {
  sessionId: string
  date: string
  sets: ExerciseSet[]
  workingSets: ExerciseSet[]
  topWeight: number
  totalReps: number
  volume: number
  best1RM: number
}

/**
 * Historico de un ejercicio agrupado por sesion, de mas antiguo a mas reciente.
 * Es la base de la pantalla de progresion y de los records.
 */
export async function getExerciseHistory(exerciseId: string): Promise<ExerciseSessionSummary[]> {
  const sets = await listSetsByExercise(exerciseId)
  if (sets.length === 0) return []

  const sessionIds = [...new Set(sets.map((s) => s.sessionId))]
  const sessions = await db.sessions.bulkGet(sessionIds)
  const sessionMap = new Map<string, Session>()
  for (const s of sessions) if (s) sessionMap.set(s.id, s)

  const bySession = new Map<string, ExerciseSet[]>()
  for (const s of sets) {
    const list = bySession.get(s.sessionId) ?? []
    list.push(s)
    bySession.set(s.sessionId, list)
  }

  const summaries: ExerciseSessionSummary[] = []
  for (const [sessionId, list] of bySession) {
    const session = sessionMap.get(sessionId)
    if (!session) continue
    const working = list.filter((s) => !s.isWarmup)
    const pool = working.length > 0 ? working : list
    summaries.push({
      sessionId,
      date: session.date,
      sets: list,
      workingSets: working,
      topWeight: Math.max(...pool.map((s) => s.weight)),
      totalReps: pool.reduce((acc, s) => acc + s.reps, 0),
      volume: pool.reduce((acc, s) => acc + s.weight * s.reps, 0),
      best1RM: Math.max(...pool.map((s) => estimate(s.weight, s.reps))),
    })
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId))
}

function estimate(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export interface PersonalRecord {
  exerciseId: string
  exerciseName: string
  topWeight: number
  best1RM: number
  bestSetReps: number
  date: string
}

/** Records personales de todos los ejercicios que tienen historico. */
export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const all = await db.sets.toArray()
  const sessions = await db.sessions.toArray()
  const dateBySession = new Map(sessions.map((s) => [s.id, s.date]))

  const byExercise = new Map<string, ExerciseSet[]>()
  for (const s of all) {
    const list = byExercise.get(s.exerciseId) ?? []
    list.push(s)
    byExercise.set(s.exerciseId, list)
  }

  const records: PersonalRecord[] = []
  for (const [exerciseId, sets] of byExercise) {
    const working = sets.filter((s) => !s.isWarmup)
    const pool = working.length > 0 ? working : sets
    if (pool.length === 0) continue
    const best1RMset = pool.reduce((best, s) => (estimate(s.weight, s.reps) > estimate(best.weight, best.reps) ? s : best))
    const top = pool.reduce((best, s) => (s.weight > best.weight ? s : best))
    records.push({
      exerciseId,
      exerciseName: pool[0].exerciseName,
      topWeight: top.weight,
      best1RM: estimate(best1RMset.weight, best1RMset.reps),
      bestSetReps: Math.max(...pool.map((s) => s.reps)),
      date: dateBySession.get(top.sessionId) ?? '',
    })
  }

  return records.sort((a, b) => b.best1RM - a.best1RM)
}

/** Ejercicios distintos con historico, para el selector de progresion. */
export async function listTrainedExercises(): Promise<{ id: string; name: string; sets: number }[]> {
  const all = await db.sets.toArray()
  const map = new Map<string, { id: string; name: string; sets: number }>()
  for (const s of all) {
    const found = map.get(s.exerciseId)
    if (found) found.sets += 1
    else map.set(s.exerciseId, { id: s.exerciseId, name: s.exerciseName, sets: 1 })
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets)
}

/** Volumen total de trabajo por semana ISO, para ver tendencia. */
export async function getWeeklyVolume(weeks = 8): Promise<{ weekStart: string; volume: number; sets: number }[]> {
  const sessions = await db.sessions.toArray()
  const sets = await db.sets.toArray()
  const dateBySession = new Map(sessions.map((s) => [s.id, s.date]))

  const buckets = new Map<string, { volume: number; sets: number }>()
  for (const s of sets) {
    if (s.isWarmup) continue
    const date = dateBySession.get(s.sessionId)
    if (!date) continue
    const monday = startOfWeekISO(date)
    const b = buckets.get(monday) ?? { volume: 0, sets: 0 }
    b.volume += s.weight * s.reps
    b.sets += 1
    buckets.set(monday, b)
  }

  return [...buckets.entries()]
    .map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-weeks)
}

/** Estadisticas globales para la portada. */
export async function getStats(): Promise<{
  sessions: number
  sets: number
  volume: number
  cardioKm: number
  lastSessionDate?: string
  streakWeeks: number
}> {
  const sessions = await db.sessions.toArray()
  const sets = await db.sets.toArray()
  const cardio = await db.cardio.toArray()
  const finished = sessions.filter((s) => s.endedAt !== null)
  const dates = [...new Set(finished.map((s) => s.date))].sort()
  const weekSet = new Set(dates.map(startOfWeekISO))

  let streak = 0
  if (weekSet.size > 0) {
    let cursor = startOfWeekISO(todayISO())
    if (!weekSet.has(cursor)) cursor = addDays(cursor, -7)
    while (weekSet.has(cursor)) {
      streak += 1
      cursor = addDays(cursor, -7)
    }
  }

  return {
    sessions: finished.length,
    sets: sets.length,
    volume: sets.filter((s) => !s.isWarmup).reduce((acc, s) => acc + s.weight * s.reps, 0),
    cardioKm: cardio.reduce((acc, c) => acc + (c.distanceKm ?? 0), 0),
    lastSessionDate: dates[dates.length - 1],
    streakWeeks: streak,
  }
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return todayISO(date)
}

/* ------------------------------------------------------------------ */
/* Ejercicios y rutinas                                                */
/* ------------------------------------------------------------------ */

export async function listExercises(): Promise<Exercise[]> {
  const all = await db.exercises.toArray()
  return all.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id)
}

export async function findExerciseByName(name: string): Promise<Exercise | undefined> {
  const all = await db.exercises.toArray()
  const target = normalize(name)
  return all.find((e) => normalize(e.name) === target)
}

/**
 * Cuantos entrenamientos usan cada ejercicio.
 *
 * Sirve para avisar antes de borrar o cambiar el nombre de un ejercicio: las series ya
 * registradas guardan una copia del nombre, asi que el historico no se rompe, pero
 * conviene decir cuantas veces se ha usado.
 */
export async function countSetsByExercise(): Promise<Record<string, number>> {
  const sets = await db.sets.toArray()
  const cuenta: Record<string, number> = {}
  for (const set of sets) {
    cuenta[set.exerciseId] = (cuenta[set.exerciseId] ?? 0) + 1
  }
  return cuenta
}

export async function upsertExercise(input: Omit<Exercise, 'createdAt'> & { createdAt?: number }): Promise<Exercise> {
  const existing = await db.exercises.get(input.id)
  const exercise: Exercise = {
    ...input,
    createdAt: input.createdAt ?? existing?.createdAt ?? Date.now(),
  }
  await db.exercises.put(exercise)
  return exercise
}

export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id)
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export async function listRoutines(): Promise<Routine[]> {
  const all = await db.routines.toArray()
  return all.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name, 'es'))
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  return db.routines.get(id)
}

export async function saveRoutine(routine: Routine): Promise<void> {
  await db.routines.put({ ...routine, updatedAt: Date.now() })
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.routines.delete(id)
}

/** Duplica una rutina para variantes (por ejemplo "Fuerza A - casa"). */
export async function duplicateRoutine(id: string): Promise<Routine | undefined> {
  const original = await db.routines.get(id)
  if (!original) return undefined
  const copy: Routine = {
    ...original,
    id: newId('r_'),
    name: `${original.name} (copia)`,
    code: undefined,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.routines.add(copy)
  return copy
}

/* ------------------------------------------------------------------ */
/* Cardio                                                              */
/* ------------------------------------------------------------------ */

export async function listCardio(limit?: number): Promise<CardioEntry[]> {
  const all = await db.cardio.toArray()
  const sorted = all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  return limit ? sorted.slice(0, limit) : sorted
}

export async function listCardioByDate(date: string): Promise<CardioEntry[]> {
  return db.cardio.where('date').equals(date).toArray()
}

export async function saveCardio(entry: CardioEntry): Promise<void> {
  await db.cardio.put(entry)
}

export async function deleteCardio(id: string): Promise<void> {
  await db.cardio.delete(id)
}

/**
 * Mueve las series de un ejercicio a otro dentro de la misma sesion.
 *
 * Se usa al SUSTITUIR un ejercicio durante el entrenamiento. Las series no se borran: pasan al
 * ejercicio nuevo y se quedan marcadas con el nombre anterior, porque lo que se apunto con el
 * ejercicio de antes no es el de ahora.
 *
 * Se numeran DESPUES de las que ya tuviera el ejercicio nuevo, para que la numeracion sea
 * correlativa y no haya dos series con el mismo numero.
 */
export async function moveSetsToExercise(
  sessionId: string,
  ejercicioViejo: string,
  ejercicioNuevo: string,
  nota?: string,
): Promise<number> {
  const deLaSesion = await db.sets.where('sessionId').equals(sessionId).toArray()
  const afectadas = deLaSesion
    .filter((s) => s.exerciseId === ejercicioViejo)
    .sort((a, b) => a.setNumber - b.setNumber || a.completedAt - b.completedAt)
  if (afectadas.length === 0) return 0

  const yaEnElNuevo = deLaSesion.filter((s) => s.exerciseId === ejercicioNuevo).length

  await db.transaction('rw', db.sets, async () => {
    for (let i = 0; i < afectadas.length; i += 1) {
      const serie = afectadas[i]
      await db.sets.put({
        ...serie,
        exerciseId: ejercicioNuevo,
        // El nombre ANTERIOR se conserva: es lo que se estaba haciendo cuando se apunto.
        setNumber: yaEnElNuevo + i + 1,
        notes: [serie.notes, nota].filter(Boolean).join(' · ') || undefined,
      })
    }
  })

  return afectadas.length
}

/* ------------------------------------------------------------------ */
/* Medidas corporales                                                  */
/* ------------------------------------------------------------------ */

/**
 * Medidas corporales, de la mas reciente a la mas antigua.
 *
 * Se guardan aparte de las sesiones a proposito: se toman cada dos semanas, no todos los
 * dias, y se consultan como una serie temporal (peso y cintura sobre todo).
 */
export async function listMeasurements(): Promise<BodyMeasurement[]> {
  const todas = await db.measurements.toArray()
  return todas.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

export async function getMeasurement(id: string): Promise<BodyMeasurement | undefined> {
  return db.measurements.get(id)
}

/** Medida de una fecha concreta, si existe (una por dia). */
export async function getMeasurementByDate(date: string): Promise<BodyMeasurement | undefined> {
  const delDia = await db.measurements.where('date').equals(date).toArray()
  return delDia.sort((a, b) => b.createdAt - a.createdAt)[0]
}

export async function saveMeasurement(medicion: BodyMeasurement): Promise<void> {
  await db.measurements.put(medicion)
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db.measurements.delete(id)
}

/* ------------------------------------------------------------------ */
/* Copia de seguridad                                                  */
/* ------------------------------------------------------------------ */

export async function exportBackup(): Promise<BackupFile> {
  const [exercises, routines, sessions, sets, cardio, measurements, settings] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.sessions.toArray(),
    db.sets.toArray(),
    db.cardio.toArray(),
    db.measurements.toArray(),
    db.settings.toArray(),
  ])
  return {
    format: 'gymlog-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { exercises, routines, sessions, sets, cardio, measurements, settings },
  }
}

export type ImportMode = 'merge' | 'replace'

/** Importa una copia. En modo replace borra todo antes (pide confirmacion en la UI). */
export async function importBackup(
  backup: BackupFile,
  mode: ImportMode = 'merge',
): Promise<{ sessions: number; sets: number }> {
  if (backup.format !== 'gymlog-backup') {
    throw new Error('El archivo no es una copia de GymLog')
  }
  const {
    exercises = [],
    routines = [],
    sessions = [],
    sets = [],
    cardio = [],
    measurements = [],
    settings = [],
  } = backup.data ?? {}

  await db.transaction(
    'rw',
    [db.exercises, db.routines, db.sessions, db.sets, db.cardio, db.measurements, db.settings],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.exercises.clear(),
          db.routines.clear(),
          db.sessions.clear(),
          db.sets.clear(),
          db.cardio.clear(),
          db.measurements.clear(),
        ])
      }
      await db.exercises.bulkPut(exercises)
      await db.routines.bulkPut(routines)
      await db.sessions.bulkPut(sessions)
      await db.sets.bulkPut(sets)
      await db.cardio.bulkPut(cardio)
      await db.measurements.bulkPut(measurements)
      if (settings.length > 0) await db.settings.bulkPut(settings)
    },
  )

  return { sessions: sessions.length, sets: sets.length }
}

export async function wipeAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.exercises, db.routines, db.sessions, db.sets, db.cardio, db.measurements, db.settings],
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.routines.clear(),
        db.sessions.clear(),
        db.sets.clear(),
        db.cardio.clear(),
        db.measurements.clear(),
      ])
      await db.settings.put({ ...DEFAULT_SETTINGS })
    },
  )
}

/* Los ajustes viven en ./index (junto a la base de datos), pero se reexportan
   aqui para que las pantallas tengan un unico punto de entrada al almacen. */
export { getSettings, saveSettings } from './index'
