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
  /** Como se hace el ejercicio: agarre, rango, precauciones. */
  description?: string
  notes?: string
  /** Incremento minimo de disco disponible en la maquina/barra, en kg. */
  increment: number
  /** Marca los ejercicios que aparecen en el plan del usuario. */
  favorite?: boolean
  /** Lo ha creado el usuario, no viene en la lista de serie. */
  custom?: boolean
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
  /** Descanso objetivo en segundos. En una superserie, el descanso AL ACABAR LA RONDA. */
  restSeconds: number
  /**
   * En una superserie, los segundos que se descansan al pasar de un ejercicio al
   * siguiente dentro de la misma ronda. Son pocos: se va de uno a otro casi seguido.
   */
  transitionSeconds?: number
  /**
   * Si el ejercicio va dentro de una superserie o suelto.
   *
   * Se guarda en cada ejercicio (y no en el grupo) a proposito: asi las rutinas creadas
   * antes de que existieran las superseries se leen como "single" sin tocar nada, y no
   * hace falta migrar ningun dato.
   */
  kind?: 'single' | 'superset'
  /** Cuantos ejercicios van encadenados. Solo importa si kind es 'superset'. */
  groupSize?: number
  notes?: string
}

/** Grupo de la rutina: un ejercicio suelto o una superserie de dos o mas. */
export interface RoutineGroup {
  kind: 'single' | 'superset'
  exercises: RoutineExercise[]
}

/**
 * Agrupa los ejercicios de una rutina en sueltos y superseries, conservando el orden.
 *
 * Los ejercicios de una superserie van seguidos en la lista: los "groupSize" primeros
 * forman el grupo, y asi sucesivamente. Un groupSize invalido (1 o mayor que lo que
 * queda) se trata como ejercicio suelto, para no dejar ejercicios fuera de la sesion.
 */
export function groupRoutineExercises(exercises: RoutineExercise[]): RoutineGroup[] {
  const grupos: RoutineGroup[] = []
  let i = 0
  while (i < exercises.length) {
    const actual = exercises[i]
    const tamano = actual.groupSize ?? 1
    const esSuperserie = actual.kind === 'superset' && tamano >= 2 && i + tamano <= exercises.length
    if (esSuperserie) {
      grupos.push({ kind: 'superset', exercises: exercises.slice(i, i + tamano) })
      i += tamano
    } else {
      grupos.push({ kind: 'single', exercises: [actual] })
      i += 1
    }
  }
  return grupos
}

/** Letra del grupo dentro de la sesion: A, B, C... (para etiquetar "Superserie A"). */
export function letraDeGrupo(indice: number): string {
  return String.fromCharCode(65 + (indice % 26))
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
  /**
   * Dias de la semana en que toca esta rutina (0 = domingo, 1 = lunes...).
   *
   * Va en la RUTINA y no en el codigo, que es como estaba antes: los dias estaban escritos a mano
   * (A lunes, B miercoles, C viernes) y no habia forma de cambiarlos sin tocar el programa. Se
   * guarda una lista porque la misma rutina puede tocar dos dias (por ejemplo lunes y jueves).
   */
  weekdays?: number[]
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

/** Intensidad de un tramo de cardio. */
export type IntensidadCardio = 'suave' | 'medio' | 'fuerte' | 'maximo' | 'recuperacion'

/**
 * Un tramo de un entrenamiento por series o fartlek.
 *
 * Para que sirve: un entrenamiento de series no es un bloque continuo, son tramos con ritmos
 * distintos (calentamiento, series fuertes con recuperaciones, vuelta a la calma). Guardarlo asi
 * permite ver despues QUE se hizo, no solo el total.
 *
 * Todos los campos son opcionales porque los tramos se apuntan de formas muy distintas: unos con
 * tiempo, otros con distancia, y el ritmo a veces se sabe y a veces no.
 */
export interface CardioSegmento {
  id: string
  /** Minutos del tramo. */
  durationMin?: number
  /** Kilometros del tramo. */
  distanceKm?: number
  intensidad: IntensidadCardio
  /** Nota del tramo: "cuesta arriba", "en llano", "a tope"... */
  notes?: string
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
  /**
   * Como fue el entrenamiento.
   * - 'continuo': un bloque al mismo ritmo (lo de siempre).
   * - 'series': tramos fuertes con recuperaciones entre ellos.
   * - 'fartlek': cambios de ritmo sin estructura fija.
   *
   * Si no viene (entradas antiguas) se entiende 'continuo'.
   */
  tipo?: 'continuo' | 'series' | 'fartlek'
  /** Los tramos, cuando es por series o fartlek. */
  segmentos?: CardioSegmento[]
  /**
   * Con que se apuntaron los tramos: por tiempo, por metros o por km.
   *
   * Se guarda para que al volver a abrir el entrenamiento se vea como se apunto (un 6x400 se
   * apunta en metros, y volver a verlo en minutos obligaria a convertirlo de cabeza).
   */
  unidadTramos?: 'tiempo' | 'metros' | 'km'
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

import type { NivelActividad } from './lib/perfil'

/** Medicion corporal de un dia. Todos los campos salvo la fecha son opcionales. */
export interface BodyMeasurement {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** Peso en kg. */
  weightKg?: number
  /** Perimetro abdominal en cm (a la altura del ombligo). Es el mas fiable. */
  abdomenCm?: number
  /** Cintura en cm (por encima del ombligo, la parte mas estrecha). */
  waistCm?: number
  chestCm?: number
  /** Perimetro del muslo en cm. */
  thighCm?: number
  notes?: string
  createdAt: number
}

/** Persona de la que son las medidas. */
export type MeasurementPerson = 'yo' | 'cristina'

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
  /** Si ya se ha mostrado la pantalla de bienvenida (se muestra una sola vez). */
  hasSeenWelcome?: boolean
  /**
   * Cada cuantos dias recordar que toca hacer copia. 0 = no recordar nunca.
   * Los datos viven solo en el movil, asi que este aviso es la unica proteccion.
   */
  backupReminderDays: number
  /**
   * Mantener la pantalla encendida mientras se usa la app.
   *
   * Pedido por el usuario: si el movil apaga la pantalla, el navegador suspende la pagina
   * y el aviso del descanso no suena hasta que se enciende otra vez. Manteniendo la
   * pantalla encendida no se pierde ningun aviso. Se puede desactivar: gasta bateria.
   */
  keepScreenOn: boolean
  /** Duracion del aviso del descanso: 'corto' (un pitido), 'largo' o 'muy-largo'. */
  alertLength: 'corto' | 'largo' | 'muy-largo'
  /**
   * Altura en cm, para calcular el IMC y la relacion cintura/altura.
   *
   * SIN valor por defecto a proposito: la app la usa mas gente, cada uno con su altura. Si se
   * pusiera la de una persona, los demas verian un IMC y un indicador cintura/altura MAL
   * calculados y sin ningun aviso, que es la peor forma de fallar. Si no hay altura, esos
   * indicadores no se muestran y la app pide que se configure.
   */
  heightCm?: number
  /**
   * Fecha de nacimiento, en formato YYYY-MM-DD.
   *
   * Se guarda la fecha y NO la edad: la edad caduca cada ano, y guardada como numero en dos anos
   * estaria mal y nadie se acordaria de cambiarla. La edad se calcula sola.
   */
  birthDate?: string
  /** Sexo: las formulas de gasto energetico lo necesitan. Si falta, no se estima nada. */
  sex?: 'hombre' | 'mujer'
  /** Cuanto se mueve al dia, para estimar el gasto total. */
  activity?: NivelActividad
  /** Porcentaje de grasa corporal, si se conoce. Permite una formula mas exacta. */
  bodyFatPercent?: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  defaultRestSeconds: 90,
  soundOn: true,
  vibrateOn: true,
  autoStartRest: true,
  autoBackupWeeks: 0,
  hasSeenWelcome: false,
  backupReminderDays: 7,
  keepScreenOn: true,
  alertLength: 'largo',
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
    measurements: BodyMeasurement[]
    settings: Settings[]
  }
}
