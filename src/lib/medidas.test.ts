/**
 * Pruebas de las medidas corporales.
 *
 * Se usan los datos REALES del vault (Medidas corporales.md) como casos de prueba: peso,
 * abdomen, pecho y muslo, con su altura de 174 cm. Asi las pruebas comprueban lo que de
 * verdad va a ver el usuario, no numeros inventados.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { BodyMeasurement } from '../types'
import {
  cinturaAltura,
  clasificacionImc,
  diasDesdeLaUltima,
  diferencia,
  imc,
  riesgoAbdominal,
  riesgoCinturaAltura,
  resumenDe,
  serieDe,
  tocaMedirse,
  ultimaConDato,
} from './medidas'

/** Altura del usuario, en cm. */
const ALTURA = 174

function medida(date: string, datos: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return { id: date, date, createdAt: Date.now(), ...datos }
}

describe('indice de masa corporal', () => {
  it('calcula el IMC con los datos reales', () => {
    // 79,2 kg y 174 cm (medicion del 28 de agosto)
    const valor = imc(79.2, ALTURA)
    expect(valor).toBeCloseTo(26.16, 1)
    expect(clasificacionImc(valor)).toBe('sobrepeso')
  })

  it('con 82 kg daba sobrepeso mas marcado', () => {
    const valor = imc(82, ALTURA)
    expect(valor).toBeCloseTo(27.08, 1)
    expect(clasificacionImc(valor)).toBe('sobrepeso')
  })

  it('clasifica correctamente los rangos', () => {
    expect(clasificacionImc(17)).toBe('bajo peso')
    expect(clasificacionImc(22)).toBe('normopeso')
    expect(clasificacionImc(24.9)).toBe('normopeso')
    expect(clasificacionImc(25)).toBe('sobrepeso')
    expect(clasificacionImc(31)).toBe('obesidad')
    expect(clasificacionImc(null)).toBe('—')
  })

  it('no calcula nada si faltan datos', () => {
    expect(imc(undefined, ALTURA)).toBeNull()
    expect(imc(80, undefined)).toBeNull()
    expect(imc(0, ALTURA)).toBeNull()
  })
})

describe('relacion cintura/altura', () => {
  it('con 97 cm de abdomen da 0,56 (el valor que el sigue en su vault)', () => {
    const valor = cinturaAltura({ abdomenCm: 97 }, ALTURA)
    expect(valor).toBeCloseTo(0.557, 2)
    expect(riesgoCinturaAltura(valor)?.nivel).toBe('atencion')
  })

  it('prefiere la cintura si esta medida', () => {
    expect(cinturaAltura({ abdomenCm: 97, waistCm: 88 }, ALTURA)).toBeCloseTo(0.506, 2)
  })

  it('avisa cuando entra en rango sano', () => {
    // Su meta del vault es bajar la cintura a 95-96 cm: con 174 cm sigue por encima de 0,5.
    expect(riesgoCinturaAltura(cinturaAltura({ abdomenCm: 95 }, ALTURA))?.nivel).toBe('atencion')
    // Por debajo de 0,5 ya es sano.
    expect(riesgoCinturaAltura(cinturaAltura({ abdomenCm: 86 }, ALTURA))?.nivel).toBe('sano')
    expect(riesgoCinturaAltura(0.62)?.nivel).toBe('alto')
    expect(riesgoCinturaAltura(null)).toBeNull()
  })
})

describe('riesgo del perimetro abdominal', () => {
  it('usa los umbrales de 94 y 102 cm', () => {
    expect(riesgoAbdominal(90)?.nivel).toBe('sano')
    expect(riesgoAbdominal(94)?.nivel).toBe('atencion')
    expect(riesgoAbdominal(97)?.nivel).toBe('atencion')
    expect(riesgoAbdominal(102)?.nivel).toBe('muy-alto')
    expect(riesgoAbdominal(undefined)).toBeNull()
  })
})

describe('evolucion de cada dato', () => {
  // Registro real: 15 y 19 y 28 de agosto, y 31 de agosto.
  const mediciones = [
    medida('2026-08-15', { weightKg: 81, abdomenCm: 100.5, notes: 'Inicio registro' }),
    medida('2026-08-19', { weightKg: 82, abdomenCm: 97, chestCm: 103, thighCm: 58 }),
    medida('2026-08-28', { weightKg: 79.2, abdomenCm: 97, chestCm: 98, thighCm: 58 }),
    medida('2026-08-31', { weightKg: 79.6 }),
  ]

  it('encuentra la ultima medicion de cada dato, aunque falte en las recientes', () => {
    // El 31 de agosto solo hay peso: el abdomen sigue siendo el del 28.
    expect(ultimaConDato(mediciones, 'weightKg')?.date).toBe('2026-08-31')
    expect(ultimaConDato(mediciones, 'abdomenCm')?.date).toBe('2026-08-28')
    expect(ultimaConDato(mediciones, 'chestCm')?.date).toBe('2026-08-28')
  })

  it('resume cuanto ha cambiado desde el principio', () => {
    const peso = resumenDe(mediciones, 'weightKg')
    expect(peso.primera?.date).toBe('2026-08-15')
    expect(peso.ultima?.date).toBe('2026-08-31')
    // De 81 a 79,6: ha bajado 1,4 kg.
    expect(peso.cambio).toBeCloseTo(-1.4, 2)

    const abdomen = resumenDe(mediciones, 'abdomenCm')
    // De 100,5 a 97: ha bajado 3,5 cm.
    expect(abdomen.cambio).toBeCloseTo(-3.5, 2)

    // El muslo no cambia.
    expect(resumenDe(mediciones, 'thighCm').cambio).toBe(0)
  })

  it('no se inventa resumenes si no hay datos de ese campo', () => {
    const resumen = resumenDe([medida('2026-08-31', { weightKg: 79.6 })], 'thighCm')
    expect(resumen.ultima).toBeNull()
    expect(resumen.cambio).toBeNull()
  })

  it('da la serie ordenada por fecha para dibujar la evolucion', () => {
    const serie = serieDe(mediciones, 'weightKg')
    expect(serie.map((p) => p.date)).toEqual(['2026-08-15', '2026-08-19', '2026-08-28', '2026-08-31'])
    expect(serie[0].valor).toBe(81)
    expect(serie[3].valor).toBe(79.6)
  })

  it('calcula diferencias sin decimales raros', () => {
    // Orden: (valor anterior, valor nuevo). Positivo = ha subido.
    expect(diferencia(100.5, 97)).toBe(-3.5)
    expect(diferencia(79.2, 81)).toBe(1.8)
    expect(diferencia(58, 58)).toBe(0)
    expect(diferencia(undefined, 58)).toBeNull()
    expect(diferencia(58, undefined)).toBeNull()
  })
})

describe('cada cuanto toca medirse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no avisa si no hay ninguna medicion', () => {
    expect(diasDesdeLaUltima([])).toBeNull()
    expect(tocaMedirse([])).toBe(false)
  })

  it('no avisa si se midio hace pocos dias', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T10:00:00'))
    expect(diasDesdeLaUltima([medida('2026-09-10', { weightKg: 79 })] )).toBe(5)
    expect(tocaMedirse([medida('2026-09-10', { weightKg: 79 })])).toBe(false)
  })

  it('avisa a partir de los 14 dias, que es su ritmo quincenal', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T10:00:00'))
    expect(diasDesdeLaUltima([medida('2026-09-01', { weightKg: 79 })])).toBe(14)
    expect(tocaMedirse([medida('2026-09-01', { weightKg: 79 })])).toBe(true)
    // Una semana mas tarde, tambien.
    expect(tocaMedirse([medida('2026-08-28', { weightKg: 79.2 })])).toBe(true)
  })

  it('un dia antes del limite no avisa todavia', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T10:00:00'))
    expect(tocaMedirse([medida('2026-09-02', { weightKg: 79 })])).toBe(false)
  })
})
