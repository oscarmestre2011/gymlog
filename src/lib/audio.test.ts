/**
 * Pruebas del aviso sonoro del descanso.
 *
 * Importa comprobarlo aqui porque no se puede "oir" en una prueba automatica: se simula el
 * contexto de audio y se cuenta cuantos pitidos programa y con que forma de onda. El aviso
 * largo es una peticion expresa del usuario, asi que conviene que no se acorte sin querer.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  duracionDelAviso,
  patronDeVibracion,
  sonarAviso,
  type ContextoAudio,
} from './audio'

/** Contexto de audio simulado: apunta lo que se le pide. */
function contextoFalso(estado = 'running') {
  const pitidos: { tono: number; tipo: string; inicio: number }[] = []
  let reanudado = 0

  const contexto: ContextoAudio = {
    state: estado,
    currentTime: 100, // tiempo de referencia: los pitidos se programan a partir de aqui
    destination: { nombre: 'salida' },
    resume: async () => {
      reanudado += 1
      contexto.state = 'running'
    },
    createOscillator: () => {
      const registro = { tono: 0, tipo: '', inicio: 0 }
      return {
        set type(valor: string) {
          registro.tipo = valor
        },
        get type() {
          return registro.tipo
        },
        frequency: {
          set value(v: number) {
            registro.tono = v
          },
          get value() {
            return registro.tono
          },
        },
        connect: () => undefined,
        start: (cuando?: number) => {
          registro.inicio = cuando ?? 0
          pitidos.push({ ...registro })
        },
        stop: () => undefined,
      }
    },
    createGain: () => ({
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: () => undefined,
    }),
  }

  return { contexto, pitidos, reanudado: () => reanudado }
}

describe('aviso sonoro del descanso', () => {
  it('un aviso corto son tres pitidos; uno largo, mas', async () => {
    const corto = contextoFalso()
    const nCorto = await sonarAviso('corto', corto.contexto)
    expect(nCorto).toBe(3)

    const largo = contextoFalso()
    const nLargo = await sonarAviso('largo', largo.contexto)
    expect(nLargo).toBe(6)
    expect(nLargo).toBeGreaterThan(nCorto)

    const muyLargo = contextoFalso()
    expect(await sonarAviso('muy-largo', muyLargo.contexto)).toBe(10)
  })

  it('el aviso largo dura mas que el corto, en tiempo real', () => {
    expect(duracionDelAviso('largo')).toBeGreaterThan(duracionDelAviso('corto'))
    expect(duracionDelAviso('muy-largo')).toBeGreaterThan(duracionDelAviso('largo'))
    // El aviso largo debe oirse varios segundos, no medio segundo.
    expect(duracionDelAviso('largo')).toBeGreaterThan(1200)
  })

  it('usa una onda penetrante, que se oiga por encima de la musica', async () => {
    const { contexto, pitidos } = contextoFalso()
    await sonarAviso('largo', contexto)
    expect(pitidos.every((p) => p.tipo === 'square')).toBe(true)
  })

  it('separa los pitidos en el tiempo, no los amontona', async () => {
    const { contexto, pitidos } = contextoFalso()
    await sonarAviso('largo', contexto)
    const tiempos = pitidos.map((p) => p.inicio)
    // El primero empieza en el instante actual y cada uno va despues del anterior.
    expect(tiempos[0]).toBeCloseTo(100, 5)
    for (let i = 1; i < tiempos.length; i += 1) {
      expect(tiempos[i]).toBeGreaterThan(tiempos[i - 1])
    }
    // La separacion es de 260 ms entre pitidos.
    expect(tiempos[1] - tiempos[0]).toBeCloseTo(0.26, 3)
  })

  it('reanuda el audio si estaba suspendido (el caso del movil)', async () => {
    const { contexto, reanudado, pitidos } = contextoFalso('suspended')
    await sonarAviso('largo', contexto)
    expect(reanudado()).toBeGreaterThan(0)
    expect(pitidos.length).toBeGreaterThan(0)
  })

  it('no falla si el navegador no tiene audio (iPhone en algunos casos)', async () => {
    // Sin contexto disponible, devuelve 0 pitidos en lugar de lanzar un error.
    expect(await sonarAviso('largo', null)).toBe(0)
  })

  it('no falla si el audio da error al sonar', async () => {
    const { contexto } = contextoFalso()
    contexto.createOscillator = () => {
      throw new Error('audio bloqueado por el navegador')
    }
    expect(await sonarAviso('largo', contexto)).toBe(0)
  })

  it('la vibracion acompania al aviso, con un golpe por pitido', () => {
    expect(patronDeVibracion('corto').length).toBe(3 * 2)
    expect(patronDeVibracion('largo').length).toBe(6 * 2)
    expect(patronDeVibracion('largo').length).toBeGreaterThan(patronDeVibracion('corto').length)
  })

  it('un valor raro no rompe nada: se usa el largo', async () => {
    const { contexto, pitidos } = contextoFalso()
    const n = await sonarAviso('inventado' as never, contexto)
    expect(n).toBe(6)
    expect(pitidos.length).toBe(6)
  })
})

describe('desbloqueo del audio', () => {
  it('no se puede desbloquear si el navegador no lo ofrece', async () => {
    const original = (globalThis as { window?: unknown }).window
    vi.resetModules()
    // En el entorno de pruebas no hay window.AudioContext, asi que debe devolver null.
    const modulo = await import('./audio')
    expect(modulo.audioDisponible()).toBe(false)
    expect(await modulo.desbloquearAudio()).toBeNull()
    void original
    vi.resetModules()
  })
})
