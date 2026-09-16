/**
 * Entrenamientos de cardio por series y fartlek.
 *
 * QUE FALTABA: solo se podia apuntar un bloque continuo (una duracion y una distancia). Pero un
 * entrenamiento de series no es eso: son tramos con ritmos distintos (calentamiento, series fuertes
 * con recuperaciones, vuelta a la calma). Y un fartlek son cambios de ritmo sin estructura fija.
 *
 * Todo son funciones puras, para poder probarlas sin navegador.
 */

import type { CardioEntry, CardioSegmento, IntensidadCardio } from '../types'

/** Tipos de entrenamiento de cardio. */
export type TipoCardio = 'continuo' | 'series' | 'fartlek'

export const TIPOS_CARDIO: { valor: TipoCardio; texto: string; ayuda: string }[] = [
  {
    valor: 'continuo',
    texto: 'Continuo',
    ayuda: 'Un solo bloque al mismo ritmo: bici tranquila, carrera suave, marcha…',
  },
  {
    valor: 'series',
    texto: 'Series',
    ayuda: 'Tramos fuertes con recuperaciones entre ellos. Se apunta cada tramo por separado.',
  },
  {
    valor: 'fartlek',
    texto: 'Fartlek',
    ayuda: 'Cambios de ritmo sin estructura fija: rápido cuando apetece, suave para recuperar.',
  },
]

/** Intensidades de un tramo, de mas suave a mas fuerte. */
export const INTENSIDADES: { valor: IntensidadCardio; texto: string; corto: string }[] = [
  { valor: 'recuperacion', texto: 'Recuperación', corto: 'Rec' },
  { valor: 'suave', texto: 'Suave', corto: 'Suave' },
  { valor: 'medio', texto: 'Medio', corto: 'Medio' },
  { valor: 'fuerte', texto: 'Fuerte', corto: 'Fuerte' },
  { valor: 'maximo', texto: 'A tope', corto: 'Tope' },
]

/** Texto de una intensidad. */
export function textoIntensidad(intensidad: IntensidadCardio): string {
  return INTENSIDADES.find((i) => i.valor === intensidad)?.texto ?? intensidad
}

/** Color de una intensidad, para pintar los tramos. */
export function nivelIntensidad(intensidad: IntensidadCardio): number {
  const indice = INTENSIDADES.findIndex((i) => i.valor === intensidad)
  return indice < 0 ? 2 : indice + 1
}

/** El tipo de un entrenamiento, entendiendo las entradas antiguas como continuas. */
export function tipoDe(entrada: Pick<CardioEntry, 'tipo' | 'segmentos'>): TipoCardio {
  if (entrada.segmentos && entrada.segmentos.length > 0) return entrada.tipo ?? 'series'
  return entrada.tipo ?? 'continuo'
}

/** Texto del tipo, para mostrar. */
export function textoTipo(tipo: TipoCardio): string {
  return TIPOS_CARDIO.find((t) => t.valor === tipo)?.texto ?? tipo
}

/** Suma los tramos: minutos y kilometros totales. */
export function totalesDeSegmentos(segmentos: CardioSegmento[]): { minutos: number; km: number } {
  let minutos = 0
  let km = 0
  for (const segmento of segmentos) {
    minutos += segmento.durationMin ?? 0
    km += segmento.distanceKm ?? 0
  }
  return { minutos: Math.round(minutos * 100) / 100, km: Math.round(km * 100) / 100 }
}

/**
 * Totales de un entrenamiento.
 *
 * Para los continuos se usan sus campos; para los de series, la suma de los tramos (que es lo que
 * el usuario apunto tramo a tramo). Asi el total nunca contradice a los tramos.
 */
export function totalesDe(entrada: CardioEntry): { minutos: number; km: number } {
  const segmentos = entrada.segmentos ?? []
  if (segmentos.length === 0) {
    return { minutos: entrada.durationMin, km: entrada.distanceKm ?? 0 }
  }
  const suma = totalesDeSegmentos(segmentos)
  return {
    // Si por lo que sea los tramos no tienen tiempo, se respeta el total apuntado.
    minutos: suma.minutos > 0 ? suma.minutos : entrada.durationMin,
    km: suma.km > 0 ? suma.km : (entrada.distanceKm ?? 0),
  }
}

/**
 * Cuenta las series de un entrenamiento: los tramos FUERTES (o a tope) seguidos de una
 * recuperacion cuentan como una serie.
 *
 * Sirve para responder a "cuantas series hice": en un 6x400 hay seis series, y en un fartlek lo que
 * salga. Se cuenta cada tramo fuerte como una serie; es la forma habitual de contarlo.
 */
export function contarSeries(segmentos: CardioSegmento[]): number {
  return segmentos.filter((s) => s.intensidad === 'fuerte' || s.intensidad === 'maximo').length
}

/**
 * Resumen corto de un entrenamiento por series: "6 series · 2 a tope".
 * Devuelve null si no tiene tramos.
 */
export function resumenDeSeries(segmentos: CardioSegmento[]): string | null {
  if (segmentos.length === 0) return null
  const series = contarSeries(segmentos)
  const aTope = segmentos.filter((s) => s.intensidad === 'maximo').length
  const partes: string[] = []
  if (series > 0) partes.push(`${series} ${series === 1 ? 'serie' : 'series'}`)
  if (aTope > 0 && aTope !== series) partes.push(`${aTope} a tope`)
  partes.push(`${segmentos.length} ${segmentos.length === 1 ? 'tramo' : 'tramos'}`)
  return partes.join(' · ')
}

/** Minutos de cada intensidad, para saber cuanto se hizo a cada ritmo. */
export function minutosPorIntensidad(segmentos: CardioSegmento[]): Partial<Record<IntensidadCardio, number>> {
  const acumulado: Partial<Record<IntensidadCardio, number>> = {}
  for (const segmento of segmentos) {
    if (!segmento.durationMin) continue
    acumulado[segmento.intensidad] = (acumulado[segmento.intensidad] ?? 0) + segmento.durationMin
  }
  return acumulado
}

/** Un tramo nuevo vacio, con identificador unico. */
export function tramoNuevo(intensidad: IntensidadCardio = 'fuerte', id: string): CardioSegmento {
  return { id, intensidad }
}

/** Unidad con la que se apuntan los tramos: por tiempo, por metros o por kilometros. */
export type UnidadTramo = 'tiempo' | 'metros' | 'km'

export const UNIDADES: { valor: UnidadTramo; texto: string; ayuda: string }[] = [
  { valor: 'tiempo', texto: 'Por tiempo', ayuda: 'Series de minutos: 3 min fuerte, 2 min suave…' },
  { valor: 'metros', texto: 'Por metros', ayuda: 'Series cortas de pista: 400 m, 200 m, 100 m…' },
  { valor: 'km', texto: 'Por km', ayuda: 'Series largas: 1 km, 2 km…' },
]

/** Metros a kilometros, para poder guardar siempre la distancia en km. */
export function metrosAKm(metros: number | undefined): number | undefined {
  if (metros === undefined || metros === null) return undefined
  return Math.round((metros / 1000) * 100) / 100
}

/**
 * Plantilla BASE de un entrenamiento por tramos: CUATRO tramos.
 *
 * A proposito son solo cuatro: calentamiento, el primer tramo fuerte, su recuperacion y la vuelta a
 * la calma. Antes se proponian 14 tramos (seis series con sus recuperaciones) y eso es demasiado:
 * el deportista casi nunca hace exactamente esa estructura, asi que tenia que borrar la mitad antes
 * de empezar. Con cuatro se ve la idea y el que quiera mas series las anade con "+ Serie".
 */
export function plantillaBase(
  tipo: 'series' | 'fartlek',
  generarId: () => string,
  minutosCalentamiento = 10,
  minutosVuelta = 5,
): CardioSegmento[] {
  const fuerte = tipo === 'series' ? 'Serie 1' : 'Tramo fuerte'
  const suave = tipo === 'series' ? 'Recuperación' : 'Tramo suave'
  return [
    { id: generarId(), intensidad: 'suave', durationMin: minutosCalentamiento, notes: 'Calentamiento' },
    { id: generarId(), intensidad: 'fuerte', durationMin: 3, notes: fuerte },
    { id: generarId(), intensidad: 'recuperacion', durationMin: 2, notes: suave },
    { id: generarId(), intensidad: 'suave', durationMin: minutosVuelta, notes: 'Vuelta a la calma' },
  ]
}

/**
 * Una serie mas con su recuperacion, para el atajo "+ Serie".
 * Se anade justo ANTES de la vuelta a la calma, que es donde toca.
 */
export function serieExtra(
  segmentos: CardioSegmento[],
  generarId: () => string,
  minutosSerie = 3,
  minutosRecuperacion = 2,
): CardioSegmento[] {
  const nuevas: CardioSegmento[] = [
    { id: generarId(), intensidad: 'fuerte', durationMin: minutosSerie },
  ]
  if (minutosRecuperacion > 0) {
    nuevas.push({ id: generarId(), intensidad: 'recuperacion', durationMin: minutosRecuperacion })
  }
  // Si el ultimo tramo es la vuelta a la calma, las series van antes.
  const ultimo = segmentos[segmentos.length - 1]
  if (ultimo && /vuelta a la calma/i.test(ultimo.notes ?? '')) {
    return [...segmentos.slice(0, -1), ...nuevas, ultimo]
  }
  return [...segmentos, ...nuevas]
}
