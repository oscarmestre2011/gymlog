/**
 * Modelo de datos de GymLog.
 *
 * Decisiones de diseno:
 * - Las sesiones guardan una COPIA del nombre del ejercicio y del objetivo de la rutina
 *   ("snapshot"). Asi, cambiar o borrar una rutina nunca reescribe el historico.
 * - Las series viven en su propia tabla para poder agregar progresion sin recorrer sesiones.
 * - Todo es local: no hay servidor, no hay cuentas, no hay red.
 */

/** Zona muscular / grupo entrenado. */
export type MuscleGroup =
  | 'Cuadriceps'
  | 'Femoral'
  | 'Gluteo'
  | 'Gemelo'
  | 'Pecho'
  | 'Espalda'
  | 'Hombro'
  | 'Triceps'
  | 'Biceps'
  | 'Core'
  | 'Cuerpo completo'

/** Material necesario para el ejercicio. */
export type Equipment =
  | 'Barra'
  | 'Mancuernas'
  | 'Maquina'
  | 'Polea'
  | 'Peso corporal'
  | 'Banda elastica'
  | 'Otro'

export type ExerciseSide = 'bilateral' | 'unilateral' | 'por-lado'

/** Ejercicio de la biblioteca. */
export interface Exercise {
  id: string
  name: string
  group: MuscleGroup
  equipment: Equipment
  side: ExerciseSide
  notes?: string
  /** Incremento minimo de disco disponible en la maquina/barra, en kg. */
  increment: number
  /** Marca los ejercicios que aparecen en el plan del usuario. */
  favorite?: boolean
  createdAt: number
}

/** Ejercicio dentro de una rutina, con su objetivo. */
export interface RoutineExercise {
  exerciseId: string
  /** Nombre congelado para mostrarlo aunque el ejercicio se renombre. */
  name: string
  targetSets: number
  targetRepsMin: number
  targetRepsMax: number
  /** Descanso objetivo en segundos. */
  restSeconds: number
  notes?: string
}

export interface Routine {
  id: string
  name: string
  /** Etiqueta corta: A, B, C... */
  code?: string
  description?: string
  exercises: RoutineExercise[]
  /** Marca la rutina que se propone al abrir una sesion vacia. */
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

export interface ExerciseSet {
  id: string
  sessionId: string
  exerciseId: string
  exerciseName: string
  /** Orden dentro de la sesion. */
  order: number
  /** Numero de serie dentro del ejercicio (1,2,3...). */
  setNumber: number
  /** Peso en kg. 0 en peso corporal. */
  weight: number
  reps: number
  /** Repeticiones en reserva (0 = al fallo). Opcional. */
  rir?: number
  /** Serie de aproximacion: no cuenta para el volumen de trabajo. */
  isWarmup: boolean
  /** Segundos de descanso que realmente se hicieron antes de esta serie. */
  restTaken?: number
  notes?: string
  completedAt: number
}

export interface CardioEntry {
  id: string
  sessionId?: string
  /** bici, carrera, marcha, cinta, eliptica, natacion... */
  activity: string
  date: string
  /** Minutos. */
  durationMin: number
  /** Kilometros. */
  distanceKm?: number
  /** Metros de desnivel positivo. */
  elevationM?: number
  avgHr?: number
  maxHr?: number
  /** Nota libre (sensaciones, ruta, fuente del dato). */
  notes?: string
  createdAt: number
}

/** Datos de contexto de la sesion, para poder analizarlos despues. */
export interface SessionMetrics {
  bodyweightKg?: number
  sleepHours?: number
  energy?: 1 | 2 | 3 | 4 | 5
  notes?: string
}

export interface Session {
  id: string
  /** YYYY-MM-DD, fecha local. */
  date: string
  routineId?: string
  routineName: string
  /** Snapshot de los objetivos de la rutina al empezar. */
  routineSnapshot: RoutineExercise[]
  startedAt: number
  /** null mientras la sesion esta en curso. */
  endedAt: number | null
  metrics: SessionMetrics
}

export interface Settings {
  id: 'app'
  /** Descanso por defecto, en segundos, para ejercicios nuevos. */
  defaultRestSeconds: number
  /** Aviso acustico al terminar el descanso. */
  soundOn: boolean
  /** Vibracion al terminar el descanso (Android). */
  vibrateOn: boolean
  /** Vuelve a contar el descanso automaticamente al guardar una serie. */
  autoStartRest: boolean
  /** Descarga automatica de copia de seguridad (semanas, 0 = desactivado). */
  autoBackupWeeks: number
  lastBackupAt?: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  defaultRestSeconds: 90,
  soundOn: true,
  vibrateOn: true,
  autoStartRest: true,
  autoBackupWeeks: 0,
}

/** Formato de fichero de copia de seguridad. */
export interface BackupFile {
  format: 'gymlog-backup'
  version: 1
  exportedAt: string
  data: {
    exercises: Exercise[]
    routines: Routine[]
    sessions: Session[]
    sets: ExerciseSet[]
    cardio: CardioEntry[]
    settings: Settings[]
  }
}
