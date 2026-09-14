/**
 * Pruebas de la capa de datos sobre IndexedDB simulado.
 *
 * Comprueban lo que de verdad importa: que el historico no se pierda, que las
 * sesiones guarden una copia de la rutina y que la copia de seguridad vaya y vuelva.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId } from './index'
import { seedIfEmpty } from './seed'
import {
  addSet,
  deleteSession,
  deleteSet,
  duplicateSet,
  exportBackup,
  finishSession,
  getActiveSession,
  getExerciseHistory,
  getLastPerformance,
  getPersonalRecords,
  getStats,
  getWeeklyVolume,
  importBackup,
  listRoutines,
  listSessions,
  listSets,
  reopenSession,
  renumberSets,
  saveRoutine,
  startSession,
  updateSet,
} from './repository'
import { suggestNextWeight } from '../lib/format'

async function resetDatabase() {
  await Promise.all([
    db.exercises.clear(),
    db.routines.clear(),
    db.sessions.clear(),
    db.sets.clear(),
    db.cardio.clear(),
    db.settings.clear(),
  ])
}

/**
 * Crea una sesion con las series indicadas.
 * Queda cerrada al terminar, salvo que se pida dejarla abierta (sesion en curso).
 */
async function seedSession(
  date: string,
  entries: { exerciseId: string; name: string; weight: number; reps: number; sets?: number; isWarmup?: boolean }[],
  options: { leaveOpen?: boolean } = {},
) {
  const session = await startSession({ date })
  let order = 0
  for (const entry of entries) {
    const count = entry.sets ?? 1
    for (let i = 0; i < count; i += 1) {
      await addSet({
        sessionId: session.id,
        exerciseId: entry.exerciseId,
        exerciseName: entry.name,
        order,
        weight: entry.weight,
        reps: entry.reps,
        isWarmup: entry.isWarmup ?? false,
      })
    }
    order += 1
  }
  if (!options.leaveOpen) await finishSession(session.id)
  return session
}

describe('sembrado inicial', () => {
  beforeEach(resetDatabase)

  it('crea ejercicios y rutinas la primera vez', async () => {
    const result = await seedIfEmpty()
    expect(result.exercises).toBeGreaterThan(20)
    expect(result.routines).toBeGreaterThan(2)

    const routines = await listRoutines()
    const codes = routines.map((r) => r.code)
    expect(codes).toContain('A')
    expect(codes).toContain('B')
    expect(codes).toContain('C')
  })

  it('no vuelve a sembrar si ya hay datos', async () => {
    await seedIfEmpty()
    const second = await seedIfEmpty()
    expect(second).toEqual({ exercises: 0, routines: 0 })
  })

  it('cada ejercicio de rutina apunta a un ejercicio real de la biblioteca', async () => {
    await seedIfEmpty()
    const exercises = await db.exercises.toArray()
    const ids = new Set(exercises.map((e) => e.id))
    for (const routine of await listRoutines()) {
      for (const entry of routine.exercises) {
        expect(ids.has(entry.exerciseId)).toBe(true)
      }
    }
  })
})

describe('sesiones y series', () => {
  beforeEach(resetDatabase)

  it('guarda una copia de la rutina al empezar la sesion', async () => {
    await seedIfEmpty()
    const routine = (await listRoutines())[0]
    const session = await startSession({ routine })
    expect(session.routineSnapshot).toHaveLength(routine.exercises.length)

    // Editar la rutina despues no debe alterar la sesion ya empezada.
    const renamed = { ...routine, name: 'Otro nombre', exercises: [] }
    await saveRoutine(renamed)
    const stored = await db.sessions.get(session.id)
    expect(stored?.routineSnapshot).toHaveLength(routine.exercises.length)
    expect(stored?.routineName).toBe(routine.name)
  })

  it('numera las series por ejercicio', async () => {
    const session = await startSession({})
    for (let i = 0; i < 3; i += 1) {
      await addSet({
        sessionId: session.id,
        exerciseId: 'ex1',
        exerciseName: 'Press banca',
        order: 0,
        weight: 45,
        reps: 12,
        isWarmup: false,
      })
    }
    const sets = await listSets(session.id)
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3])
  })

  it('renumera al borrar una serie intermedia', async () => {
    const session = await startSession({})
    for (let i = 0; i < 3; i += 1) {
      await addSet({
        sessionId: session.id,
        exerciseId: 'ex1',
        exerciseName: 'Press banca',
        order: 0,
        weight: 45,
        reps: 12,
        isWarmup: false,
      })
    }
    const sets = await listSets(session.id)
    await deleteSet(sets[1].id)
    await renumberSets(session.id, 'ex1')
    const refreshed = await listSets(session.id)
    expect(refreshed.map((s) => s.setNumber)).toEqual([1, 2])
  })

  it('repite una serie con el mismo peso y reps', async () => {
    const session = await startSession({})
    const original = await addSet({
      sessionId: session.id,
      exerciseId: 'ex1',
      exerciseName: 'Press banca',
      order: 0,
      weight: 47.5,
      reps: 10,
      rir: 2,
      isWarmup: false,
    })
    const copy = await duplicateSet(original.id)
    expect(copy?.weight).toBe(47.5)
    expect(copy?.reps).toBe(10)
    expect(copy?.rir).toBe(2)
    expect(copy?.setNumber).toBe(2)
  })

  it('detecta la sesion en curso y la cierra', async () => {
    const session = await startSession({})
    await addSet({
      sessionId: session.id,
      exerciseId: 'ex1',
      exerciseName: 'Press banca',
      order: 0,
      weight: 45,
      reps: 10,
      isWarmup: false,
    })
    expect((await getActiveSession())?.id).toBe(session.id)

    await finishSession(session.id)
    expect(await getActiveSession()).toBeUndefined()

    await reopenSession(session.id)
    expect((await getActiveSession())?.id).toBe(session.id)
  })

  it('borra una sesion vacia al terminarla, en vez de dejar basura', async () => {
    const session = await startSession({})
    await finishSession(session.id)
    expect(await db.sessions.get(session.id)).toBeUndefined()
  })

  it('al borrar una sesion se llevan sus series y el cardio se conserva', async () => {
    const session = await seedSession('2026-08-24', [
      { exerciseId: 'ex1', name: 'Back squat', weight: 50, reps: 10 },
    ])
    await db.cardio.add({
      id: newId('c_'),
      sessionId: session.id,
      activity: 'Bici',
      date: '2026-08-24',
      durationMin: 110,
      distanceKm: 42.27,
      createdAt: Date.now(),
    })

    await deleteSession(session.id)
    expect(await db.sets.where('sessionId').equals(session.id).count()).toBe(0)
    const cardio = await db.cardio.toArray()
    expect(cardio).toHaveLength(1)
    expect(cardio[0].sessionId).toBeUndefined()
  })
})

describe('historico y progresion', () => {
  beforeEach(resetDatabase)

  it('excluye las series de aproximacion del volumen y del resumen', async () => {
    await seedSession('2026-08-17', [
      { exerciseId: 'ex1', name: 'Press banca', weight: 20, reps: 10, isWarmup: true },
      { exerciseId: 'ex1', name: 'Press banca', weight: 45, reps: 12, sets: 3 },
    ])
    const history = await getExerciseHistory('ex1')
    expect(history).toHaveLength(1)
    expect(history[0].volume).toBe(45 * 12 * 3)
    expect(history[0].topWeight).toBe(45)
    expect(history[0].totalReps).toBe(36)
  })

  it('ordena el historico de mas antiguo a mas reciente y calcula el 1RM', async () => {
    await seedSession('2026-08-10', [{ exerciseId: 'ex1', name: 'Back squat', weight: 40, reps: 10 }])
    await seedSession('2026-08-17', [{ exerciseId: 'ex1', name: 'Back squat', weight: 45, reps: 12 }])
    await seedSession('2026-08-24', [{ exerciseId: 'ex1', name: 'Back squat', weight: 50, reps: 10 }])

    const history = await getExerciseHistory('ex1')
    expect(history.map((h) => h.date)).toEqual(['2026-08-10', '2026-08-17', '2026-08-24'])
    expect(history[0].topWeight).toBe(40)
    expect(history[2].topWeight).toBe(50)
    // 45 kg x 12 reps -> 45 * (1 + 12/30) = 63
    expect(history[1].best1RM).toBeCloseTo(63, 5)
  })

  it('cuenta los records personales', async () => {
    await seedSession('2026-08-17', [{ exerciseId: 'ex1', name: 'Press banca', weight: 45, reps: 12 }])
    await seedSession('2026-08-24', [{ exerciseId: 'ex2', name: 'Back squat', weight: 50, reps: 10 }])
    const records = await getPersonalRecords()
    expect(records).toHaveLength(2)
    expect(records.map((r) => r.exerciseName).sort()).toEqual(['Back squat', 'Press banca'])
    expect(records.find((r) => r.exerciseName === 'Back squat')?.topWeight).toBe(50)
  })

  it('trae la ultima vez que se hizo un ejercicio, sin contar la sesion actual', async () => {
    await seedSession('2026-08-17', [
      { exerciseId: 'ex1', name: 'Press militar', weight: 12.5, reps: 12, sets: 3 },
    ])
    const current = await seedSession('2026-08-24', [
      { exerciseId: 'ex1', name: 'Press militar', weight: 15, reps: 10 },
    ])
    const last = await getLastPerformance('ex1', current.id)
    expect(last?.date).toBe('2026-08-17')
    expect(last?.sets).toHaveLength(3)
    expect(last?.sets[0].weight).toBe(12.5)
  })

  it('propone subir de peso cuando se completa el tope de repeticiones', async () => {
    await seedSession('2026-08-17', [
      { exerciseId: 'ex1', name: 'Face pull', weight: 30, reps: 12, sets: 4 },
    ])
    const history = await getExerciseHistory('ex1')
    const suggestion = suggestNextWeight(history[0].workingSets, 12, 2.5)
    expect(suggestion?.weight).toBe(32.5)
  })

  it('agrupa el volumen por semana empezando en lunes', async () => {
    await seedSession('2026-08-24', [{ exerciseId: 'ex1', name: 'Press banca', weight: 50, reps: 10 }])
    await seedSession('2026-08-26', [{ exerciseId: 'ex2', name: 'Jalón polea', weight: 52.5, reps: 10 }])
    await seedSession('2026-09-02', [{ exerciseId: 'ex1', name: 'Press banca', weight: 50, reps: 8 }])

    const weeks = await getWeeklyVolume(8)
    expect(weeks).toHaveLength(2)
    expect(weeks[0].weekStart).toBe('2026-08-24')
    expect(weeks[0].volume).toBe(50 * 10 + 52.5 * 10)
    expect(weeks[0].sets).toBe(2)
    expect(weeks[1].weekStart).toBe('2026-08-31')
  })

  it('resume estadisticas globales y racha de semanas', async () => {
    await seedSession('2026-08-24', [{ exerciseId: 'ex1', name: 'Press banca', weight: 50, reps: 10 }])
    const stats = await getStats()
    expect(stats.sessions).toBe(1)
    expect(stats.sets).toBe(1)
    expect(stats.volume).toBe(500)
    expect(stats.lastSessionDate).toBe('2026-08-24')
  })

  it('no cuenta sesiones sin terminar en las estadisticas', async () => {
    await seedSession(
      '2026-08-24',
      [{ exerciseId: 'ex1', name: 'Press banca', weight: 50, reps: 10 }],
      { leaveOpen: true },
    )
    const stats = await getStats()
    expect(stats.sessions).toBe(0)
    expect(stats.sets).toBe(1)
  })

  it('permite corregir una serie ya guardada', async () => {
    const session = await seedSession('2026-08-24', [
      { exerciseId: 'ex1', name: 'Press banca', weight: 45, reps: 12 },
    ])
    const [set] = await listSets(session.id)
    await updateSet(set.id, { weight: 47.5, reps: 10 })
    const [updated] = await listSets(session.id)
    expect(updated.weight).toBe(47.5)
    expect(updated.reps).toBe(10)
  })
})

describe('copia de seguridad', () => {
  beforeEach(resetDatabase)

  it('exporta e importa sin perder nada', async () => {
    await seedIfEmpty()
    const session = await seedSession('2026-08-24', [
      { exerciseId: 'ex1', name: 'Back squat', weight: 50, reps: 10, sets: 4 },
    ])
    await db.cardio.add({
      id: newId('c_'),
      activity: 'Bici',
      date: '2026-08-24',
      durationMin: 110,
      distanceKm: 42.27,
      elevationM: 190,
      createdAt: Date.now(),
    })

    const backup = await exportBackup()
    expect(backup.format).toBe('gymlog-backup')
    expect(backup.data.sessions).toHaveLength(1)
    expect(backup.data.sets).toHaveLength(4)

    await resetDatabase()
    expect(await db.sets.count()).toBe(0)

    const result = await importBackup(backup)
    expect(result.sessions).toBe(1)
    expect(result.sets).toBe(4)
    expect(await db.cardio.count()).toBe(1)
    expect((await listSets(session.id)).length).toBe(4)
    expect((await listRoutines()).length).toBeGreaterThan(0)
  })

  it('rechaza un archivo que no es de GymLog', async () => {
    await expect(importBackup({ format: 'otra-cosa' } as never)).rejects.toThrow()
  })

  it('en modo replace deja solo el contenido de la copia', async () => {
    await seedIfEmpty()
    const backup = await exportBackup()

    // Se anade basura posterior que debe desaparecer al reemplazar.
    await seedSession('2026-09-01', [{ exerciseId: 'x', name: 'Inventado', weight: 1, reps: 1 }])
    expect(await db.sessions.count()).toBe(1)

    await importBackup(backup, 'replace')
    expect(await db.sessions.count()).toBe(0)
    expect(await db.exercises.count()).toBe(backup.data.exercises.length)
  })
})

describe('listados', () => {
  beforeEach(resetDatabase)

  it('devuelve las sesiones de la mas reciente a la mas antigua', async () => {
    await seedSession('2026-08-17', [{ exerciseId: 'a', name: 'A', weight: 10, reps: 10 }])
    await seedSession('2026-08-24', [{ exerciseId: 'b', name: 'B', weight: 10, reps: 10 }])
    await seedSession('2026-08-19', [{ exerciseId: 'c', name: 'C', weight: 10, reps: 10 }])
    const sessions = await listSessions()
    expect(sessions.map((s) => s.date)).toEqual(['2026-08-24', '2026-08-19', '2026-08-17'])
  })
})
