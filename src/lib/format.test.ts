import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  estimated1RM,
  exerciseSummary,
  formatClock,
  formatDuration,
  formatNumber,
  groupByExercise,
  paceMinPerKm,
  parseDecimalInput,
  parseDurationInput,
  prettyDate,
  roundToIncrement,
  setVolume,
  speedKmh,
  suggestNextWeight,
  todayISO,
  totalVolume,
} from './format'

describe('fechas', () => {
  it('usa fecha local, no UTC', () => {
    // 23:30 hora local del 23 de junio no debe convertirse en el 24.
    expect(todayISO(new Date(2026, 5, 23, 23, 30))).toBe('2026-06-23')
  })

  it('formatea fechas largas', () => {
    expect(prettyDate('2026-06-23')).toBe('23 jun 2026')
    expect(prettyDate('2026-01-01')).toBe('1 ene 2026')
  })

  it('suma dias cruzando meses y anios', () => {
    expect(addDaysISO('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('duraciones', () => {
  it('formatea duraciones legibles', () => {
    expect(formatDuration(5032)).toBe('1h 23m 52s')
    expect(formatDuration(510)).toBe('8m 30s')
    expect(formatDuration(45)).toBe('45s')
  })

  it('formatea el cronometro', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(90)).toBe('01:30')
    expect(formatClock(605)).toBe('10:05')
  })

  it('entiende lo que escribe una persona', () => {
    expect(parseDurationInput('45')).toBe(2700) // minutos sueltos
    expect(parseDurationInput('1:23:32')).toBe(5012)
    expect(parseDurationInput('23:32')).toBe(1412) // mm:ss
    expect(parseDurationInput('1h23m')).toBe(4980)
    expect(parseDurationInput('8m 30s')).toBe(510)
    expect(parseDurationInput('45s')).toBe(45)
    expect(parseDurationInput('')).toBeNull()
    expect(parseDurationInput('mañana')).toBeNull()
  })
})

describe('numeros con coma decimal', () => {
  it('lee decimales al estilo espanol', () => {
    expect(parseDecimalInput('52,5')).toBe(52.5)
    expect(parseDecimalInput('52.5')).toBe(52.5)
    expect(parseDecimalInput('60')).toBe(60)
    expect(parseDecimalInput('')).toBeNull()
    expect(parseDecimalInput('mucho')).toBeNull()
  })

  it('escribe sin ceros sobrantes', () => {
    expect(formatNumber(52.5)).toBe('52,5')
    expect(formatNumber(60)).toBe('60')
    expect(formatNumber(17.25)).toBe('17,25')
  })
})

describe('ritmo y velocidad', () => {
  it('calcula el ritmo en min/km', () => {
    // 8,02 km en 1h23m32s -> ~10:25 min/km (dato real del diario)
    expect(paceMinPerKm(8.02, 5012)).toBe('10:25 min/km')
    expect(paceMinPerKm(10, 3000)).toBe('5:00 min/km')
  })

  it('evita dividir por cero', () => {
    expect(paceMinPerKm(0, 3000)).toBeNull()
    expect(paceMinPerKm(8, 0)).toBeNull()
    expect(paceMinPerKm(undefined, 3000)).toBeNull()
  })

  it('calcula la velocidad media de la bici', () => {
    expect(speedKmh(42, 7200)).toBeCloseTo(21, 5)
    expect(speedKmh(0, 7200)).toBeNull()
  })
})

describe('volumen y 1RM', () => {
  it('calcula volumen por serie', () => {
    expect(setVolume(45, 12)).toBe(540)
    expect(setVolume(0, 20)).toBe(0)
  })

  it('excluye aproximacion del volumen por defecto', () => {
    const sets = [
      { weight: 20, reps: 10, isWarmup: true },
      { weight: 45, reps: 12, isWarmup: false },
      { weight: 45, reps: 10, isWarmup: false },
    ]
    expect(totalVolume(sets)).toBe(45 * 12 + 45 * 10)
    expect(totalVolume(sets, true)).toBe(45 * 12 + 45 * 10 + 200)
  })

  it('estima 1RM con Epley', () => {
    expect(estimated1RM(45, 1)).toBe(45)
    expect(estimated1RM(45, 10)).toBeCloseTo(60, 5)
    expect(estimated1RM(0, 10)).toBe(0)
  })
})

describe('redondeo de discos', () => {
  it('redondea al incremento disponible', () => {
    expect(roundToIncrement(51.2, 2.5)).toBe(50)
    expect(roundToIncrement(52.6, 2.5)).toBe(52.5)
    expect(roundToIncrement(51, 0)).toBe(51)
  })
})

describe('sugerencia de progresion', () => {
  it('propone subir cuando se completa el tope de reps', () => {
    const sets = [
      { weight: 45, reps: 12 },
      { weight: 45, reps: 12 },
      { weight: 45, reps: 12 },
    ]
    const s = suggestNextWeight(sets, 12, 2.5)
    expect(s?.weight).toBe(47.5)
    expect(s?.reason).toContain('3 series')
  })

  it('concuerda en singular con una sola serie', () => {
    const s = suggestNextWeight([{ weight: 65, reps: 10 }], 10, 2.5)
    expect(s?.weight).toBe(67.5)
    expect(s?.reason).toContain('1 serie ')
    expect(s?.reason).not.toContain('1 series')
  })

  it('mantiene el peso si aun no se llega al tope', () => {
    const sets = [
      { weight: 45, reps: 12 },
      { weight: 45, reps: 8 },
      { weight: 45, reps: 7 },
    ]
    const s = suggestNextWeight(sets, 12, 2.5)
    expect(s?.weight).toBe(45)
  })

  it('ignora las series de aproximacion', () => {
    const sets = [
      { weight: 60, reps: 12, isWarmup: true },
      { weight: 45, reps: 12 },
      { weight: 45, reps: 12 },
    ]
    expect(suggestNextWeight(sets, 12, 2.5)?.weight).toBe(47.5)
  })

  it('devuelve null sin historico', () => {
    expect(suggestNextWeight([], 12, 2.5)).toBeNull()
  })
})

describe('agrupacion y resumenes', () => {
  it('agrupa series por ejercicio conservando el orden', () => {
    const sets = [
      { exerciseId: 'b', exerciseName: 'Press banca' },
      { exerciseId: 'a', exerciseName: 'Back squat' },
      { exerciseId: 'b', exerciseName: 'Press banca' },
    ]
    const grouped = groupByExercise(sets)
    expect(grouped.map((g) => g.exerciseId)).toEqual(['b', 'a'])
    expect(grouped[0].items).toHaveLength(2)
  })

  it('resume un ejercicio al estilo del vault', () => {
    const sets = [
      { weight: 45, reps: 12 },
      { weight: 45, reps: 12 },
      { weight: 45, reps: 12 },
      { weight: 40, reps: 10 },
    ]
    expect(exerciseSummary(sets)).toBe('3×12×45kg + 1×10×40kg')
  })

  it('marca el peso corporal', () => {
    expect(exerciseSummary([{ weight: 0, reps: 16 }])).toBe('1×16 (PC)')
  })

  it('devuelve guion sin series', () => {
    expect(exerciseSummary([])).toBe('—')
  })
})
