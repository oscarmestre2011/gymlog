/**
 * Prueba de la red de seguridad de la interfaz.
 *
 * Motivo: si una pantalla falla al dibujarse y no hay red de seguridad, la app se
 * queda vacia (fondo oscuro y nada mas). El usuario no sabe que ha pasado ni que
 * hacer. Aqui se comprueba que se muestra un aviso y que se puede salir.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Explosion(): JSX.Element {
  throw new Error('fallo simulado al dibujar')
}

describe('red de seguridad de la interfaz', () => {
  const erroresOriginales = console.error

  beforeEach(() => {
    // React y el propio limite escriben el error en consola: se silencia aqui.
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = erroresOriginales
    cleanup()
  })

  it('muestra los hijos cuando todo va bien', () => {
    render(
      <ErrorBoundary>
        <p>contenido normal</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('contenido normal')).toBeTruthy()
  })

  it('no deja la pantalla vacia cuando una pantalla falla', () => {
    render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>,
    )
    // Lo esencial: hay algo visible, no una pantalla en blanco.
    expect(screen.getByText('Algo ha ido mal')).toBeTruthy()
    expect(screen.getByText(/La app ha fallado al dibujar/)).toBeTruthy()
  })

  it('enseña el motivo del fallo, para poder diagnosticarlo', () => {
    render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>,
    )
    expect(screen.getByText('fallo simulado al dibujar')).toBeTruthy()
  })

  it('tranquiliza sobre los datos guardados', () => {
    render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/no se han tocado/)).toBeTruthy()
  })

  it('ofrece recargar y reintentar', () => {
    render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Recargar la app')).toBeTruthy()
    expect(screen.getByText('Reintentar sin recargar')).toBeTruthy()
  })
})
