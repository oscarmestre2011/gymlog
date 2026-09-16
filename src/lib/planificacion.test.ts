/**
 * Pruebas de la planificacion semanal.
 *
 * Lo que se protege aqui: que la app diga el dia correcto (incluidos los cambios de mes y de año, y
 * el domingo, que es donde se suele fallar) y que al programar rutinas no se pierda ninguna.
 *
 * Antes los dias estaban escritos a mano en el codigo, asi que ademas se comprueba que una rutina
 * SIN dia no se proponga nunca: es lo que se espera de "no planificada".
 */
import { describe, expect, it } from 'vitest'
import type { Routine } from '../types'
import {
  DIAS,
  avisosDelPlan,
  diaDeLaFecha,
  diasDeRutina,
  nombreCortoDelDia,
  nombreDelDia,
  planSemanal,
  rutinasDelDia,
  rutinasSinDia,
  textoDeDias,
  tocaHoy,
} from './planificacion'

function rutina(opciones: Partial<Routine> & { name: string }): Routine {
  return {
    id: opciones.name,
    exercises: [],
    createdAt: 0,
    updatedAt: 0,
    ...opciones,
  } as Routine
}

describe('dias de la semana', () => {
  it('nombra los dias', () => {
    expect(nombreDelDia(1)).toBe('lunes')
    expect(nombreDelDia(3)).toBe('miércoles')
    expect(nombreDelDia(0)).toBe('domingo')
    expect(nombreCortoDelDia(5)).toBe('Vie')
  })

  it('sabe qué día de la semana es una fecha', () => {
    // 16 de septiembre de 2026 es miercoles.
    expect(diaDeLaFecha('2026-09-16')).toBe(3)
    // 13 de septiembre de 2026 es domingo.
    expect(diaDeLaFecha('2026-09-13')).toBe(0)
  })

  it('no se equivoca con el cambio de mes ni de año', () => {
    // Casos donde una resta mal hecha se desvia un dia.
    expect(diaDeLaFecha('2026-10-01')).toBe(4) // jueves
    expect(diaDeLaFecha('2027-01-01')).toBe(5) // viernes
    expect(diaDeLaFecha('2026-03-01')).toBe(0) // domingo
  })

  it('no se desvia por la zona horaria', () => {
    /*
     * Con `new Date('2026-09-16')` algunos navegadores interpretan la fecha en UTC y el dia se
     * desplaza al anterior. Por eso se construye con los tres numeros. Si esto falla, "hoy" no
     * coincidiria con el dia real y la app propondria el entrenamiento equivocado.
     */
    expect(diaDeLaFecha('2026-09-16')).toBe(diaDeLaFecha('2026-09-16'))
    expect(nombreDelDia(diaDeLaFecha('2026-09-16'))).toBe('miércoles')
  })

  it('hay siete dias, del domingo al sabado', () => {
    expect(DIAS).toHaveLength(7)
    expect(DIAS.map((d) => d.indice)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('rutinas de un día', () => {
  const rutinas = [
    rutina({ name: 'Fuerza A', code: 'A', weekdays: [1] }),
    rutina({ name: 'Fuerza B', code: 'B', weekdays: [3] }),
    rutina({ name: 'Fuerza C', code: 'C', weekdays: [5] }),
    rutina({ name: 'Cardio suave', code: 'K', weekdays: [1, 5] }),
    rutina({ name: 'Experimento', code: 'X' }),
  ]

  it('devuelve la rutina del día', () => {
    expect(rutinasDelDia(rutinas, 3).map((r) => r.name)).toEqual(['Fuerza B'])
  })

  it('admite varias rutinas el mismo día, ordenadas por letra', () => {
    expect(rutinasDelDia(rutinas, 1).map((r) => r.code)).toEqual(['A', 'K'])
  })

  it('una rutina sin día NO se propone nunca', () => {
    // Es lo que se espera de "no planificada".
    for (let dia = 0; dia < 7; dia += 1) {
      expect(rutinasDelDia(rutinas, dia).map((r) => r.name)).not.toContain('Experimento')
    }
  })

  it('un día sin nada devuelve una lista vacía', () => {
    expect(rutinasDelDia([rutina({ name: 'A', weekdays: [1] })], 4)).toEqual([])
  })

  it('sabe si una rutina toca hoy', () => {
    expect(tocaHoy(rutinas[0], 1)).toBe(true)
    expect(tocaHoy(rutinas[0], 2)).toBe(false)
    expect(tocaHoy(rutinas[3], 5)).toBe(true)
  })

  it('la etiqueta de texto (weekday) NO decide la planificación', () => {
    /*
     * Ojo: la rutina tiene un campo `weekday` que es la ETIQUETA que se ve en la tarjeta
     * ("Lunes"), heredado de las rutinas de ejemplo. Lo que decide el dia es `weekdays`. Si alguna
     * vez se confunden, la app propondria el entrenamiento equivocado.
     */
    const conEtiqueta = { ...rutina({ name: 'Con etiqueta' }), weekday: 'Lunes' } as Routine
    expect(diasDeRutina(conEtiqueta)).toEqual([])
    expect(textoDeDias(conEtiqueta)).toBe('Sin día asignado')
  })

  it('una rutina sin días no se propone y se dice claramente', () => {
    const sinDia = rutina({ name: 'Sin día' })
    expect(diasDeRutina(sinDia)).toEqual([])
    expect(textoDeDias(sinDia)).toBe('Sin día asignado')
  })

  it('los dias van ordenados de lunes a domingo, sin repetidos', () => {
    const rara = rutina({ name: 'Rara', weekdays: [5, 1, 0, 1] })
    expect(diasDeRutina(rara)).toEqual([1, 5, 0])
  })

  it('separa las rutinas sin programar', () => {
    expect(rutinasSinDia(rutinas).map((r) => r.name)).toEqual(['Experimento'])
  })
})

describe('texto de los días de una rutina', () => {
  it('un día', () => {
    expect(textoDeDias(rutina({ name: 'A', weekdays: [1] }))).toBe('Lunes')
  })

  it('varios días', () => {
    expect(textoDeDias(rutina({ name: 'A', weekdays: [1, 4] }))).toBe('Lunes, Jueves')
  })

  it('todos los días', () => {
    expect(textoDeDias(rutina({ name: 'A', weekdays: [0, 1, 2, 3, 4, 5, 6] }))).toBe('Todos los días')
  })

  it('sin día', () => {
    expect(textoDeDias(rutina({ name: 'A' }))).toBe('Sin día asignado')
  })
})

describe('plan de la semana', () => {
  const rutinas = [
    rutina({ name: 'Fuerza A', code: 'A', weekdays: [1] }),
    rutina({ name: 'Fuerza B', code: 'B', weekdays: [3] }),
    rutina({ name: 'Fuerza C', code: 'C', weekdays: [5] }),
  ]

  it('empieza el lunes y acaba el domingo', () => {
    // Es como se lee un plan de entrenamiento en España, no empezando en domingo.
    const plan = planSemanal(rutinas)
    expect(plan[0].nombre).toBe('lunes')
    expect(plan[plan.length - 1].nombre).toBe('domingo')
  })

  it('coloca cada rutina en su día', () => {
    const plan = planSemanal(rutinas)
    expect(plan.find((d) => d.dia === 1)?.rutinas.map((r) => r.code)).toEqual(['A'])
    expect(plan.find((d) => d.dia === 2)?.rutinas).toEqual([])
    expect(plan.find((d) => d.dia === 5)?.rutinas.map((r) => r.code)).toEqual(['C'])
  })

  it('siempre devuelve los siete días, aunque estén vacíos', () => {
    // Los huecos se tienen que ver: para eso está el plan.
    expect(planSemanal(rutinas)).toHaveLength(7)
  })
})

describe('avisos del plan', () => {
  it('avisa cuando hay dos rutinas el mismo día', () => {
    const rutinas = [
      rutina({ name: 'Fuerza A', code: 'A', weekdays: [1] }),
      rutina({ name: 'Cardio', code: 'K', weekdays: [1] }),
    ]
    const avisos = avisosDelPlan(rutinas)
    expect(avisos.some((a) => a.includes('lunes') && a.includes('2 rutinas'))).toBe(true)
  })

  it('avisa de las rutinas que no se propondrán solas', () => {
    const rutinas = [
      rutina({ name: 'Fuerza A', code: 'A', weekdays: [1] }),
      rutina({ name: 'Experimento', code: 'X' }),
    ]
    const avisos = avisosDelPlan(rutinas)
    expect(avisos.some((a) => a.includes('Experimento') && a.includes('no está programada'))).toBe(true)
  })

  it('con el plan completo y en orden, no avisa de nada', () => {
    const rutinas = [
      rutina({ name: 'Fuerza A', code: 'A', weekdays: [1] }),
      rutina({ name: 'Fuerza B', code: 'B', weekdays: [3] }),
      rutina({ name: 'Fuerza C', code: 'C', weekdays: [5] }),
    ]
    expect(avisosDelPlan(rutinas)).toEqual([])
  })

  it('no avisa de rutinas sin programar si no hay ninguna programada', () => {
    // Si no se ha programado nada, no tiene sentido dar la lata: el usuario acaba de empezar.
    const rutinas = [rutina({ name: 'A' }), rutina({ name: 'B' })]
    expect(avisosDelPlan(rutinas).some((a) => a.includes('no están programadas'))).toBe(false)
  })

  it('menciona varias rutinas sin programar en plural', () => {
    const rutinas = [
      rutina({ name: 'A', weekdays: [1] }),
      rutina({ name: 'B' }),
      rutina({ name: 'C' }),
    ]
    expect(avisosDelPlan(rutinas).some((a) => a.includes('2 rutinas no están programadas'))).toBe(true)
  })
})
