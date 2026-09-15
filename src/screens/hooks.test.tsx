/**
 * Prueba de que las pantallas se dibujan sin romper las REGLAS DE LOS HOOKS.
 *
 * POR QUE EXISTE ESTA PRUEBA
 * --------------------------
 * Un `useMemo` colocado DESPUES de un `return` temprano rompe la pantalla entera: en el primer
 * render (sin datos) hay menos hooks que en el siguiente (con datos), React lo detecta y lanza el
 * error 310. Paso de verdad al anadir los calculos de equilibrio muscular a Progresion: en cuanto
 * se apuntaba una sesion y se abria esa pestana, la pantalla se caia completa con el cartel de
 * "algo ha ido mal".
 *
 * Se detecto con una prueba en navegador, pero esta prueba lo pilla antes y mas barato: dibuja la
 * pantalla primero SIN datos y despues CON datos. Si algun hook esta despues de un return, el
 * segundo render falla.
 *
 * Ojo: no se puede usar el ErrorBoundary para esto, porque se comeria el error y la prueba pasaria.
 * Por eso se dibuja la pantalla directamente y se deja que el error suba.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { ProgressScreen } from './ProgressScreen'
import { SettingsScreen } from './SettingsScreen'
import { DEFAULT_SETTINGS } from '../types'

/** Simula una base de datos con datos, que es lo que dispara el segundo render. */
vi.mock('../db/repository', async (importOriginal) => {
  const real = await importOriginal<typeof import('../db/repository')>()
  return {
    ...real,
    // Los listados son consultas de verdad: se sustituyen por respuestas controladas.
    listTrainedExercises: vi.fn(async () => [{ id: 'sentadilla', name: 'Back squat', sets: 3 }]),
    getExerciseHistory: vi.fn(async () => [
      {
        sessionId: 's1',
        date: '2026-09-10',
        sets: [],
        workingSets: [],
        topWeight: 60,
        best1RM: 80,
        volume: 1800,
      },
    ]),
    getPersonalRecords: vi.fn(async () => []),
    getWeeklyVolume: vi.fn(async () => [{ weekStart: '2026-09-07', volume: 1800, sets: 3 }]),
    getDatosDeAnalisis: vi.fn(async () => ({
      sessions: [
        {
          id: 's1',
          date: '2026-09-10',
          routineName: 'Fuerza A',
          routineSnapshot: [],
          startedAt: 0,
          endedAt: 0,
          metrics: {},
        },
      ],
      sets: [
        {
          id: 'x1',
          sessionId: 's1',
          exerciseId: 'sentadilla',
          exerciseName: 'Back squat',
          order: 0,
          setNumber: 1,
          weight: 60,
          reps: 10,
          isWarmup: false,
          completedAt: 0,
        },
      ],
      exercises: [
        { id: 'sentadilla', name: 'Back squat', group: 'Cuadriceps', equipment: 'Barra', side: 'bilateral', increment: 2.5, createdAt: 0 },
      ],
      cardio: [],
    })),
    listMeasurements: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({ ...DEFAULT_SETTINGS })),
  }
})

describe('las pantallas se dibujan sin romper las reglas de los hooks', () => {
  const erroresOriginales = console.error

  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = erroresOriginales
    cleanup()
  })

  it('Progresión: primero sin datos y luego con datos', async () => {
    /*
     * Este es el caso que fallaba: la pantalla tiene un return temprano para el estado "no hay
     * series" y otro para la carga. Los calculos tienen que estar ANTES de los dos.
     *
     * El primer render se queda vacio a proposito (esta cargando), asi que no se comprueba su
     * contenido: lo que importa es que el SEGUNDO render, ya con datos, no rompa.
     */
    const { container } = render(<ProgressScreen />)

    // Se espera a que lleguen los datos: aqui es donde saltaba el error 310.
    await waitFor(() => {
      expect(container.textContent).toMatch(/grupo muscular|Historial|Volumen/i)
    })

    // Y ningun error de hooks en consola.
    const llamadas = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const errorDeHooks = llamadas.find((c) => String(c[0]).includes('310') || /hooks/i.test(String(c[0])))
    expect(errorDeHooks ?? null).toBeNull()
  })

  it('Ajustes se dibuja entera, con las copias unificadas', async () => {
    const { container } = render(
      <SettingsScreen
        settings={{ ...DEFAULT_SETTINGS }}
        onSave={vi.fn(async () => undefined)}
        notify={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(container.textContent).toMatch(/Copia de seguridad/i)
    })
    // Un solo apartado de copias: si vuelve el suelto, se ve aqui.
    const titulos = [...container.querySelectorAll('.card-title')].map((t) => t.textContent ?? '')
    const deCopias = titulos.filter((t) => /copia|copias/i.test(t))
    expect(deCopias).toHaveLength(1)
  })
})
