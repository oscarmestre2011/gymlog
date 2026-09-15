/**
 * Pruebas del perfil del deportista.
 *
 * Se usan los datos reales del usuario (174 cm, 78,4 kg el 4 de septiembre, entrenamiento de
 * fuerza 3-5 dias) para que las pruebas comprueben numeros que va a ver de verdad, no inventados.
 */
import { describe, expect, it } from 'vitest'
import {
  FACTORES_ACTIVIDAD,
  edadDesde,
  gastoEnReposo,
  gastoTotal,
  imcPerfil,
  queFalta,
  rangoProteina,
  textoEdad,
  type DatosPerfil,
} from './perfil'

/** Perfil de referencia: el del usuario. */
const PERFIL: DatosPerfil = {
  heightCm: 174,
  birthDate: '1975-06-15',
  sex: 'hombre',
  activity: 'moderado',
}

describe('edad a partir de la fecha de nacimiento', () => {
  it('calcula los años cumplidos', () => {
    expect(edadDesde('1975-06-15', new Date('2026-09-16T10:00:00'))).toBe(51)
  })

  it('el día del cumpleaños ya cuenta', () => {
    expect(edadDesde('1975-06-15', new Date('2026-06-15T10:00:00'))).toBe(51)
  })

  it('el día antes del cumpleaños todavía no', () => {
    expect(edadDesde('1975-06-15', new Date('2026-06-14T10:00:00'))).toBe(50)
  })

  it('el año del cumpleaños tampoco', () => {
    // Diciembre de 2026, cumpleaños en junio: ya los ha cumplido.
    expect(edadDesde('1975-06-15', new Date('2026-12-31T10:00:00'))).toBe(51)
    // Enero de 2027, cumpleaños en junio: aun no.
    expect(edadDesde('1975-06-15', new Date('2027-01-01T10:00:00'))).toBe(51)
  })

  it('sin fecha no inventa nada', () => {
    expect(edadDesde(undefined)).toBeNull()
    expect(edadDesde('')).toBeNull()
    expect(edadDesde('no es una fecha')).toBeNull()
  })

  it('rechaza fechas imposibles', () => {
    // Una fecha en el futuro daria una edad negativa.
    expect(edadDesde('2030-01-01', new Date('2026-09-16T10:00:00'))).toBeNull()
  })

  it('lo escribe en texto', () => {
    expect(textoEdad(51)).toBe('51 años')
    expect(textoEdad(1)).toBe('1 año')
    expect(textoEdad(null)).toBe('sin fecha de nacimiento')
  })
})

describe('gasto energético en reposo', () => {
  it('con los datos completos usa Mifflin-St Jeor', () => {
    // 10 x 78,4 + 6,25 x 174 - 5 x 51 + 5 = 1621,5 -> 1622 kcal
    const reposo = gastoEnReposo(PERFIL, 78.4, 51)
    expect(reposo).toBe(1622)
  })

  it('en mujer cambia el ajuste final', () => {
    const hombre = gastoEnReposo(PERFIL, 78.4, 51)
    const mujer = gastoEnReposo({ ...PERFIL, sex: 'mujer' }, 78.4, 51)
    // La diferencia entre las dos formulas es de 166 kcal.
    expect((hombre ?? 0) - (mujer ?? 0)).toBe(166)
  })

  it('con porcentaje de grasa usa Katch-McArdle, que es más exacta', () => {
    // 78,4 kg con 22% de grasa -> masa magra 61,152 kg -> 370 + 21,6 x 61,152 = 1690,9 -> 1691
    const reposo = gastoEnReposo({ ...PERFIL, bodyFatPercent: 22 }, 78.4, 51)
    expect(reposo).toBe(1691)
  })

  it('sin peso no calcula nada', () => {
    expect(gastoEnReposo(PERFIL, undefined, 51)).toBeNull()
    expect(gastoEnReposo(PERFIL, 0, 51)).toBeNull()
  })

  it('sin edad, sin sexo o sin altura, y sin grasa, no calcula nada', () => {
    // Mejor no dar un numero que darlo mal.
    expect(gastoEnReposo({ heightCm: 174, sex: 'hombre' }, 78.4, null)).toBeNull()
    expect(gastoEnReposo({ heightCm: 174 }, 78.4, 51)).toBeNull()
    expect(gastoEnReposo({ sex: 'hombre' }, 78.4, 51)).toBeNull()
  })

  it('un porcentaje de grasa absurdo se ignora y se usa la otra fórmula', () => {
    const raro = gastoEnReposo({ ...PERFIL, bodyFatPercent: 95 }, 78.4, 51)
    expect(raro).toBe(1622) // la de Mifflin-St Jeor
  })
})

describe('gasto total del día', () => {
  it('multiplica por el factor de actividad', () => {
    expect(gastoTotal(1622, 'moderado')).toBe(Math.round(1622 * 1.55))
    expect(gastoTotal(1622, 'sedentario')).toBe(Math.round(1622 * 1.2))
  })

  it('los niveles están ordenados de menos a más', () => {
    const factores = ['sedentario', 'ligero', 'moderado', 'alto', 'muy-alto'] as const
    for (let i = 1; i < factores.length; i += 1) {
      expect(FACTORES_ACTIVIDAD[factores[i]].factor).toBeGreaterThan(FACTORES_ACTIVIDAD[factores[i - 1]].factor)
    }
  })

  it('sin gasto en reposo no calcula nada', () => {
    expect(gastoTotal(null, 'moderado')).toBeNull()
  })

  it('cada nivel tiene su explicación', () => {
    for (const nivel of Object.values(FACTORES_ACTIVIDAD)) {
      expect(nivel.texto.length).toBeGreaterThan(10)
    }
  })
})

describe('proteína al día', () => {
  it('da un rango de 1,6 a 2,2 g por kilo', () => {
    expect(rangoProteina(78.4)).toEqual({ min: 125, max: 172 })
  })

  it('sin peso no calcula nada', () => {
    expect(rangoProteina(undefined)).toBeNull()
  })
})

describe('IMC del perfil', () => {
  it('lo calcula con el peso más reciente', () => {
    expect(imcPerfil(78.4, 174)).toBeCloseTo(25.9, 1)
  })

  it('sin altura no lo inventa', () => {
    expect(imcPerfil(78.4, undefined)).toBeNull()
  })
})

describe('qué falta para poder calcular', () => {
  it('no falta nada con el perfil completo', () => {
    expect(queFalta(PERFIL, true)).toEqual([])
  })

  it('dice exactamente qué falta', () => {
    const faltan = queFalta({}, false)
    expect(faltan.join(', ')).toContain('la altura')
    expect(faltan.join(', ')).toContain('la fecha de nacimiento')
    expect(faltan.join(', ')).toContain('el sexo')
    expect(faltan.join(', ')).toContain('el peso')
  })

  it('sin peso, lo dice aunque el resto esté completo', () => {
    expect(queFalta(PERFIL, false)).toEqual(['el peso (se coge de las medidas corporales)'])
  })
})
