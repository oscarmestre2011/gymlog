/**
 * Analisis del entrenamiento: equilibrio muscular, mejora por serie y vista conjunta con el cardio.
 *
 * Todo son funciones puras: reciben los datos ya leidos y devuelven lo que hay que mostrar. Asi se
 * pueden probar a fondo sin montar una base de datos.
 */

import type { CardioEntry, Exercise, ExerciseSet, Session } from '../types'
import { startOfWeekISO } from './format'

/* ------------------------------------------------------------------ */
/* Volumen por grupo muscular                                          */
/* ------------------------------------------------------------------ */

export interface VolumenGrupo {
  grupo: string
  /** Series de trabajo (las de aproximacion no cuentan). */
  series: number
  volumen: number
}

/** Cuantas semanas se miran por defecto. */
export const SEMANAS_EQUILIBRIO = 4

/**
 * Series y volumen por grupo muscular.
 *
 * Para que sirve: ver el EQUILIBRIO. Si un grupo se queda muy por detras de los demas, o se esta
 * entrenando poco o se esta saltando. Es la pregunta que no contesta el volumen total (que suma
 * todo junto y esconde los desequilibrios).
 *
 * Solo cuentan las series de trabajo: las de aproximacion no construyen musculo.
 *
 * Nota sobre los ejercicios por lado: una serie de sentadilla bulgara cuenta como UNA serie, no
 * como dos, aunque se hagan las dos piernas. Es el criterio habitual al contar volumen por grupo
 * (contar series, no series-por-lado), y ademas es lo que se apunta: una linea por serie.
 */
export function volumenPorGrupo(
  sets: ExerciseSet[],
  sessions: Session[],
  exercises: Exercise[],
): VolumenGrupo[] {
  const fechaPorSesion = new Map(sessions.map((s) => [s.id, s.date]))
  const grupoPorEjercicio = new Map<string, string>()
  for (const e of exercises) {
    // Por identificador Y por nombre: hay series antiguas cuyo ejercicio ya no existe.
    grupoPorEjercicio.set(e.id, e.group)
    if (!grupoPorEjercicio.has(e.name)) grupoPorEjercicio.set(e.name, e.group)
  }

  const porGrupo = new Map<string, VolumenGrupo>()
  for (const serie of sets) {
    if (serie.isWarmup) continue
    if (!fechaPorSesion.has(serie.sessionId)) continue // serie de una sesion borrada
    const grupo = grupoPorEjercicio.get(serie.exerciseId) ?? grupoPorEjercicio.get(serie.exerciseName) ?? 'Otro'
    const actual = porGrupo.get(grupo) ?? { grupo, series: 0, volumen: 0 }
    actual.series += 1
    actual.volumen += serie.weight * serie.reps
    porGrupo.set(grupo, actual)
  }

  return [...porGrupo.values()].sort((a, b) => b.series - a.series || a.grupo.localeCompare(b.grupo))
}

/** Series por grupo y semana, para la tabla de equilibrio. */
export function volumenSemanalPorGrupo(
  sets: ExerciseSet[],
  sessions: Session[],
  exercises: Exercise[],
  semanas = SEMANAS_EQUILIBRIO,
): { semanas: string[]; grupos: { grupo: string; porSemana: Record<string, number>; total: number }[] } {
  const fechaPorSesion = new Map(sessions.map((s) => [s.id, s.date]))
  const grupoPorEjercicio = new Map<string, string>()
  for (const e of exercises) {
    grupoPorEjercicio.set(e.id, e.group)
    grupoPorEjercicio.set(e.name, e.group)
  }

  const lunesDe = new Set<string>()
  const acumulado = new Map<string, Record<string, number>>()

  for (const serie of sets) {
    if (serie.isWarmup) continue
    const fecha = fechaPorSesion.get(serie.sessionId)
    if (!fecha) continue
    const lunes = startOfWeekISO(fecha)
    lunesDe.add(lunes)
    const grupo = grupoPorEjercicio.get(serie.exerciseId) ?? grupoPorEjercicio.get(serie.exerciseName) ?? 'Otro'
    const porSemana = acumulado.get(grupo) ?? {}
    porSemana[lunes] = (porSemana[lunes] ?? 0) + 1
    acumulado.set(grupo, porSemana)
  }

  // Solo las ultimas semanas, y ordenadas.
  const listaSemanas = [...lunesDe].sort().slice(-semanas)

  const grupos = [...acumulado.entries()]
    .map(([grupo, porSemana]) => {
      const filtrado: Record<string, number> = {}
      let total = 0
      for (const lunes of listaSemanas) {
        const valor = porSemana[lunes] ?? 0
        filtrado[lunes] = valor
        total += valor
      }
      return { grupo, porSemana: filtrado, total }
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total)

  return { semanas: listaSemanas, grupos }
}

/**
 * Aviso de desequilibrio: el grupo que mas se entrena frente al que menos.
 *
 * Devuelve null si no hay suficientes datos, o si la diferencia no es notable. Es preferible no
 * avisar que avisar de algo que no es cierto: con dos sesiones apuntadas, cualquier diferencia
 * parece enorme y no significa nada.
 */
export function desequilibrio(
  porGrupo: VolumenGrupo[],
  minimoSeries = 12,
): { grupoBajo: string; grupoAlto: string; seriesBajo: number; seriesAlto: number } | null {
  const conSeries = porGrupo.filter((g) => g.series > 0)
  if (conSeries.length < 3) return null
  const total = conSeries.reduce((n, g) => n + g.series, 0)
  if (total < minimoSeries) return null

  const ordenados = [...conSeries].sort((a, b) => b.series - a.series)
  const alto = ordenados[0]
  const bajo = ordenados[ordenados.length - 1]
  // Solo se avisa si el que mas se entrena dobla al que menos.
  if (alto.series < bajo.series * 2) return null
  return { grupoBajo: bajo.grupo, grupoAlto: alto.grupo, seriesBajo: bajo.series, seriesAlto: alto.series }
}

/* ------------------------------------------------------------------ */
/* Mejora por serie                                                    */
/* ------------------------------------------------------------------ */

export type SenalMejora = 'mejor' | 'igual' | 'peor' | 'sin-referencia'

export interface ComparacionSerie {
  senal: SenalMejora
  /** Texto corto para mostrar: "▲ +2,5 kg" o "= igual que la última vez". */
  texto: string
  /** La serie equivalente del ultimo entrenamiento, si la hay. */
  referencia?: ExerciseSet
}

/**
 * Compara una serie con la MISMA serie del ultimo entrenamiento de ese ejercicio.
 *
 * Se compara serie con serie (la 1 con la 1, la 2 con la 2) y no el total, porque lo que importa
 * mientras entrenas es si esa serie concreta va mejor que la ultima vez. Si el entrenamiento
 * anterior tuvo menos series, simplemente no hay con que comparar.
 *
 * Criterio: mas peso = mejor. Con el mismo peso, mas repeticiones = mejor. Con el mismo peso y las
 * mismas repeticiones = igual (que ya es bueno: mantener sin bajar es progresar).
 */
export function compararSerie(
  serie: ExerciseSet,
  anteriores: ExerciseSet[],
  unidad = 'kg',
): ComparacionSerie {
  const ordenadas = [...anteriores]
    .filter((s) => !s.isWarmup)
    .sort((a, b) => a.setNumber - b.setNumber || a.completedAt - b.completedAt)
  const referencia = ordenadas[serie.setNumber - 1]
  if (!referencia) return { senal: 'sin-referencia', texto: '' }

  const difPeso = Math.round((serie.weight - referencia.weight) * 100) / 100
  const difReps = serie.reps - referencia.reps

  if (difPeso > 0) {
    return { senal: 'mejor', texto: `▲ +${formato(difPeso)} ${unidad}`, referencia }
  }
  if (difPeso < 0) {
    return { senal: 'peor', texto: `▼ ${formato(difPeso)} ${unidad}`, referencia }
  }
  if (difReps > 0) {
    return { senal: 'mejor', texto: `▲ +${difReps} ${difReps === 1 ? 'rep' : 'reps'}`, referencia }
  }
  if (difReps < 0) {
    return { senal: 'peor', texto: `▼ ${difReps} ${difReps === 1 ? 'rep' : 'reps'}`, referencia }
  }
  return { senal: 'igual', texto: '= igual que la última vez', referencia }
}

/** Numero en formato español, sin ceros de mas. */
function formato(valor: number): string {
  return String(valor).replace('.', ',')
}

/* ------------------------------------------------------------------ */
/* Fuerza y cardio juntos                                              */
/* ------------------------------------------------------------------ */

export interface SemanaCompleta {
  weekStart: string
  /** Volumen de fuerza en kg. */
  volumen: number
  series: number
  /** Sesiones de fuerza de esa semana. */
  sesiones: number
  cardioMin: number
  cardioKm: number
  cardioVeces: number
}

/**
 * Fuerza y cardio en la misma tabla, por semana.
 *
 * Estaban en sitios distintos y quien hace las dos cosas (bici y pesas el mismo dia) no podia ver
 * la semana completa. Aqui se juntan para poder comparar la carga total.
 */
export function semanaCompleta(
  sessions: Session[],
  sets: ExerciseSet[],
  cardio: CardioEntry[],
  semanas = 8,
): SemanaCompleta[] {
  const porSemana = new Map<string, SemanaCompleta>()
  const sesionesPorSemana = new Map<string, Set<string>>()

  const obtener = (weekStart: string): SemanaCompleta => {
    const actual = porSemana.get(weekStart) ?? {
      weekStart,
      volumen: 0,
      series: 0,
      sesiones: 0,
      cardioMin: 0,
      cardioKm: 0,
      cardioVeces: 0,
    }
    porSemana.set(weekStart, actual)
    return actual
  }

  const fechaPorSesion = new Map(sessions.map((s) => [s.id, s.date]))
  for (const session of sessions) {
    const lunes = startOfWeekISO(session.date)
    const vista = sesionesPorSemana.get(lunes) ?? new Set<string>()
    vista.add(session.id)
    sesionesPorSemana.set(lunes, vista)
  }

  for (const serie of sets) {
    if (serie.isWarmup) continue
    const fecha = fechaPorSesion.get(serie.sessionId)
    if (!fecha) continue
    const actual = obtener(startOfWeekISO(fecha))
    actual.volumen += serie.weight * serie.reps
    actual.series += 1
  }

  for (const entrada of cardio) {
    const actual = obtener(startOfWeekISO(entrada.date))
    actual.cardioMin += entrada.durationMin
    actual.cardioKm += entrada.distanceKm ?? 0
    actual.cardioVeces += 1
  }

  for (const [lunes, ids] of sesionesPorSemana) {
    obtener(lunes).sesiones = ids.size
  }

  return [...porSemana.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-semanas)
}

export interface DiaConActividad {
  date: string
  fuerza: boolean
  cardio: boolean
  /** Resumen corto: "Fuerza A · 65 series" o "Bici 40 min". */
  detalle: string
}

/**
 * Dias con actividad, juntando fuerza y cardio.
 *
 * Sirve para ver de un vistazo los dias que se entreno, los que hubo cardio y los que se hizo
 * todo. Es lo que responde a "¿cuantos dias he entrenado este mes?".
 */
export function diasConActividad(
  sessions: Session[],
  cardio: CardioEntry[],
  limit = 30,
): DiaConActividad[] {
  const porDia = new Map<string, DiaConActividad>()

  const obtener = (date: string): DiaConActividad => {
    const actual = porDia.get(date) ?? { date, fuerza: false, cardio: false, detalle: '' }
    porDia.set(date, actual)
    return actual
  }

  for (const session of sessions) {
    const dia = obtener(session.date)
    dia.fuerza = true
    const partes = dia.detalle ? [dia.detalle] : []
    partes.push(session.routineName || 'Entrenamiento')
    dia.detalle = partes.join(' · ')
  }

  for (const entrada of cardio) {
    const dia = obtener(entrada.date)
    dia.cardio = true
    const resumen = entrada.distanceKm
      ? `${entrada.activity} ${formato(entrada.distanceKm)} km`
      : `${entrada.activity} ${entrada.durationMin} min`
    dia.detalle = dia.detalle ? `${dia.detalle} · ${resumen}` : resumen
  }

  return [...porDia.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

/** Cuantos dias de las ultimas cuatro semanas tuvieron actividad. */
export function resumenConstancia(dias: DiaConActividad[], semanas = 4): { diasActivos: number; soloFuerza: number; soloCardio: number; ambos: number } {
  const desde = new Date()
  desde.setDate(desde.getDate() - semanas * 7)
  const limite = desde.toISOString().slice(0, 10)
  const recientes = dias.filter((d) => d.date >= limite)
  return {
    diasActivos: recientes.length,
    soloFuerza: recientes.filter((d) => d.fuerza && !d.cardio).length,
    soloCardio: recientes.filter((d) => !d.fuerza && d.cardio).length,
    ambos: recientes.filter((d) => d.fuerza && d.cardio).length,
  }
}
