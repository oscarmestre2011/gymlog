import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Red de seguridad para la interfaz.
 *
 * Sin esto, cualquier error inesperado al dibujar una pantalla deja la app en
 * blanco o en negro, sin ninguna pista y sin forma de salir. Con esto, el usuario
 * ve que algo ha fallado y puede recargar o resetear.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Se deja constancia en la consola del navegador para poder diagnosticar.
    console.error('GymLog: error de interfaz', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="screen" style={{ justifyContent: 'center', minHeight: '70dvh' }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Algo ha ido mal</h2>
          <p className="small muted">
            La app ha fallado al dibujar la pantalla. <b>Tus entrenamientos no se han tocado</b>: están
            guardados en el móvil.
          </p>
          <div className="notice warn small" style={{ marginBottom: 12, wordBreak: 'break-word' }}>
            {error.message || String(error)}
          </div>
          <button className="btn primary block lg" onClick={() => window.location.reload()}>
            Recargar la app
          </button>
          <button
            className="btn block"
            style={{ marginTop: 8 }}
            onClick={() => this.setState({ error: null })}
          >
            Reintentar sin recargar
          </button>
        </div>
      </div>
    )
  }
}
