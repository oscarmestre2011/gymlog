import { formatClock } from '../lib/format'

/**
 * Barra del cronometro de descanso. Se queda visible mientras se navega,
 * porque en el gimnasio uno mira el movil justo entre series.
 *
 * Aviso al terminar: en Android suena y vibra, pero Safari (iPhone) no permite
 * ninguna de las dos cosas. Por eso, al acabar, la barra cambia de color, se
 * anima y escribe "¡Descanso terminado!" en grande: quien mira el movil se entera
 * igual, sin depender del sonido.
 */
export function RestBar({
  remaining,
  total,
  avisoSonando = false,
  onAdd,
  onStop,
}: {
  remaining: number
  total: number
  /** El aviso esta sonando ahora: la barra lo refleja. */
  avisoSonando?: boolean
  onAdd: (seconds: number) => void
  onStop: () => void
}) {
  const done = remaining === 0
  const progress = total > 0 ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 100

  return (
    <div
      className={`rest-bar${done ? ' done' : ''}${avisoSonando ? ' sonando' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="clock">{done ? '¡Ya!' : formatClock(remaining)}</div>
      <div className="rest-info">
        {done ? <div className="rest-done-text">¡Descanso terminado!</div> : null}
        <div className="rest-progress">
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>
      <button className="btn sm" onClick={() => onAdd(30)} aria-label="Añadir 30 segundos">
        +30s
      </button>
      <button className="icon-btn" onClick={onStop} aria-label="Parar cronómetro">
        ✕
      </button>
    </div>
  )
}
