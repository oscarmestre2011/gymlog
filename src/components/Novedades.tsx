import { VERSIONES, etiquetaDeTipo, iconoDeTipo, type VersionApp } from '../lib/changelog'

/**
 * Novedades de las ultimas versiones.
 *
 * Se abre desde el aviso de "hay una version nueva" (para saber que ha cambiado antes de
 * actualizar) y desde Ajustes (historial completo). Los datos salen de `lib/changelog.ts`, que
 * es la unica fuente, y de ahi se genera tambien el CHANGELOG.md del repositorio.
 */
export function Novedades({
  /** Cuantas versiones mostrar. Sin valor, todas (el historial completo). */
  cuantas,
  /** Version que se quiere destacar como "esta es la nueva". */
  destacar,
  onCerrar,
}: {
  cuantas?: number
  destacar?: string
  onCerrar?: () => void
}) {
  const versiones: VersionApp[] = cuantas ? VERSIONES.slice(0, cuantas) : VERSIONES

  return (
    <div className="screen">
      <div className="card">
        <div className="row between" style={{ alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <div className="grow">
            <h2 className="card-title" style={{ margin: 0 }}>
              Novedades
            </h2>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              {cuantas
                ? 'Lo que ha cambiado en las últimas actualizaciones.'
                : `Historial completo: ${VERSIONES.length} versiones desde el principio.`}
            </p>
          </div>
          {onCerrar ? (
            <button className="icon-btn" onClick={onCerrar} aria-label="Cerrar">
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {versiones.map((v) => (
        <div key={v.version} className="card">
          <div className="row between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700 }}>
              {v.titulo}
              {destacar === v.version ? <span className="badge gold" style={{ marginLeft: 8 }}>Nueva</span> : null}
            </div>
            <span className="tiny muted">
              {v.version} · {fechaCorta(v.fecha)}
            </span>
          </div>
          <ul className="cambios">
            {v.cambios.map((c, i) => (
              <li key={`${v.version}-${i}`} className={`cambio ${c.tipo}`}>
                <span className="marca" aria-hidden="true">
                  {iconoDeTipo(c.tipo)}
                </span>
                <span className="grow">
                  <span className={`etiqueta ${c.tipo}`}>{etiquetaDeTipo(c.tipo)}</span> {c.texto}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        Actualizar la app <b>no toca tus datos</b>: entrenamientos, rutinas y medidas se quedan como están.
      </p>
    </div>
  )
}

/** Fecha en formato corto español: 16 sep 2026. */
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  if (!y || !m || !d) return iso
  return `${d} ${meses[m - 1]} ${y}`
}
