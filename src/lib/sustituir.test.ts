/**
 * Pruebas de la sustitucion de un ejercicio durante la sesion.
 *
 * Lo que se protege aqui, y es lo importante: que cambiar de ejercicio NO pierda nada de lo
 * apuntado y que se conserve el plan (series, repeticiones, descanso y superserie). Cambiar de
 * ejercicio es algo que pasa en cualquier gimnasio (maquina ocupada), y si al hacerlo se perdiera
 * el trabajo o se desmontara la rutina, nadie lo usaria.
 */
import { describe, expect, it } from 'vitest'
import type { RoutineExercise } from '../types'
import { marcaDeCambio, mismoEjercicio, sePuedeAnadir, sustituirEjercicio } from './supersets'

function re(exerciseId: string, opciones: Partial<RoutineExercise> = {}): RoutineExercise {
  return {
    exerciseId,
    name: exerciseId,
    targetSets: 4,
    targetRepsMin: 8,
    targetRepsMax: 10,
    restSeconds: 90,
    ...opciones,
  }
}

describe('sustituir un ejercicio', () => {
  it('cambia el ejercicio por el nuevo, con su nombre', () => {
    const rutina = [re('sentadilla', { name: 'Sentadilla' }), re('banca', { name: 'Press banca' })]
    const despues = sustituirEjercicio(rutina, 'sentadilla', { exerciseId: 'prensa', name: 'Prensa' })
    expect(despues[0].exerciseId).toBe('prensa')
    expect(despues[0].name).toBe('Prensa')
    expect(despues[1].exerciseId).toBe('banca')
  })

  it('CONSERVA el plan: series, repeticiones y descanso', () => {
    // Cambiar de ejercicio no tiene por que cambiar el plan.
    const rutina = [re('sentadilla', { name: 'Sentadilla', targetSets: 5, targetRepsMin: 6, targetRepsMax: 8, restSeconds: 150 })]
    const despues = sustituirEjercicio(rutina, 'sentadilla', { exerciseId: 'prensa', name: 'Prensa' })
    expect(despues[0].targetSets).toBe(5)
    expect(despues[0].targetRepsMin).toBe(6)
    expect(despues[0].targetRepsMax).toBe(8)
    expect(despues[0].restSeconds).toBe(150)
  })

  it('CONSERVA la superserie', () => {
    const rutina = [
      re('a', { name: 'Búlgara', kind: 'superset', groupSize: 2, transitionSeconds: 15 }),
      re('b', { name: 'Laterales', kind: 'superset', groupSize: 2, transitionSeconds: 15 }),
    ]
    const despues = sustituirEjercicio(rutina, 'a', { exerciseId: 'zancada', name: 'Zancada' })
    expect(despues[0].kind).toBe('superset')
    expect(despues[0].groupSize).toBe(2)
    expect(despues[0].transitionSeconds).toBe(15)
    // Y el companero sigue formando parte del grupo.
    expect(despues[1].groupSize).toBe(2)
  })

  it('anota de dónde viene, para entender la sesión después', () => {
    const rutina = [re('sentadilla', { name: 'Sentadilla' })]
    const despues = sustituirEjercicio(rutina, 'sentadilla', { exerciseId: 'prensa', name: 'Prensa' })
    expect(despues[0].notes).toContain('Cambiado desde Sentadilla')
  })

  it('si se cambia dos veces, solo queda de dónde viene ahora', () => {
    /*
     * Encadenar cambios acumulaba marcas ("Cambiado desde A · Cambiado desde B"), que no se lee.
     * Se queda solo la ultima, que es la que informa.
     */
    const rutina = [re('sentadilla', { name: 'Sentadilla' })]
    const una = sustituirEjercicio(rutina, 'sentadilla', { exerciseId: 'prensa', name: 'Prensa' })
    const dos = sustituirEjercicio(una, 'prensa', { exerciseId: 'sentadilla-guiada', name: 'Sentadilla guiada' })
    expect(dos[0].notes).toBe('Cambiado desde Prensa')
    expect(dos[0].notes).not.toContain('· Cambiado desde')
  })

  it('pero conserva las notas escritas por el usuario al cambiar dos veces', () => {
    const rutina = [re('sentadilla', { name: 'Sentadilla', notes: 'Cuidado con la espalda' })]
    const una = sustituirEjercicio(rutina, 'sentadilla', { exerciseId: 'prensa', name: 'Prensa' })
    const dos = sustituirEjercicio(una, 'prensa', { exerciseId: 'zancada', name: 'Zancada' })
    expect(dos[0].notes).toContain('Cuidado con la espalda')
    expect(dos[0].notes).toContain('Cambiado desde Prensa')
  })

  it('conserva las notas que ya tenía el ejercicio', () => {
    const rutina = [re('sentadilla', { name: 'Sentadilla', notes: 'Cuidado con la espalda' })]
    const despues = sustituirEjercicio(rutina, 'sentadilla', { exerciseId: 'prensa', name: 'Prensa' })
    expect(despues[0].notes).toContain('Cuidado con la espalda')
    expect(despues[0].notes).toContain('Cambiado desde Sentadilla')
  })

  it('si el nombre no cambia, no anota nada', () => {
    // Puede pasar al corregir el nombre de un ejercicio: no hay cambio que anotar.
    const rutina = [re('sentadilla', { name: 'Sentadilla' })]
    const despues = sustituirEjercicio(rutina, 'sentadilla', { exerciseId: 'sentadilla-guiada', name: 'Sentadilla' })
    expect(despues[0].notes).toBeUndefined()
  })

  it('no toca nada si el ejercicio no está en la sesión', () => {
    const rutina = [re('banca', { name: 'Press banca' })]
    const despues = sustituirEjercicio(rutina, 'inventado', { exerciseId: 'prensa', name: 'Prensa' })
    expect(despues).toHaveLength(1)
    expect(despues[0].exerciseId).toBe('banca')
  })

  it('no se pierde ningún ejercicio de la sesión', () => {
    const rutina = [re('a'), re('b'), re('c'), re('d')]
    const despues = sustituirEjercicio(rutina, 'b', { exerciseId: 'nuevo', name: 'Nuevo' })
    expect(despues).toHaveLength(4)
    expect(despues.map((e) => e.exerciseId)).toEqual(['a', 'nuevo', 'c', 'd'])
  })

  it('mantiene el orden, que es el de la rutina', () => {
    const rutina = [re('a'), re('b'), re('c')]
    const despues = sustituirEjercicio(rutina, 'a', { exerciseId: 'z', name: 'Z' })
    expect(despues.map((e) => e.exerciseId)).toEqual(['z', 'b', 'c'])
  })
})

describe('marca de cambio para las series nuevas', () => {
  it('anota el ejercicio anterior cuando cambia el nombre', () => {
    expect(marcaDeCambio('Sentadilla', 'Prensa')).toBe('Cambiado desde Sentadilla')
  })

  it('no anota nada si es el mismo nombre', () => {
    expect(marcaDeCambio('Sentadilla', 'Sentadilla')).toBeUndefined()
    expect(marcaDeCambio('', 'Prensa')).toBeUndefined()
  })
})

describe('no repetir ejercicios en la sesión', () => {
  /*
   * Fallo real encontrado con una prueba: al sustituir un ejercicio por otro que YA estaba en la
   * sesion, quedaban dos tarjetas del mismo ejercicio y el usuario no sabia cual era cual. Se
   * comprueba por identificador Y por nombre, porque dos ejercicios distintos pueden llamarse
   * igual (uno de una rutina antigua y otro de la biblioteca).
   */
  const sesion = [re('banca', { name: 'Press banca' }), re('sentadilla', { name: 'Back squat' })]

  it('no deja añadir el mismo ejercicio (mismo identificador)', () => {
    expect(sePuedeAnadir(sesion, { exerciseId: 'banca', name: 'Press banca' })).toBe(false)
  })

  it('tampoco deja añadirlo con otro identificador si se llama igual', () => {
    // Caso real: un ejercicio de una rutina antigua y otro de la biblioteca, con el mismo nombre.
    expect(sePuedeAnadir(sesion, { exerciseId: 'otro-id', name: 'Press banca' })).toBe(false)
  })

  it('da igual como se escriba el nombre', () => {
    expect(sePuedeAnadir(sesion, { exerciseId: 'x', name: '  PRESS   BANCA ' })).toBe(false)
  })

  it('sí deja añadir un ejercicio distinto', () => {
    expect(sePuedeAnadir(sesion, { exerciseId: 'remo', name: 'Remo con barra' })).toBe(true)
  })

  it('un nombre parecido pero distinto sí se admite', () => {
    // "Remo con barra" y "Remo con barra (máquina)" son ejercicios diferentes.
    const conRemo = [...sesion, re('remo', { name: 'Remo con barra' })]
    expect(sePuedeAnadir(conRemo, { exerciseId: 'remo-maq', name: 'Remo con barra (máquina)' })).toBe(true)
  })

  it('compara nombres ignorando mayúsculas y espacios de más', () => {
    expect(mismoEjercicio('Press banca', 'press  BANCA')).toBe(true)
    expect(mismoEjercicio('Press banca', 'Press inclinado')).toBe(false)
  })
})
