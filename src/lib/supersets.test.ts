/**
 * Pruebas de las superseries.
 *
 * Lo importante aqui es el criterio del descanso: corto al cambiar de ejercicio dentro de
 * la ronda y completo al acabar la ronda. Se prueban tambien los casos raros (series de
 * mas, orden alterado, grupos mal formados) porque son los que rompen en silencio.
 */
import { describe, expect, it } from 'vitest'
import type { ExerciseSet, RoutineExercise } from '../types'
import { groupRoutineExercises } from '../types'
import {
  TRANSICION_POR_DEFECTO,
  buscarGrupo,
  descansoTrasSerie,
  etiquetaDeDescanso,
  etiquetaDeSuperserie,
  resumenDeSuperserie,
  resumenEnSuperserie,
  seriesApuntadas,
} from './supersets'

/** Ejercicio de rutina para las pruebas. */
function re(
  exerciseId: string,
  opciones: Partial<RoutineExercise> = {},
): RoutineExercise {
  return {
    exerciseId,
    name: exerciseId,
    targetSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 12,
    restSeconds: 90,
    ...opciones,
  }
}

/** Serie apuntada, para simular lo que hay en la sesion. */
function serie(exerciseId: string, sessionId = 's1'): ExerciseSet {
  return {
    id: `${exerciseId}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    exerciseId,
    exerciseName: exerciseId,
    order: 0,
    setNumber: 1,
    weight: 50,
    reps: 10,
    isWarmup: false,
    completedAt: Date.now(),
  }
}

const bulgara = re('bulgara', { kind: 'superset', groupSize: 2, restSeconds: 90, transitionSeconds: 15 })
const laterales = re('laterales', { kind: 'superset', groupSize: 2, restSeconds: 90, transitionSeconds: 15 })
const banca = re('banca', { restSeconds: 120 })

describe('agrupar ejercicios de una rutina', () => {
  it('un ejercicio suelto es un grupo de uno', () => {
    const grupos = groupRoutineExercises([banca])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].kind).toBe('single')
  })

  it('los ejercicios de una superserie van juntos y en orden', () => {
    const grupos = groupRoutineExercises([bulgara, laterales, banca])
    expect(grupos).toHaveLength(2)
    expect(grupos[0].kind).toBe('superset')
    expect(grupos[0].exercises.map((e) => e.exerciseId)).toEqual(['bulgara', 'laterales'])
    expect(grupos[1].kind).toBe('single')
  })

  it('admite una superserie de tres ejercicios', () => {
    const a = re('a', { kind: 'superset', groupSize: 3 })
    const b = re('b', { kind: 'superset', groupSize: 3 })
    const c = re('c', { kind: 'superset', groupSize: 3 })
    const grupos = groupRoutineExercises([a, b, c, banca])
    expect(grupos).toHaveLength(2)
    expect(grupos[0].exercises).toHaveLength(3)
  })

  it('las rutinas antiguas (sin los campos nuevos) se leen como sueltas', () => {
    // Es el caso de las rutinas ya guardadas: no hay que migrar nada.
    const antigua = [re('uno'), re('dos'), re('tres')]
    const grupos = groupRoutineExercises(antigua)
    expect(grupos).toHaveLength(3)
    expect(grupos.every((g) => g.kind === 'single')).toBe(true)
  })

  it('un groupSize imposible no deja ejercicios fuera de la sesion', () => {
    // Si el tamaño no cabe, se trata como suelto en lugar de perder el ejercicio.
    const raro = re('raro', { kind: 'superset', groupSize: 5 })
    const grupos = groupRoutineExercises([raro, banca])
    expect(grupos).toHaveLength(2)
    expect(grupos[0].kind).toBe('single')
    const total = grupos.reduce((n, g) => n + g.exercises.length, 0)
    expect(total).toBe(2)
  })

  it('no se pierde ningun ejercicio al agrupar', () => {
    const lista = [bulgara, laterales, banca, re('x', { kind: 'superset', groupSize: 2 }), re('y', { kind: 'superset', groupSize: 2 })]
    const grupos = groupRoutineExercises(lista)
    expect(grupos.flatMap((g) => g.exercises)).toHaveLength(lista.length)
  })
})

describe('buscar la superserie de un ejercicio', () => {
  it('encuentra el grupo y la posicion dentro de el', () => {
    const ejercicios = [bulgara, laterales, banca]
    expect(buscarGrupo(ejercicios, 'bulgara')?.posicion).toBe(0)
    expect(buscarGrupo(ejercicios, 'laterales')?.posicion).toBe(1)
    expect(buscarGrupo(ejercicios, 'banca')?.posicion).toBe(0)
    expect(buscarGrupo(ejercicios, 'bulgara')?.miembros).toHaveLength(2)
  })

  it('devuelve null si el ejercicio no esta en la rutina', () => {
    expect(buscarGrupo([banca], 'inventado')).toBeNull()
  })
})

describe('descanso tras guardar una serie', () => {
  const rutina = [bulgara, laterales, banca]

  it('un ejercicio suelto descansa lo suyo', () => {
    const d = descansoTrasSerie(banca, [serie('banca')], rutina)
    expect(d.motivo).toBe('normal')
    expect(d.segundos).toBe(120)
  })

  it('el primer ejercicio de la superserie descansa CORTO (va el siguiente)', () => {
    // Se acaba de hacer la bulgara: el companero aun no ha hecho su serie.
    const d = descansoTrasSerie(bulgara, [serie('bulgara')], rutina)
    expect(d.motivo).toBe('siguiente-ejercicio')
    expect(d.segundos).toBe(15)
  })

  it('el segundo descansa COMPLETO (la ronda ha terminado)', () => {
    const sets = [serie('bulgara'), serie('laterales')]
    const d = descansoTrasSerie(laterales, sets, rutina)
    expect(d.motivo).toBe('fin-de-ronda')
    expect(d.segundos).toBe(90)
  })

  it('la segunda ronda se comporta igual que la primera', () => {
    const sets = [serie('bulgara'), serie('laterales'), serie('bulgara')]
    expect(descansoTrasSerie(bulgara, sets, rutina).segundos).toBe(15)
    const sets2 = [...sets, serie('laterales')]
    expect(descansoTrasSerie(laterales, sets2, rutina).motivo).toBe('fin-de-ronda')
  })

  it('usa 15 s por defecto si la superserie no dice otra cosa', () => {
    const sinTransicion = re('b', { kind: 'superset', groupSize: 2, restSeconds: 60 })
    const otro = re('c', { kind: 'superset', groupSize: 2, restSeconds: 60 })
    const d = descansoTrasSerie(sinTransicion, [serie('b')], [sinTransicion, otro])
    expect(d.segundos).toBe(TRANSICION_POR_DEFECTO)
  })

  it('si se anaden series de mas, sigue contando por rondas', () => {
    // Dos series de bulgara y una de laterales: le toca a laterales (descanso corto).
    const sets = [serie('bulgara'), serie('bulgara'), serie('laterales')]
    expect(descansoTrasSerie(laterales, sets, rutina).motivo).toBe('siguiente-ejercicio')
    // Con las dos igualadas, fin de ronda.
    const sets2 = [...sets, serie('laterales')]
    expect(descansoTrasSerie(laterales, sets2, rutina).motivo).toBe('fin-de-ronda')
  })

  it('las series de aproximacion no cuentan para las rondas', () => {
    const calentamiento = { ...serie('bulgara'), isWarmup: true }
    expect(seriesApuntadas([calentamiento], 'bulgara')).toBe(0)
    // Y con la superserie recien empezada, toca pasar al siguiente ejercicio.
    expect(descansoTrasSerie(bulgara, [calentamiento], rutina).motivo).toBe('siguiente-ejercicio')
  })

  it('en la aproximacion (sin series apuntadas) el descanso es CORTO', () => {
    // Caso facil de olvidar: si aun no hay ninguna serie, no toca descansar dos minutos.
    const d = descansoTrasSerie(bulgara, [], rutina)
    expect(d.motivo).toBe('siguiente-ejercicio')
    expect(d.segundos).toBe(15)
  })

  it('en una superserie de tres, los dos primeros descansan corto', () => {
    const a = re('a', { kind: 'superset', groupSize: 3, restSeconds: 90 })
    const b = re('b', { kind: 'superset', groupSize: 3, restSeconds: 90 })
    const c = re('c', { kind: 'superset', groupSize: 3, restSeconds: 90 })
    const trio = [a, b, c]
    expect(descansoTrasSerie(a, [serie('a')], trio).motivo).toBe('siguiente-ejercicio')
    expect(descansoTrasSerie(b, [serie('a'), serie('b')], trio).motivo).toBe('siguiente-ejercicio')
    expect(descansoTrasSerie(c, [serie('a'), serie('b'), serie('c')], trio).motivo).toBe('fin-de-ronda')
  })

  it('no falla si el ejercicio no esta en la rutina', () => {
    const d = descansoTrasSerie(re('suelto', { restSeconds: 60 }), [], [banca])
    expect(d.motivo).toBe('normal')
    expect(d.segundos).toBe(60)
  })

  it('aguanta un descanso a cero sin dar valores negativos', () => {
    const d = descansoTrasSerie(re('x', { restSeconds: 0 }), [], [banca])
    expect(d.segundos).toBe(0)
  })
})

describe('etiquetas y resumen', () => {
  it('etiqueta los ejercicios como A1 y A2', () => {
    expect(etiquetaDeSuperserie('A', 0)).toBe('A1')
    expect(etiquetaDeSuperserie('A', 1)).toBe('A2')
    expect(etiquetaDeSuperserie('B', 2)).toBe('B3')
  })

  it('explica para que es el descanso, y calla cuando no hay nada que explicar', () => {
    expect(etiquetaDeDescanso({ segundos: 15, motivo: 'siguiente-ejercicio' })).toBe('Siguiente ejercicio')
    expect(etiquetaDeDescanso({ segundos: 90, motivo: 'fin-de-ronda' })).toBe('Fin de ronda')
    // Un ejercicio suelto no necesita explicacion: la barra se queda limpia.
    expect(etiquetaDeDescanso({ segundos: 90, motivo: 'normal' })).toBeUndefined()
  })

  it('resume la superserie en una linea', () => {
    const texto = resumenDeSuperserie([bulgara, laterales])
    expect(texto).toContain('3 rondas')
    expect(texto).toContain('15 s entre ejercicios')
    expect(texto).toContain('90 s al acabar la ronda')
  })

  it('escribe los descansos largos en minutos', () => {
    const a = re('a', { restSeconds: 120, transitionSeconds: 60, targetSets: 4 })
    const b = re('b', { restSeconds: 120, transitionSeconds: 60, targetSets: 4 })
    const texto = resumenDeSuperserie([a, b])
    expect(texto).toContain('4 rondas')
    expect(texto).toContain('1 min entre ejercicios')
    expect(texto).toContain('2 min al acabar la ronda')
  })

  it('dentro de la superserie explica el descanso que toca de verdad', () => {
    const miembros = [bulgara, laterales]
    // El primero: despues toca el corto y pasar al siguiente.
    expect(resumenEnSuperserie(miembros, 0)).toContain('luego 15 s y al siguiente')
    // El ultimo: aqui si va el descanso largo, porque cierra la ronda.
    expect(resumenEnSuperserie(miembros, 1)).toContain('al acabar: 90 s (fin de ronda)')
  })

  it('usa el numero de rondas del ejercicio con mas series', () => {
    const a = re('a', { targetSets: 4 })
    const b = re('b', { targetSets: 3 })
    expect(resumenDeSuperserie([a, b])).toContain('4 rondas')
  })
})
