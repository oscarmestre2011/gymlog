import Dexie, { type Table } from 'dexie'
import type {
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
