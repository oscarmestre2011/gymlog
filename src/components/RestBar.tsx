import { formatClock } from '../lib/format'

/**
 * Barra del cronometro de descanso. Se queda visible mientras se navega,
 * porque en el gimnasio uno mira el movil justo entre series.
 */
export function RestBar({
  remaining,
  total,
  onAdd,
  onStop,
}: {
  remaining: number
  total: number
  onAdd: (seconds: number) => void
  onStop: () => void
}) {
  const done = remaining === 0
  const progress = total > 0 ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 100

  return (
    <div className={`rest-bar${done ? ' done' : ''}`}>
      <div className="clock">{done ? '¡Ya!' : formatClock(remaining)}</div>
      <div className="rest-progress">
        <div style={{ width: `${progress}%` }} />
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
