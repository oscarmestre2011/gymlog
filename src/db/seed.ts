import { db, newId } from './index'
import type { Equipment, Exercise, ExerciseSide, MuscleGroup, Routine, RoutineExercise } from '../types'

/**
 * Datos iniciales: la biblioteca de ejercicios y las rutinas del usuario.
 *
 * Extraidos del vault de Obsidian (Plan Recomposicion 2026, Sesion Lunes y el
 * registro de progresion), para que la app hable su idioma desde el primer dia:
 * "Back squat" y no "Sentadilla trasera", "52,5 kg" y no "52.5".
 *
 * El sembrado solo se ejecuta si la base de datos esta vacia: nunca pisa datos.
 */

/** Sube este numero para volver a sembrar ejercicios en instalaciones existentes. */
export const SEED_VERSION = 1

type SeedExercise = {
  name: string
  group: MuscleGroup
  equipment: Equipment
  side?: ExerciseSide
  increment?: number
  favorite?: boolean
  notes?: string
}

const E = (
  name: string,
  group: MuscleGroup,
  equipment: Equipment,
  extra: Partial<Pick<SeedExercise, 'side' | 'increment' | 'favorite' | 'notes'>> = {},
): SeedExercise => ({ name, group, equipment, ...extra })

export const SEED_EXERCISES: SeedExercise[] = [
  /* ---------------------------- Empuje ---------------------------- */
  E('Press banca', 'Pecho', 'Barra', { increment: 2.5, favorite: true }),
  E('Press banca (mancuernas)', 'Pecho', 'Mancuernas', { increment: 2.5 }),
  E('Press inclinado', 'Pecho', 'Mancuernas', { increment: 2.5, favorite: true }),
  E('Press inclinado (barra)', 'Pecho', 'Barra', { increment: 2.5 }),
  E('Flexiones', 'Pecho', 'Peso corporal', { increment: 2.5, notes: 'Lastre opcional' }),
  E('Flexiones inclinadas', 'Pecho', 'Peso corporal', { increment: 2.5 }),
  E('Flexiones declinadas', 'Pecho', 'Peso corporal', { increment: 2.5 }),
  E('Flexiones diamante', 'Pecho', 'Peso corporal', { increment: 2.5 }),
  E('Flexiones arquer', 'Pecho', 'Peso corporal', { side: 'por-lado', increment: 2.5 }),
  E('Aperturas en polea', 'Pecho', 'Polea', { increment: 2.5 }),

  /* ---------------------------- Hombro ---------------------------- */
  E('Press militar', 'Hombro', 'Mancuernas', { increment: 2.5, favorite: true }),
  E('Press Arnold', 'Hombro', 'Mancuernas', { increment: 2.5, favorite: true }),
  E('Elevaciones laterales', 'Hombro', 'Mancuernas', { increment: 2.5, favorite: true }),
  E('Elevaciones frontales', 'Hombro', 'Mancuernas', { increment: 2.5 }),
  E('Pájaros', 'Hombro', 'Mancuernas', { increment: 2.5 }),
  E('Face pull', 'Hombro', 'Polea', { increment: 2.5, favorite: true }),
  E('Pike push-up', 'Hombro', 'Peso corporal', { increment: 2.5 }),

  /* --------------------------- Traccion --------------------------- */
  E('Jalón polea', 'Espalda', 'Polea', { increment: 2.5, favorite: true, notes: 'Serie tope a 60 kg' }),
  E('Jalón polea agarre neutro', 'Espalda', 'Polea', { increment: 2.5 }),
  E('Dominadas', 'Espalda', 'Peso corporal', { increment: 2.5 }),
  E('Remo con barra', 'Espalda', 'Barra', { increment: 2.5, favorite: true }),
  E('Remo con barra (máquina)', 'Espalda', 'Maquina', { increment: 2.5, favorite: true }),
  E('Remo polea baja', 'Espalda', 'Polea', { increment: 2.5, favorite: true }),
  E('Remo con mancuerna', 'Espalda', 'Mancuernas', { side: 'unilateral', increment: 2.5 }),
  E('Remo con banda', 'Espalda', 'Banda elastica', { increment: 2.5 }),

  /* ----------------------------- Pierna --------------------------- */
  E('Back squat', 'Cuadriceps', 'Barra', { increment: 2.5, favorite: true }),
  E('Sentadilla frontal', 'Cuadriceps', 'Barra', { increment: 2.5, favorite: true }),
  E('Sentadilla goblet', 'Cuadriceps', 'Mancuernas', { increment: 2.5 }),
  E('Sentadilla búlgara', 'Cuadriceps', 'Peso corporal', { side: 'por-lado', increment: 2.5, favorite: true, notes: 'Por pierna; sustituye a las zancadas por el arco plantar' }),
  E('Zancadas', 'Cuadriceps', 'Mancuernas', { side: 'por-lado', increment: 2.5 }),
  E('Prensa', 'Cuadriceps', 'Maquina', { increment: 5 }),
  E('Extensión cuádriceps', 'Cuadriceps', 'Maquina', { increment: 2.5 }),
  E('Peso muerto convencional', 'Femoral', 'Barra', { increment: 2.5, favorite: true }),
  E('Peso muerto rumano', 'Femoral', 'Barra', { increment: 2.5, favorite: true }),
  E('Curl femoral', 'Femoral', 'Maquina', { increment: 2.5, favorite: true }),
  E('Hip thrust (máquina)', 'Gluteo', 'Maquina', { increment: 2.5, favorite: true }),
  E('Puente de glúteos', 'Gluteo', 'Peso corporal', { increment: 2.5 }),
  E('Patada de glúteo', 'Gluteo', 'Polea', { side: 'por-lado', increment: 2.5 }),
  E('Gemelos de pie', 'Gemelo', 'Maquina', { increment: 2.5 }),
  E('Elevaciones gemelo/sóleo', 'Gemelo', 'Peso corporal', { increment: 2.5 }),

  /* ------------------------------ Brazos -------------------------- */
  E('Fondos tríceps', 'Triceps', 'Peso corporal', { increment: 2.5, favorite: true }),
  E('Extensión tríceps polea', 'Triceps', 'Polea', { increment: 2.5 }),
  E('Dips en silla', 'Triceps', 'Peso corporal', { increment: 2.5 }),
  E('Curl bíceps', 'Biceps', 'Mancuernas', { increment: 2.5, favorite: true }),
  E('Curl bíceps barra', 'Biceps', 'Barra', { increment: 2.5 }),
  E('Curl martillo', 'Biceps', 'Mancuernas', { increment: 2.5 }),

  /* ------------------------------- Core --------------------------- */
  E('Máquina crunch', 'Core', 'Maquina', { increment: 2.5, favorite: true }),
  E('Pallof press', 'Core', 'Polea', { side: 'por-lado', increment: 2.5, favorite: true, notes: 'Por lado' }),
  E('Plancha', 'Core', 'Peso corporal', { increment: 0, notes: 'Se mide en segundos' }),
  E('Plancha lateral', 'Core', 'Peso corporal', { side: 'por-lado', increment: 0, notes: 'Se mide en segundos' }),
  E('Plancha con toque de hombro', 'Core', 'Peso corporal', { side: 'por-lado', increment: 0 }),
  E('Abdominales', 'Core', 'Peso corporal', { increment: 0 }),
  E('Elevación de piernas', 'Core', 'Peso corporal', { increment: 0 }),
  E('Rueda abdominal', 'Core', 'Otro', { increment: 0 }),
  E('Hollow hold', 'Core', 'Peso corporal', { increment: 0, notes: 'Se mide en segundos' }),
  E('Mountain climbers', 'Core', 'Peso corporal', { side: 'por-lado', increment: 0 }),
  E('Russian twist', 'Core', 'Peso corporal', { increment: 0 }),
  E('Dead bug', 'Core', 'Peso corporal', { side: 'por-lado', increment: 0 }),

  /* --------------------------- Cuerpo completo -------------------- */
  E('Thruster', 'Cuerpo completo', 'Barra', { increment: 2.5 }),
  E('Burpee sin salto', 'Cuerpo completo', 'Peso corporal', { increment: 0 }),
  E('Inchworm', 'Cuerpo completo', 'Peso corporal', { increment: 0 }),
]

/** Rutinas del programa A/B/C del usuario, tal y como aparecen en su vault. */
const SEED_ROUTINES: {
  code: string
  name: string
  description: string
  /** Etiqueta de texto que se muestra en la tarjeta. */
  weekday: string
  /** Dia de la semana de verdad (0 = domingo). Es lo que usa la planificacion. */
  weekdays: number[]
  isDefault?: boolean
  exercises: (Omit<RoutineExercise, 'exerciseId' | 'name'> & { name: string })[]
}[] = [
  {
    code: 'A',
    name: 'Fuerza A — Empuje + Pierna',
    description: 'Empuje dominante con sentadilla y press banca como básicos. Día de referencia: lunes.',
    weekday: 'Lunes',
    weekdays: [1],
    isDefault: true,
    exercises: [
      { name: 'Back squat', targetSets: 4, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 150, notes: 'En la práctica se han hecho 4×10-12' },
      { name: 'Press banca', targetSets: 4, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 120 },
      { name: 'Press militar', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 90, notes: 'Con mancuernas' },
      { name: 'Press inclinado', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 90 },
      { name: 'Sentadilla búlgara', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 75, notes: 'Por pierna' },
      { name: 'Elevaciones laterales', targetSets: 3, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 60 },
      { name: 'Remo con barra', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 90 },
      { name: 'Fondos tríceps', targetSets: 3, targetRepsMin: 12, targetRepsMax: 20, restSeconds: 60, notes: 'A peso corporal' },
    ],
  },
  {
    code: 'B',
    name: 'Fuerza B — Tracción + Posterior',
    description: 'Cadena posterior y tracción. Día de referencia: miércoles.',
    weekday: 'Miércoles',
    weekdays: [3],
    exercises: [
      { name: 'Peso muerto rumano', targetSets: 4, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 120 },
      { name: 'Jalón polea', targetSets: 4, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 90, notes: 'Serie tope a 60 kg' },
      { name: 'Hip thrust (máquina)', targetSets: 4, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 90 },
      { name: 'Remo con barra (máquina)', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 90 },
      { name: 'Curl femoral', targetSets: 3, targetRepsMin: 12, targetRepsMax: 12, restSeconds: 60 },
      { name: 'Face pull', targetSets: 4, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 60 },
      { name: 'Curl bíceps', targetSets: 3, targetRepsMin: 12, targetRepsMax: 12, restSeconds: 60 },
    ],
  },
  {
    code: 'C',
    name: 'Fuerza C — Full Body + Core',
    description: 'Cuerpo completo con dos básicos pesados y core. Día de referencia: viernes.',
    weekday: 'Viernes',
    weekdays: [5],
    exercises: [
      { name: 'Sentadilla frontal', targetSets: 4, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 150 },
      { name: 'Peso muerto convencional', targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, restSeconds: 150 },
      { name: 'Remo polea baja', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 90 },
      { name: 'Press Arnold', targetSets: 3, targetRepsMin: 10, targetRepsMax: 10, restSeconds: 75 },
      { name: 'Pallof press', targetSets: 3, targetRepsMin: 12, targetRepsMax: 12, restSeconds: 60, notes: 'Por lado' },
      { name: 'Máquina crunch', targetSets: 3, targetRepsMin: 15, targetRepsMax: 20, restSeconds: 60 },
    ],
  },
]

/** Recuperacion activa para los dias sin gimnasio. */
const SEED_MOBILITY: (typeof SEED_ROUTINES)[number] = {
  code: 'M',
  name: 'Movilidad y core en casa',
  description: 'Día suave: movilidad, core y activación. 15-20 minutos.',
  weekday: 'Cualquier día',
  weekdays: [],
  exercises: [
    { name: 'Plancha', targetSets: 3, targetRepsMin: 30, targetRepsMax: 45, restSeconds: 45, notes: 'Segundos' },
    { name: 'Puente de glúteos', targetSets: 3, targetRepsMin: 15, targetRepsMax: 20, restSeconds: 45 },
    { name: 'Flexiones inclinadas', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 60 },
    { name: 'Mountain climbers', targetSets: 3, targetRepsMin: 20, targetRepsMax: 30, restSeconds: 45 },
    { name: 'Dead bug', targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 45, notes: 'Por lado' },
    { name: 'Inchworm', targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 45 },
  ],
}

/**
 * Siembra la base de datos. Idempotente: si ya hay ejercicios o rutinas, no toca nada.
 * Devuelve un resumen de lo creado.
 */
export async function seedIfEmpty(force = false): Promise<{ exercises: number; routines: number }> {
  const [exerciseCount, routineCount] = await Promise.all([db.exercises.count(), db.routines.count()])
  if (!force && (exerciseCount > 0 || routineCount > 0)) {
    return { exercises: 0, routines: 0 }
  }

  const now = Date.now()
  const idByName = new Map<string, string>()
  const exercises: Exercise[] = SEED_EXERCISES.map((seed, index) => {
    const id = newId('e_')
    idByName.set(key(seed.name), id)
    return {
      id,
      name: seed.name,
      group: seed.group,
      equipment: seed.equipment,
      side: seed.side ?? 'bilateral',
      increment: seed.increment ?? 2.5,
      favorite: seed.favorite,
      notes: seed.notes,
      createdAt: now + index,
    }
  })

  const routines: Routine[] = [...SEED_ROUTINES, SEED_MOBILITY].map((seed, index) => {
    const routineExercises: RoutineExercise[] = seed.exercises.map((re) => {
      let exerciseId = idByName.get(key(re.name))
      if (!exerciseId) {
        // Ejercicio de rutina que no estaba en la biblioteca: se crea al vuelo.
        exerciseId = newId('e_')
        idByName.set(key(re.name), exerciseId)
        exercises.push({
          id: exerciseId,
          name: re.name,
          group: 'Cuerpo completo',
          equipment: 'Otro',
          side: 'bilateral',
          increment: 2.5,
          createdAt: now + exercises.length,
        })
      }
      return {
        exerciseId,
        name: re.name,
        targetSets: re.targetSets,
        targetRepsMin: re.targetRepsMin,
        targetRepsMax: re.targetRepsMax,
        restSeconds: re.restSeconds,
        notes: re.notes,
      }
    })
    return {
      id: newId('r_'),
      code: seed.code,
      weekdays: seed.weekdays,
      name: seed.name,
      description: seed.description,
      exercises: routineExercises,
      isDefault: seed.isDefault,
      createdAt: now + index,
      updatedAt: now + index,
    }
  })

  await db.transaction('rw', db.exercises, db.routines, async () => {
    if (force) {
      await db.exercises.clear()
      await db.routines.clear()
    }
    await db.exercises.bulkPut(exercises)
    await db.routines.bulkPut(routines)
  })

  return { exercises: exercises.length, routines: routines.length }
}

/** Comprueba si hace falta sembrar (instalacion nueva). */
export async function needsSeed(): Promise<boolean> {
  const [exerciseCount, routineCount] = await Promise.all([db.exercises.count(), db.routines.count()])
  return exerciseCount === 0 && routineCount === 0
}

function key(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
