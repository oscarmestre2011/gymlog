import Dexie, { type Table } from 'dexie'
import type {
  BodyMeasurement,
  CardioEntry,
  Exercise,
  ExerciseSet,
  Routine,
  Session,
  Settings,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'

/**
 * Base de datos local (IndexedDB). Sin servidor: todo vive en el dispositivo.
 * Los indices estan elegidos para que las consultas de progresion sean baratas.
 */
export class GymLogDB extends Dexie {
  exercises!: Table<Exercise, string>
  routines!: Table<Routine, string>
  sessions!: Table<Session, string>
  sets!: Table<ExerciseSet, string>
  cardio!: Table<CardioEntry, string>
  measurements!: Table<BodyMeasurement, string>
  settings!: Table<Settings, string>

  constructor(name = 'gymlog') {
    super(name)
    this.version(1).stores({
      exercises: 'id, name, group, favorite',
      routines: 'id, name, updatedAt',
      sessions: 'id, date, startedAt, routineId',
      sets: 'id, sessionId, exerciseId, completedAt, [exerciseId+completedAt]',
      cardio: 'id, date, sessionId, activity',
      settings: 'id',
    })
    // Version 2: se anaden ajustes nuevos (pantalla encendida y duracion del aviso).
    // La estructura no cambia; los ajustes ya guardados se completan solos al leerlos,
    // mezclando lo que hay con los valores por defecto (ver getSettings).
    this.version(2).stores({
      exercises: 'id, name, group, favorite',
      routines: 'id, name, updatedAt',
      sessions: 'id, date, startedAt, routineId',
      sets: 'id, sessionId, exerciseId, completedAt, [exerciseId+completedAt]',
      cardio: 'id, date, sessionId, activity',
      settings: 'id',
    })
    // Version 3: medidas corporales (peso, abdomen, pecho, muslo).
    this.version(3).stores({
      exercises: 'id, name, group, favorite',
      routines: 'id, name, updatedAt',
      sessions: 'id, date, startedAt, routineId',
      sets: 'id, sessionId, exerciseId, completedAt, [exerciseId+completedAt]',
      cardio: 'id, date, sessionId, activity',
      measurements: 'id, date',
      settings: 'id',
    })
  }
}

export const db = new GymLogDB()

/** Identificador unico sin dependencias externas. */
export function newId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}${Date.now().toString(36)}${rand}`
}

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get('app')
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'app' })
}
