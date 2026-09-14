import { db } from '../db'

/**
 * Pantalla de arranque fallido.
 *
 * Existe porque el peor fallo posible es quedarse mirando una pantalla oscura sin
 * explicacion: la app abre la base de datos local al arrancar y, si esa operacion
 * se queda colgada (movil con el almacenamiento lleno, base de datos danada,
 * navegador que bloquea el almacenamiento), antes se quedaba esperando para
 * siempre. Ahora se detecta y se ofrece salida.
 */
export function StartupError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="screen" style={{ justifyContent: 'center', minHeight: '70dvh' }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>La app no ha podido arrancar</h2>
        <p className="small muted">
          No ha respondido el almacenamiento del móvil, donde se guardan tus entrenamientos. Suele
          arreglarse recargando. Si se repite, prueba lo de abajo.
        </p>
        <div className="notice warn small" style={{ marginBottom: 12, wordBreak: 'break-word' }}>
          {message}
        </div>

        <button className="btn primary block lg" onClick={onRetry}>
          Reintentar
        </button>

        <p className="tiny muted" style={{ marginTop: 16, marginBottom: 6 }}>
          Si sigue igual, cierra la app del todo (quítala de las apps recientes) y vuelve a abrirla.
          Con eso suele bastar, porque el almacenamiento se desbloquea.
        </p>

        <details>
          <summary className="small" style={{ cursor: 'pointer', padding: '6px 0' }}>
            Opciones avanzadas
          </summary>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Comprobar el almacenamiento <b>no borra tus entrenamientos</b>. Solo borra la copia en
            caché de la app (los ficheros), no los datos.
          </p>
          <button
            className="btn block"
            onClick={async () => {
              try {
                const claves = await caches.keys()
                for (const clave of claves) await caches.delete(clave)
              } catch {
                /* sin cache que borrar */
              }
              window.location.reload()
            }}
          >
            Limpiar la caché de la app y recargar
          </button>
          <button
            className="btn block danger"
            style={{ marginTop: 8 }}
            onClick={async () => {
              const confirmado = window.confirm(
                'Esto SÍ borra todos tus entrenamientos guardados en este móvil. ¿Seguro?',
              )
              if (!confirmado) return
              try {
                await db.delete()
              } catch {
                /* se intenta igualmente recargar */
              }
              window.location.reload()
            }}
          >
            Borrar los datos y empezar de cero
          </button>
        </details>
      </div>
    </div>
  )
}
