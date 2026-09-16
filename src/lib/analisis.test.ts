/**
 * Pruebas del analisis del entrenamiento: equilibrio muscular, mejora por serie y vista con cardio.
 *
 * Se usan datos parecidos a los reales del usuario (rutina A/B/C con grupos musculares, series de
 * 65 kg y 10 reps, salidas en bici) para que las pruebas comprueben numeros que va a ver de verdad.
 */
import { describe, expect, it } from 'vitest'
import type { CardioEntry, Exercise, ExerciseSet, MuscleGroup, Session } from '../types'
import {
  compararSerie,
  desequilibrio,
  diasConActividad,
  rachaDeSemanas,
  resumenConstancia,
  resumenDeLaSemana,
  semanaCompleta,
  volumenPorGrupo,
  volumenSemanalPorGrupo,
} from './analisis'

/* ------------------------------- utilidades ------------------------------- */

function ejercicio(id: string, name: string, group: MuscleGroup): Exercise {
  return { id, name, group, equipment: 'Barra', side: 'bilateral', increment: 2.5, createdAt: 0 }
}

function sesion(id: string, date: string, routineName = 'Fuerza A'): Session {
  return {
    id,
    date,
    routineName,
    routineSnapshot: [],
    startedAt: 0,
    endedAt: 0,
    metrics: {},
  } as Session
}

function serie(
  sessionId: string,
  exerciseId: string,
  exerciseName: string,
  opciones: Partial<ExerciseSet> = {},
): ExerciseSet {
  return {
    id: `${sessionId}-${exerciseId}-${opciones.setNumber ?? 1}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    exerciseId,
    exerciseName,
    order: 0,
    setNumber: 1,
    weight: 65,
    reps: 10,
    isWarmup: false,
    completedAt: 0,
    ...opciones,
  }
}

function cardio(id: string, date: string, opciones: Partial<CardioEntry> = {}): CardioEntry {
  return {
    id,
    activity: 'Bici',
    date,
    durationMin: 40,
    distanceKm: 15,
    createdAt: 0,
    ...opciones,
  }
}

const EJERCICIOS = [
  ejercicio('sentadilla', 'Back squat', 'Cuadriceps'),
  ejercicio('banca', 'Press banca', 'Pecho'),
  ejercicio('remo', 'Remo con barra', 'Espalda'),
]

/* --------------------------- volumen por grupo --------------------------- */

describe('volumen por grupo muscular', () => {
  const sesiones = [sesion('s1', '2026-09-07'), sesion('s2', '2026-09-09')]
  const series = [
    ...Array.from({ length: 4 }, (_, i) => serie('s1', 'sentadilla', 'Back squat', { setNumber: i + 1 })),
    ...Array.from({ length: 2 }, (_, i) => serie('s2', 'sentadilla', 'Back squat', { setNumber: i + 1 })),
    ...Array.from({ length: 3 }, (_, i) => serie('s1', 'banca', 'Press banca', { setNumber: i + 1 })),
    serie('s1', 'remo', 'Remo con barra', { setNumber: 1, isWarmup: true }),
  ]

  it('cuenta las series de cada grupo', () => {
    const porGrupo = volumenPorGrupo(series, sesiones, EJERCICIOS)
    expect(porGrupo.find((g) => g.grupo === 'Cuadriceps')?.series).toBe(6)
    expect(porGrupo.find((g) => g.grupo === 'Pecho')?.series).toBe(3)
  })

  it('las series de aproximación NO cuentan', () => {
    // El unico ejercicio de espalda tiene solo una serie de aproximacion: no debe aparecer.
    const porGrupo = volumenPorGrupo(series, sesiones, EJERCICIOS)
    expect(porGrupo.find((g) => g.grupo === 'Espalda')).toBeUndefined()
  })

  it('calcula el volumen en kilos', () => {
    const porGrupo = volumenPorGrupo(series, sesiones, EJERCICIOS)
    // 6 series x 65 kg x 10 reps
    expect(porGrupo.find((g) => g.grupo === 'Cuadriceps')?.volumen).toBe(3900)
  })

  it('ordena de más a menos series, que es lo que interesa ver', () => {
    const porGrupo = volumenPorGrupo(series, sesiones, EJERCICIOS)
    expect(porGrupo[0].grupo).toBe('Cuadriceps')
    expect(porGrupo[0].series).toBeGreaterThanOrEqual(porGrupo[1].series)
  })

  it('los ejercicios sin grupo conocido van a "Otro", no se pierden', () => {
    const raras = [serie('s1', 'inventado', 'Ejercicio borrado')]
    const porGrupo = volumenPorGrupo(raras, sesiones, EJERCICIOS)
    expect(porGrupo).toHaveLength(1)
    expect(porGrupo[0].grupo).toBe('Otro')
    expect(porGrupo[0].series).toBe(1)
  })

  it('encuentra el grupo por nombre si el ejercicio ya no existe', () => {
    // Series antiguas de un ejercicio borrado: se busca por nombre.
    const huerfanas = [serie('s1', 'id-viejo', 'Back squat')]
    expect(volumenPorGrupo(huerfanas, sesiones, EJERCICIOS)[0].grupo).toBe('Cuadriceps')
  })

  it('ignora series de sesiones borradas', () => {
    const sueltas = [serie('sesion-que-no-existe', 'sentadilla', 'Back squat')]
    expect(volumenPorGrupo(sueltas, sesiones, EJERCICIOS)).toEqual([])
  })
})

describe('series por grupo y semana', () => {
  const sesiones = [
    sesion('s1', '2026-09-07'), // lunes
    sesion('s2', '2026-09-14'), // lunes siguiente
  ]
  const series = [
    ...Array.from({ length: 3 }, (_, i) => serie('s1', 'sentadilla', 'Back squat', { setNumber: i + 1 })),
    ...Array.from({ length: 5 }, (_, i) => serie('s2', 'sentadilla', 'Back squat', { setNumber: i + 1 })),
    ...Array.from({ length: 2 }, (_, i) => serie('s1', 'banca', 'Press banca', { setNumber: i + 1 })),
  ]

  it('agrupa las series por semana ISO', () => {
    const tabla = volumenSemanalPorGrupo(series, sesiones, EJERCICIOS)
    expect(tabla.semanas).toEqual(['2026-09-07', '2026-09-14'])
    const cuadriceps = tabla.grupos.find((g) => g.grupo === 'Cuadriceps')
    expect(cuadriceps?.porSemana['2026-09-07']).toBe(3)
    expect(cuadriceps?.porSemana['2026-09-14']).toBe(5)
    expect(cuadriceps?.total).toBe(8)
  })

  it('las semanas sin ese grupo aparecen a cero, no se saltan', () => {
    // Asi se ve de un vistazo que esa semana no se entreno ese grupo.
    const tabla = volumenSemanalPorGrupo(series, sesiones, EJERCICIOS)
    const pecho = tabla.grupos.find((g) => g.grupo === 'Pecho')
    expect(pecho?.porSemana['2026-09-14']).toBe(0)
  })

  it('ordena los grupos por total', () => {
    const tabla = volumenSemanalPorGrupo(series, sesiones, EJERCICIOS)
    expect(tabla.grupos[0].grupo).toBe('Cuadriceps')
  })

  it('limita a las últimas semanas que se pidan', () => {
    const tabla = volumenSemanalPorGrupo(series, sesiones, EJERCICIOS, 1)
    expect(tabla.semanas).toHaveLength(1)
    expect(tabla.semanas[0]).toBe('2026-09-14')
  })
})

describe('aviso de desequilibrio', () => {
  it('avisa cuando un grupo dobla a otro', () => {
    const porGrupo = [
      { grupo: 'Espalda', series: 24, volumen: 1000 },
      { grupo: 'Pecho', series: 12, volumen: 500 },
      { grupo: 'Femoral', series: 6, volumen: 300 },
    ]
    const aviso = desequilibrio(porGrupo)
    expect(aviso?.grupoBajo).toBe('Femoral')
    expect(aviso?.grupoAlto).toBe('Espalda')
  })

  it('no avisa si los grupos están equilibrados', () => {
    const porGrupo = [
      { grupo: 'Espalda', series: 14, volumen: 1000 },
      { grupo: 'Pecho', series: 12, volumen: 900 },
      { grupo: 'Femoral', series: 10, volumen: 700 },
    ]
    expect(desequilibrio(porGrupo)).toBeNull()
  })

  it('no avisa con pocos datos: con dos sesiones cualquier diferencia parece enorme', () => {
    const porGrupo = [
      { grupo: 'Espalda', series: 3, volumen: 300 },
      { grupo: 'Pecho', series: 1, volumen: 100 },
    ]
    expect(desequilibrio(porGrupo)).toBeNull()
  })

  it('no avisa si hay muy pocos grupos', () => {
    expect(desequilibrio([
      { grupo: 'Espalda', series: 30, volumen: 2000 },
      { grupo: 'Pecho', series: 5, volumen: 400 },
    ])).toBeNull()
  })

  it('con el minimo de series justo, ya avisa', () => {
    const porGrupo = [
      { grupo: 'Espalda', series: 16, volumen: 1000 },
      { grupo: 'Pecho', series: 10, volumen: 700 },
      { grupo: 'Femoral', series: 7, volumen: 400 },
    ]
    expect(desequilibrio(porGrupo, 12)).not.toBeNull()
  })
})

/* ---------------------------- mejora por serie ---------------------------- */

describe('comparar una serie con la última vez', () => {
  const anteriores = [
    serie('s0', 'sentadilla', 'Back squat', { setNumber: 1, weight: 60, reps: 10 }),
    serie('s0', 'sentadilla', 'Back squat', { setNumber: 2, weight: 60, reps: 10 }),
  ]

  it('detecta cuando se sube el peso', () => {
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 1, weight: 62.5, reps: 10 })
    const resultado = compararSerie(actual, anteriores)
    expect(resultado.senal).toBe('mejor')
    expect(resultado.texto).toContain('+2,5 kg')
  })

  it('detecta cuando se bajan las repeticiones', () => {
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 1, weight: 60, reps: 8 })
    const resultado = compararSerie(actual, anteriores)
    expect(resultado.senal).toBe('peor')
    expect(resultado.texto).toContain('-2')
  })

  it('con el mismo peso y más repeticiones, es mejor', () => {
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 1, weight: 60, reps: 12 })
    const resultado = compararSerie(actual, anteriores)
    expect(resultado.senal).toBe('mejor')
    expect(resultado.texto).toContain('+2 reps')
  })

  it('igual no es malo: mantener es progresar', () => {
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 1, weight: 60, reps: 10 })
    expect(compararSerie(actual, anteriores).senal).toBe('igual')
  })

  it('compara serie con serie, no con el total', () => {
    // La serie 2 se compara con la serie 2 anterior, no con la primera.
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 2, weight: 62.5, reps: 10 })
    expect(compararSerie(actual, anteriores).senal).toBe('mejor')
  })

  it('si la última vez hubo menos series, no inventa comparación', () => {
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 4, weight: 70, reps: 10 })
    const resultado = compararSerie(actual, anteriores)
    expect(resultado.senal).toBe('sin-referencia')
    expect(resultado.texto).toBe('')
  })

  it('sin entrenamiento anterior no hay nada que comparar', () => {
    expect(compararSerie(serie('s1', 'x', 'X'), []).senal).toBe('sin-referencia')
  })

  it('no tiene en cuenta las series de aproximación al comparar', () => {
    const conCalentamiento = [
      serie('s0', 'sentadilla', 'Back squat', { setNumber: 1, weight: 40, reps: 10, isWarmup: true }),
      serie('s0', 'sentadilla', 'Back squat', { setNumber: 1, weight: 60, reps: 10 }),
    ]
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 1, weight: 60, reps: 10 })
    // Se compara con la de trabajo (60), no con la de calentamiento: sale "igual".
    expect(compararSerie(actual, conCalentamiento).senal).toBe('igual')
  })

  it('devuelve la serie de referencia, para poder mostrarla', () => {
    const actual = serie('s1', 'sentadilla', 'Back squat', { setNumber: 1, weight: 70, reps: 8 })
    expect(compararSerie(actual, anteriores).referencia?.weight).toBe(60)
  })
})

/* -------------------------- fuerza y cardio juntos ------------------------ */

describe('semana completa: fuerza y cardio', () => {
  const sesiones = [sesion('s1', '2026-09-07'), sesion('s2', '2026-09-09'), sesion('s3', '2026-09-14')]
  const series = [
    ...Array.from({ length: 4 }, (_, i) => serie('s1', 'sentadilla', 'Back squat', { setNumber: i + 1 })),
    ...Array.from({ length: 3 }, (_, i) => serie('s2', 'banca', 'Press banca', { setNumber: i + 1 })),
    serie('s3', 'sentadilla', 'Back squat'),
  ]
  const cardioSemana = [cardio('c1', '2026-09-08'), cardio('c2', '2026-09-10', { durationMin: 30, distanceKm: 10 })]

  it('junta fuerza y cardio en la misma semana', () => {
    const tabla = semanaCompleta(sesiones, series, cardioSemana)
    const primera = tabla.find((s) => s.weekStart === '2026-09-07')
    expect(primera?.series).toBe(7)
    expect(primera?.sesiones).toBe(2)
    expect(primera?.cardioMin).toBe(70)
    expect(primera?.cardioKm).toBe(25)
    expect(primera?.cardioVeces).toBe(2)
  })

  it('cuenta bien las semanas de solo fuerza o solo cardio', () => {
    const tabla = semanaCompleta(sesiones, series, cardioSemana)
    const segunda = tabla.find((s) => s.weekStart === '2026-09-14')
    expect(segunda?.cardioMin).toBe(0) // solo fuerza
    const soloCardio = semanaCompleta([], [], [cardio('c3', '2026-09-21')])
    expect(soloCardio[0].series).toBe(0)
    expect(soloCardio[0].cardioMin).toBe(40)
  })

  it('no cuenta las series de aproximación en el volumen', () => {
    const conCalentamiento = [serie('s1', 'sentadilla', 'Back squat', { isWarmup: true })]
    const tabla = semanaCompleta(sesiones, conCalentamiento, [])
    expect(tabla[0].series).toBe(0)
  })

  it('devuelve las semanas ordenadas', () => {
    const tabla = semanaCompleta(sesiones, series, cardioSemana)
    const lunes = tabla.map((s) => s.weekStart)
    expect([...lunes].sort()).toEqual(lunes)
  })
})

describe('días con actividad', () => {
  const sesiones = [sesion('s1', '2026-09-07', 'Fuerza A'), sesion('s2', '2026-09-09', 'Fuerza B')]
  const entradas = [cardio('c1', '2026-09-07'), cardio('c2', '2026-09-11', { activity: 'Carrera', distanceKm: 5, durationMin: 30 })]

  it('junta fuerza y cardio del mismo día', () => {
    const dias = diasConActividad(sesiones, entradas)
    const dia7 = dias.find((d) => d.date === '2026-09-07')
    expect(dia7?.fuerza).toBe(true)
    expect(dia7?.cardio).toBe(true)
    expect(dia7?.detalle).toContain('Fuerza A')
    expect(dia7?.detalle).toContain('Bici')
  })

  it('separa los días de solo fuerza o solo cardio', () => {
    const dias = diasConActividad(sesiones, entradas)
    const dia9 = dias.find((d) => d.date === '2026-09-09')
    expect(dia9?.fuerza).toBe(true)
    expect(dia9?.cardio).toBe(false)
    const dia11 = dias.find((d) => d.date === '2026-09-11')
    expect(dia11?.cardio).toBe(true)
    expect(dia11?.fuerza).toBe(false)
  })

  it('ordena del más reciente al más antiguo', () => {
    const dias = diasConActividad(sesiones, entradas)
    expect(dias[0].date).toBe('2026-09-11')
  })

  it('usa los minutos cuando el cardio no tiene distancia', () => {
    const sinDistancia = [cardio('c3', '2026-09-12', { durationMin: 45, distanceKm: undefined })]
    expect(diasConActividad([], sinDistancia)[0].detalle).toContain('45 min')
  })

  it('resume la constancia de las últimas semanas', () => {
    const hoy = new Date()
    const iso = (dias: number) => {
      const f = new Date(hoy)
      f.setDate(f.getDate() - dias)
      return f.toISOString().slice(0, 10)
    }
    const recientes = [
      { date: iso(1), fuerza: true, cardio: false, detalle: '' },
      { date: iso(2), fuerza: false, cardio: true, detalle: '' },
      { date: iso(3), fuerza: true, cardio: true, detalle: '' },
      { date: iso(40), fuerza: true, cardio: false, detalle: '' }, // fuera de las 4 semanas
    ]
    const resumen = resumenConstancia(recientes)
    expect(resumen.diasActivos).toBe(3)
    expect(resumen.soloFuerza).toBe(1)
    expect(resumen.soloCardio).toBe(1)
    expect(resumen.ambos).toBe(1)
  })
})

describe('resumen de la semana en curso', () => {
  /*
   * Es lo que el usuario quiere ver al abrir la app: como va ESTA semana (dias entrenados, kilos
   * levantados y kilometros), no los totales de siempre.
   */
  const hoy = new Date(2026, 8, 16) // miercoles 16 de septiembre de 2026

  it('cuenta los dias entrenados y las sesiones de esta semana', () => {
    const sesiones = [
      sesion('s1', '2026-09-14'), // lunes de esta semana
      sesion('s2', '2026-09-16'), // miercoles
      sesion('s3', '2026-09-16'), // segundo entrenamiento del miercoles
      sesion('s4', '2026-09-13'), // domingo de la semana ANTERIOR
    ]
    const resumen = resumenDeLaSemana(sesiones, [], [], hoy)
    expect(resumen.diasEntrenados).toBe(2) // lunes y miercoles
    expect(resumen.sesiones).toBe(3) // tres entrenamientos
  })

  it('suma el volumen de la semana, sin contar aproximaciones', () => {
    const sesiones = [sesion('s1', '2026-09-14'), sesion('s2', '2026-09-16')]
    const series = [
      serie('s1', 'sentadilla', 'Back squat', { weight: 60, reps: 10 }),
      serie('s1', 'sentadilla', 'Back squat', { weight: 60, reps: 10, setNumber: 2 }),
      serie('s2', 'banca', 'Press banca', { weight: 40, reps: 10 }),
      serie('s2', 'banca', 'Press banca', { weight: 80, reps: 10, isWarmup: true }),
      // De la semana pasada: no cuenta.
      serie('s3', 'sentadilla', 'Back squat', { weight: 100, reps: 10 }),
    ]
    const resumen = resumenDeLaSemana(sesiones, series, [], hoy)
    expect(resumen.volumen).toBe(1600) // 600 + 600 + 400
    expect(resumen.series).toBe(3)
  })

  it('suma los kilometros de cardio de la semana', () => {
    const entradas = [
      cardio('c1', '2026-09-15', { distanceKm: 20, durationMin: 50 }),
      cardio('c2', '2026-09-16', { distanceKm: 12.5, durationMin: 30 }),
      cardio('c3', '2026-09-13', { distanceKm: 30, durationMin: 60 }), // semana pasada
    ]
    const resumen = resumenDeLaSemana([], [], entradas, hoy)
    expect(resumen.cardioKm).toBe(32.5)
    expect(resumen.cardioMin).toBe(80)
  })

  it('con la semana vacia, todo a cero', () => {
    const resumen = resumenDeLaSemana([], [], [], hoy)
    expect(resumen).toMatchObject({ diasEntrenados: 0, volumen: 0, cardioKm: 0, rachaSemanas: 0 })
  })

  it('la semana empieza el lunes', () => {
    // El domingo 13 pertenece a la semana anterior, no a la del 14.
    const domingoAnterior = [sesion('s1', '2026-09-13')]
    expect(resumenDeLaSemana(domingoAnterior, [], [], hoy).diasEntrenados).toBe(0)
    const lunes = [sesion('s1', '2026-09-14')]
    expect(resumenDeLaSemana(lunes, [], [], hoy).diasEntrenados).toBe(1)
  })
})

describe('racha de semanas seguidas', () => {
  const hoy = new Date(2026, 8, 16) // miercoles

  it('cuenta las semanas seguidas con entrenamiento', () => {
    const sesiones = [
      sesion('s1', '2026-09-15'), // esta semana
      sesion('s2', '2026-09-08'), // anterior
      sesion('s3', '2026-09-01'), // dos atras
      sesion('s4', '2026-08-18'), // hace un mes: rompe la racha
    ]
    expect(rachaDeSemanas(sesiones, hoy)).toBe(3)
  })

  it('si esta semana aun no se ha entrenado, la racha no se ha roto', () => {
    // La semana en curso no ha terminado: se cuenta desde la anterior.
    const sesiones = [sesion('s1', '2026-09-09'), sesion('s2', '2026-09-02')]
    expect(rachaDeSemanas(sesiones, hoy)).toBe(2)
  })

  it('sin entrenamientos no hay racha', () => {
    expect(rachaDeSemanas([], hoy)).toBe(0)
  })

  it('una sola semana cuenta como uno', () => {
    expect(rachaDeSemanas([sesion('s1', '2026-09-15')], hoy)).toBe(1)
  })

  it('un hueco la corta', () => {
    const sesiones = [
      sesion('s1', '2026-09-15'), // esta
      // falta la del 8
      sesion('s3', '2026-09-01'),
      sesion('s4', '2026-08-25'),
    ]
    expect(rachaDeSemanas(sesiones, hoy)).toBe(1)
  })

  it('varias sesiones la misma semana cuentan como una', () => {
    const sesiones = [
      sesion('s1', '2026-09-14'),
      sesion('s2', '2026-09-16'),
      sesion('s3', '2026-09-09'),
    ]
    expect(rachaDeSemanas(sesiones, hoy)).toBe(2)
  })
})
