/**
 * Pruebas de los entrenamientos de cardio por series y fartlek.
 *
 * Lo que se protege: que los totales de un entrenamiento por series salgan de sus tramos (y no de
 * un total suelto que podria contradecirlos), que las entradas antiguas sigan leyendose bien como
 * continuas, y que las plantillas den estructuras razonables.
 */
import { describe, expect, it } from 'vitest'
import type { CardioEntry, CardioSegmento } from '../types'
import {
  contarSeries,
  minutosPorIntensidad,
  nivelIntensidad,
  plantillaDeFartlek,
  plantillaDeSeries,
  resumenDeSeries,
  textoIntensidad,
  textoTipo,
  tipoDe,
  totalesDe,
  totalesDeSegmentos,
  tramoNuevo,
} from './cardio'

/** Generador de identificadores predecible, para las pruebas. */
function ids() {
  let n = 0
  return () => `t${(n += 1)}`
}

function segmento(opciones: Partial<CardioSegmento> = {}): CardioSegmento {
  return { id: `s${Math.random().toString(36).slice(2, 6)}`, intensidad: 'fuerte', ...opciones }
}

function entrada(opciones: Partial<CardioEntry> = {}): CardioEntry {
  return {
    id: 'c1',
    activity: 'Carrera',
    date: '2026-09-16',
    durationMin: 45,
    createdAt: 0,
    ...opciones,
  }
}

describe('tipo de entrenamiento', () => {
  it('las entradas antiguas son continuas', () => {
    // Las que se apuntaron antes de que existieran las series no tienen ni tipo ni tramos.
    expect(tipoDe({})).toBe('continuo')
    expect(tipoDe({ segmentos: [] })).toBe('continuo')
  })

  it('con tramos, es de series', () => {
    expect(tipoDe({ segmentos: [segmento()] })).toBe('series')
  })

  it('respeta el tipo indicado', () => {
    expect(tipoDe({ tipo: 'fartlek', segmentos: [segmento()] })).toBe('fartlek')
    expect(tipoDe({ tipo: 'continuo' })).toBe('continuo')
  })

  it('los nombres se escriben bien', () => {
    expect(textoTipo('series')).toBe('Series')
    expect(textoTipo('fartlek')).toBe('Fartlek')
    expect(textoTipo('continuo')).toBe('Continuo')
  })
})

describe('totales de un entrenamiento', () => {
  it('un continuo usa su duración y su distancia', () => {
    const totales = totalesDe(entrada({ durationMin: 60, distanceKm: 25 }))
    expect(totales).toEqual({ minutos: 60, km: 25 })
  })

  it('un entrenamiento por series suma sus tramos', () => {
    // 10 de calentamiento + 3 series de 3 min + 2 recuperaciones de 2 + 5 de vuelta
    const segmentos = [
      segmento({ intensidad: 'suave', durationMin: 10, distanceKm: 1.8 }),
      segmento({ durationMin: 3, distanceKm: 1 }),
      segmento({ intensidad: 'recuperacion', durationMin: 2, distanceKm: 0.4 }),
      segmento({ durationMin: 3, distanceKm: 1 }),
      segmento({ intensidad: 'recuperacion', durationMin: 2, distanceKm: 0.4 }),
      segmento({ durationMin: 3, distanceKm: 1 }),
      segmento({ intensidad: 'recuperacion', durationMin: 2, distanceKm: 0.4 }),
      segmento({ intensidad: 'suave', durationMin: 5 }),
    ]
    const totales = totalesDe(entrada({ tipo: 'series', segmentos, durationMin: 0 }))
    expect(totales.minutos).toBe(30)
    expect(totales.km).toBe(6)
  })

  it('el total NUNCA contradice a los tramos', () => {
    /*
     * Es lo importante: si alguien apunta 30 minutos en los tramos y deja el total a 45 por
     * descuido, manda la suma de los tramos, que es lo que apunto de verdad.
     */
    const segmentos = [segmento({ durationMin: 15 }), segmento({ durationMin: 15 })]
    const totales = totalesDe(entrada({ segmentos, durationMin: 45 }))
    expect(totales.minutos).toBe(30)
  })

  it('si los tramos no tienen tiempo, se respeta el total', () => {
    // Caso de alguien que solo apunta las distancias de cada tramo.
    const segmentos = [segmento({ distanceKm: 1 }), segmento({ distanceKm: 1 })]
    const totales = totalesDe(entrada({ segmentos, durationMin: 20 }))
    expect(totales.minutos).toBe(20)
    expect(totales.km).toBe(2)
  })

  it('suma bien los tramos', () => {
    expect(totalesDeSegmentos([{ id: 'a', intensidad: 'suave', durationMin: 10.5 }, { id: 'b', intensidad: 'fuerte', durationMin: 2.25 }]))
      .toEqual({ minutos: 12.75, km: 0 })
  })

  it('sin tramos ni datos, sale cero', () => {
    expect(totalesDeSegmentos([])).toEqual({ minutos: 0, km: 0 })
  })
})

describe('contar series', () => {
  it('cuenta los tramos fuertes y a tope', () => {
    const segmentos = [
      segmento({ intensidad: 'suave' }),
      segmento({ intensidad: 'fuerte' }),
      segmento({ intensidad: 'recuperacion' }),
      segmento({ intensidad: 'fuerte' }),
      segmento({ intensidad: 'maximo' }),
      segmento({ intensidad: 'suave' }),
    ]
    expect(contarSeries(segmentos)).toBe(3)
  })

  it('un fartlek con cambios de ritmo también cuenta sus tramos fuertes', () => {
    const segmentos = [
      segmento({ intensidad: 'suave' }),
      segmento({ intensidad: 'fuerte' }),
      segmento({ intensidad: 'medio' }),
      segmento({ intensidad: 'fuerte' }),
    ]
    expect(contarSeries(segmentos)).toBe(2)
  })

  it('sin tramos fuertes, cero series', () => {
    expect(contarSeries([segmento({ intensidad: 'suave' })])).toBe(0)
  })

  it('resume el entrenamiento en una línea', () => {
    const segmentos = [
      segmento({ intensidad: 'fuerte' }),
      segmento({ intensidad: 'recuperacion' }),
      segmento({ intensidad: 'maximo' }),
    ]
    const resumen = resumenDeSeries(segmentos)
    expect(resumen).toContain('2 series')
    expect(resumen).toContain('3 tramos')
  })

  it('sin tramos no hay resumen', () => {
    expect(resumenDeSeries([])).toBeNull()
  })
})

describe('minutos por intensidad', () => {
  it('agrupa el tiempo de cada ritmo', () => {
    const segmentos = [
      segmento({ intensidad: 'suave', durationMin: 10 }),
      segmento({ intensidad: 'fuerte', durationMin: 3 }),
      segmento({ intensidad: 'fuerte', durationMin: 3 }),
      segmento({ intensidad: 'recuperacion', durationMin: 4 }),
    ]
    const minutos = minutosPorIntensidad(segmentos)
    expect(minutos.suave).toBe(10)
    expect(minutos.fuerte).toBe(6)
    expect(minutos.recuperacion).toBe(4)
  })

  it('ignora los tramos sin tiempo', () => {
    expect(minutosPorIntensidad([segmento({ intensidad: 'fuerte' })])).toEqual({})
  })
})

describe('intensidades', () => {
  it('están ordenadas de suave a fuerte', () => {
    expect(nivelIntensidad('recuperacion')).toBe(1)
    expect(nivelIntensidad('suave')).toBe(2)
    expect(nivelIntensidad('fuerte')).toBe(4)
    expect(nivelIntensidad('maximo')).toBe(5)
    expect(nivelIntensidad('recuperacion')).toBeLessThan(nivelIntensidad('maximo'))
  })

  it('tienen nombre legible', () => {
    expect(textoIntensidad('maximo')).toBe('A tope')
    expect(textoIntensidad('recuperacion')).toBe('Recuperación')
  })
})

describe('plantillas', () => {
  it('la de series hace calentamiento, series con recuperación y vuelta a la calma', () => {
    const tramos = plantillaDeSeries(6, 3, 2, 10, 5, ids())
    // 1 calentamiento + 6 x (serie + recuperación) + 1 vuelta
    expect(tramos).toHaveLength(1 + 12 + 1)
    expect(tramos[0].intensidad).toBe('suave')
    expect(tramos[0].notes).toBe('Calentamiento')
    expect(tramos[tramos.length - 1].notes).toBe('Vuelta a la calma')
    expect(tramos.filter((t) => t.intensidad === 'fuerte')).toHaveLength(6)
    expect(tramos.filter((t) => t.intensidad === 'recuperacion')).toHaveLength(6)
  })

  it('la plantilla de series se puede ajustar', () => {
    const tramos = plantillaDeSeries(4, 5, 0, 0, 0, ids())
    // Sin calentamiento, sin recuperación y sin vuelta: solo las 4 series.
    expect(tramos).toHaveLength(4)
    expect(tramos.every((t) => t.intensidad === 'fuerte')).toBe(true)
    expect(tramos.every((t) => t.durationMin === 5)).toBe(true)
  })

  it('la de fartlek alterna ritmos y no repite la misma estructura', () => {
    const tramos = plantillaDeFartlek(ids())
    expect(tramos.length).toBeGreaterThan(5)
    expect(tramos[0].intensidad).toBe('suave')
    // Tiene al menos un tramo fuerte y uno de recuperacion: eso es un fartlek.
    expect(tramos.some((t) => t.intensidad === 'fuerte')).toBe(true)
    expect(tramos.some((t) => t.intensidad === 'recuperacion')).toBe(true)
    // Y los tiempos no son todos iguales (no es una serie estructurada).
    const tiempos = new Set(tramos.map((t) => t.durationMin))
    expect(tiempos.size).toBeGreaterThan(2)
  })

  it('los tramos de las plantillas tienen identificadores distintos', () => {
    const tramos = plantillaDeSeries(6, 3, 2, 10, 5, ids())
    expect(new Set(tramos.map((t) => t.id)).size).toBe(tramos.length)
  })

  it('los totales de una plantilla son razonables', () => {
    const tramos = plantillaDeSeries(6, 3, 2, 10, 5, ids())
    const totales = totalesDeSegmentos(tramos)
    // 10 + 6 x (3 + 2) + 5 = 45 minutos
    expect(totales.minutos).toBe(45)
  })
})

describe('tramo nuevo', () => {
  it('nace sin tiempo ni distancia, para rellenarlo', () => {
    const tramo = tramoNuevo('fuerte', 'x1')
    expect(tramo).toEqual({ id: 'x1', intensidad: 'fuerte' })
  })
})
