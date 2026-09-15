import type { ExerciseSet, RoutineExercise } from '../types'
import { groupRoutineExercises } from '../types'

/**
 * Se reexportan desde aqui las utilidades de agrupacion y etiquetado, para que quien
 * trabaje con superseries tenga un unico sitio del que importar.
 */
export { groupRoutineExercises }
export { letraDeGrupo } from '../types'

/**
 * Logica de las superseries: de quien es el turno y cuanto se descansa.
 *
 * Como funciona una superserie: se hacen los ejercicios encadenados, uno detras de otro,
 * con un descanso muy corto al cambiar de ejercicio, y un descanso completo al acabar la
 * ronda (cuando ya se han hecho todos los ejercicios de la superserie). Luego se repite.
 *
 * Ejemplo, superserie de sentadilla bulgara + elevaciones laterales, 3 rondas:
 *   bulgara -> 15 s -> elevaciones -> 90 s (ronda 1)
 *   bulgara -> 15 s -> elevaciones -> 90 s (ronda 2)
 *   ...
 *
 * Todo esto son funciones puras: no tocan la base de datos ni el navegador, para poder
 * probarlo a fondo sin montar una sesion entera.
 */

/** Descanso que toca al guardar una serie. */
export type Descanso = { segundos: number; motivo: 'siguiente-ejercicio' | 'fin-de-ronda' | 'normal' }

/** Superserie a la que pertenece un ejercicio, o null si va suelto. */
export interface GrupoEncontrado {
  /** Posicion del grupo dentro de la rutina (0, 1, 2...). */
  indice: number
  miembros: RoutineExercise[]
  /** Posicion del ejercicio dentro de la superserie (0 = primero). */
  posicion: number
}

/** Segundos de descanso al cambiar de ejercicio dentro de la misma ronda. */
export const TRANSICION_POR_DEFECTO = 15

/**
 * Busca el ejercicio dentro de los grupos de la rutina o de la sesion.
 * Devuelve tambien su posicion en el grupo, que es lo que decide de quien es el turno.
 */
export function buscarGrupo(
  ejercicios: RoutineExercise[],
  exerciseId: string,
): GrupoEncontrado | null {
  const grupos = groupRoutineExercises(ejercicios)
  for (let indice = 0; indice < grupos.length; indice += 1) {
    const grupo = grupos[indice]
    const posicion = grupo.exercises.findIndex((e) => e.exerciseId === exerciseId)
    if (posicion >= 0) {
      return { indice, miembros: grupo.exercises, posicion }
    }
  }
  return null
}

/** Cuantas series se han apuntado de un ejercicio en la sesion (sin contar aproximacion). */
export function seriesApuntadas(sets: ExerciseSet[], exerciseId: string): number {
  return sets.filter((s) => s.exerciseId === exerciseId && !s.isWarmup).length
}

/**
 * Que descanso toca despues de guardar una serie.
 *
 * Se decide por RONDAS, que es como se entiende una superserie:
 * - Si algun miembro de la superserie tiene MENOS series apuntadas que el resto, es que le
 *   toca a el: estamos a mitad de ronda, asi que descanso corto.
 * - Si todos van igualados, la ronda ha terminado: descanso completo.
 *
 * Ese criterio funciona aunque se salte el orden, aunque se anada una serie de mas a un
 * ejercicio, y sin necesidad de guardar en ningun sitio en que ronda vamos.
 */
export function descansoTrasSerie(
  entry: RoutineExercise,
  setsDeLaSesion: ExerciseSet[],
  todosLosEjercicios: RoutineExercise[],
): Descanso {
  const encontrado = buscarGrupo(todosLosEjercicios, entry.exerciseId)
  const completo = Math.max(0, entry.restSeconds)

  // Ejercicio suelto: descanso normal.
  if (!encontrado || encontrado.miembros.length < 2) {
    return { segundos: completo, motivo: 'normal' }
  }

  const series = encontrado.miembros.map((m) => seriesApuntadas(setsDeLaSesion, m.exerciseId))
  const minimo = Math.min(...series)
  const maximo = Math.max(...series)

  /*
   * Queda alguien por hacer su serie de esta ronda: descanso corto.
   *
   * El caso `maximo === 0` es importante y facil de olvidar: durante la aproximacion no hay
   * ninguna serie apuntada todavia, y ahi lo que toca es ir pasando de un ejercicio al
   * siguiente, no descansar dos minutos.
   */
  if (minimo < maximo || maximo === 0) {
    const transicion = entry.transitionSeconds ?? TRANSICION_POR_DEFECTO
    return { segundos: transicion, motivo: 'siguiente-ejercicio' }
  }

  return { segundos: completo, motivo: 'fin-de-ronda' }
}

/** Etiqueta de un ejercicio dentro de su superserie: A1, A2, B1... */
export function etiquetaDeSuperserie(letra: string, posicion: number): string {
  return `${letra}${posicion + 1}`
}

/**
 * Sustituye un ejercicio de la sesion por otro.
 *
 * Se usa cuando en el gimnasio la maquina esta ocupada, o el ejercicio no va bien y se cambia
 * sobre la marcha. Casos que tiene que resolver bien:
 *
 * - **No se pierde nada de lo apuntado.** Las series ya registradas se quedan donde estaban, con
 *   el ejercicio anterior y su nombre. Lo unico que cambia es el ejercicio que se sigue a partir
 *   de ahora. Si el usuario quiere borrarlas, las borra a mano: nunca se borra por su cuenta.
 * - **Se conserva el hueco en la rutina**: series, repeticiones, descanso y si va dentro de una
 *   superserie. Al cambiar de ejercicio no tiene por que cambiar el plan.
 * - **Se anota de donde viene**, para entender despues por que hay series de dos ejercicios
 *   distintos en la misma sesion.
 */
export function sustituirEjercicio(
  ejercicios: RoutineExercise[],
  exerciseIdViejo: string,
  nuevo: { exerciseId: string; name: string },
): RoutineExercise[] {
  const anterior = ejercicios.find((e) => e.exerciseId === exerciseIdViejo)
  return ejercicios.map((e) =>
    e.exerciseId === exerciseIdViejo
      ? {
          ...e,
          exerciseId: nuevo.exerciseId,
          name: nuevo.name,
          // Solo se anota si de verdad es otro ejercicio.
          notes: anotarCambio(e.notes, anterior?.name, nuevo.name),
        }
      : e,
  )
}

/**
 * Anade "Cambiado desde X" a las notas del ejercicio.
 *
 * Si ya habia una marca de un cambio anterior, se SUSTITUYE en lugar de acumularse: encadenar
 * tres cambios dejaba la nota como "Cambiado desde A · Cambiado desde B · Cambiado desde C", que
 * no se lee. Solo interesa de donde viene ahora.
 */
function anotarCambio(
  notas: string | undefined,
  nombreViejo: string | undefined,
  nombreNuevo: string,
): string | undefined {
  const marca = marcaDeCambio(nombreViejo ?? '', nombreNuevo)
  if (!marca) return notas
  // Se quita cualquier marca anterior y se deja la nueva al final.
  const sinMarcas = notas?.replace(/\s*·?\s*Cambiado desde [^·]+/g, '').trim()
  return sinMarcas ? `${sinMarcas} · ${marca}` : marca
}

/**
 * Texto que se anade a las series nuevas cuando se ha cambiado de ejercicio.
 * Las series anteriores se quedan con el nombre del ejercicio que se estaba haciendo.
 */
export function marcaDeCambio(nombreViejo: string, nombreNuevo: string): string | undefined {
  if (!nombreViejo || nombreViejo === nombreNuevo) return undefined
  return `Cambiado desde ${nombreViejo}`
}

/** Dos nombres son el mismo ejercicio (sin distinguir mayusculas ni espacios de mas). */
export function mismoEjercicio(a: string, b: string): boolean {
  const limpiar = (texto: string) => texto.trim().toLowerCase().replace(/\s+/g, ' ')
  return limpiar(a) === limpiar(b)
}

/**
 * Si un ejercicio se puede poner en la sesion sin repetirlo.
 *
 * Hace falta comprobar las DOS cosas: el identificador y el nombre.
 *
 * - El identificador se compara porque es lo que identifica al ejercicio de verdad.
 * - El nombre se compara ADEMAS porque es lo que ve el usuario: si en la sesion ya hay un
 *   "Remo con barra", poner otro "Remo con barra" (aunque venga con otro identificador, por
 *   ejemplo de una rutina antigua o de una copia restaurada) deja dos tarjetas iguales y el
 *   usuario no entiende por que. Se descubrio con una prueba: al sustituir un ejercicio por otro
 *   que ya estaba, la sesion acababa con dos ejercicios repetidos.
 */
export function sePuedeAnadir(
  ejercicios: RoutineExercise[],
  candidato: { exerciseId: string; name: string },
): boolean {
  return !ejercicios.some(
    (e) => e.exerciseId === candidato.exerciseId || mismoEjercicio(e.name, candidato.name),
  )
}

/**
 * Texto que acompana al cronometro para explicar para que es ese descanso.
 * Devolver null cuando no hay nada que explicar (ejercicio suelto) evita ruido en la barra.
 */
export function etiquetaDeDescanso(descanso: Descanso): string | undefined {
  if (descanso.motivo === 'siguiente-ejercicio') return 'Siguiente ejercicio'
  if (descanso.motivo === 'fin-de-ronda') return 'Fin de ronda'
  return undefined
}

/**
 * Texto que explica una superserie, para mostrarlo en la sesion.
 * Ej: "3 rondas · 15 s entre ejercicios · 90 s al acabar la ronda".
 */
export function resumenDeSuperserie(miembros: RoutineExercise[]): string {
  if (miembros.length === 0) return ''
  const rondas = Math.max(...miembros.map((m) => m.targetSets))
  const transicion = miembros[0].transitionSeconds ?? TRANSICION_POR_DEFECTO
  const descanso = Math.max(...miembros.map((m) => m.restSeconds))
  const segundos = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`)
  return `${rondas} ${rondas === 1 ? 'ronda' : 'rondas'} · ${segundos(transicion)} entre ejercicios · ${segundos(descanso)} al acabar la ronda`
}

/**
 * Resumen del objetivo de un ejercicio DENTRO de una superserie.
 *
 * No vale el resumen normal ("descanso 45 s"): dentro de una superserie el descanso que te
 * encuentras al acabar esa serie suele ser el corto, y el largo va al cerrar la ronda.
 * Decirlo asi evita la confusion de creer que vas a descansar 45 s entre ejercicios.
 */
export function resumenEnSuperserie(miembros: RoutineExercise[], posicion: number): string {
  const entry = miembros[posicion]
  if (!entry) return ''
  const min = entry.targetRepsMin
  const max = entry.targetRepsMax
  const reps = min === max ? `${min}` : `${min}-${max}`
  const transicion = entry.transitionSeconds ?? TRANSICION_POR_DEFECTO
  const descanso = Math.max(...miembros.map((m) => m.restSeconds))
  const esUltimo = posicion === miembros.length - 1
  const segundos = (s: number) => (s % 60 === 0 && s >= 60 ? `${s / 60} min` : `${s} s`)
  return esUltimo
    ? `${entry.targetSets} × ${reps} reps · al acabar: ${segundos(descanso)} (fin de ronda)`
    : `${entry.targetSets} × ${reps} reps · luego ${segundos(transicion)} y al siguiente`
}
