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

/**
 * Plantilla de series: calentamiento, N series fuertes con su recuperacion, y vuelta a la calma.
 *
 * Se ofrece como punto de partida para no tener que apuntar seis tramos a mano: los tiempos son
 * orientativos y se cambian. Es la estructura clasica de un entrenamiento de series.
 */
export function plantillaDeSeries(
  cuantas: number,
  minutosSerie = 3,
  minutosRecuperacion = 2,
  minutosCalentamiento = 10,
  minutosVuelta = 5,
  generarId: () => string,
): CardioSegmento[] {
  const tramos: CardioSegmento[] = []
  if (minutosCalentamiento > 0) {
    tramos.push({ id: generarId(), intensidad: 'suave', durationMin: minutosCalentamiento, notes: 'Calentamiento' })
  }
  for (let i = 0; i < cuantas; i += 1) {
    tramos.push({ id: generarId(), intensidad: 'fuerte', durationMin: minutosSerie })
    if (minutosRecuperacion > 0) {
      tramos.push({ id: generarId(), intensidad: 'recuperacion', durationMin: minutosRecuperacion })
    }
  }
  if (minutosVuelta > 0) {
    tramos.push({ id: generarId(), intensidad: 'suave', durationMin: minutosVuelta, notes: 'Vuelta a la calma' })
  }
  return tramos
}

/**
 * Plantilla de fartlek: cambios de ritmo sin estructura fija.
 *
 * Se reparten tramos alternando fuerte y suave, con tiempos variados, que es lo que caracteriza al
 * fartlek: no hay series iguales.
 */
export function plantillaDeFartlek(generarId: () => string, total = 10): CardioSegmento[] {
  const tramos: CardioSegmento[] = [
    { id: generarId(), intensidad: 'suave', durationMin: 8, notes: 'Calentamiento' },
  ]
  const cambios = [
    { intensidad: 'fuerte' as const, durationMin: 2 },
    { intensidad: 'suave' as const, durationMin: 3 },
    { intensidad: 'maximo' as const, durationMin: 1 },
    { intensidad: 'recuperacion' as const, durationMin: 2 },
    { intensidad: 'fuerte' as const, durationMin: 3 },
    { intensidad: 'medio' as const, durationMin: 4 },
    { intensidad: 'fuerte' as const, durationMin: 2 },
    { intensidad: 'recuperacion' as const, durationMin: 3 },
    { intensidad: 'medio' as const, durationMin: 5 },
  ]
  for (let i = 0; i < Math.min(total, cambios.length); i += 1) {
    tramos.push({ id: generarId(), ...cambios[i] })
  }
  tramos.push({ id: generarId(), intensidad: 'suave', durationMin: 5, notes: 'Vuelta a la calma' })
  return tramos
}
