import { useState } from 'react'
import { diasDesdeLaUltima, tocaMedirse } from '../lib/medidas'
import type { BodyMeasurement } from '../types'

/**
 * Aviso de que toca medirse.
 *
 * El usuario se mide cada dos semanas (esta en su vault y lo cuenta en el podcast: "una vez al
 * mes, con cinta metrica"). Es facil dejarlo pasar, y sin medidas no hay forma de saber si el
 * plan funciona: la bascula a corto plazo engana, la cintura no.
 */
export function MeasurementReminder({
  mediciones,
  onVer,
}: {
  mediciones: BodyMeasurement[]
  onVer: () => void
}) {
  const [descartado, setDescartado] = useState(false)
  if (descartado) return null
  if (!tocaMedirse(mediciones)) return null

  const dias = diasDesdeLaUltima(mediciones)

  return (
    <div className="card reminder">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div className="grow">
          <div style={{ fontWeight: 700 }}>📏 Toca medirse</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {dias === null
              ? 'Con la cinta métrica: peso y cintura bastan para seguir la evolución.'
              : `Hace ${dias} días de la última medición. Peso y cintura, en ayunas y a la misma hora.`}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setDescartado(true)} aria-label="Recordármelo luego">
          ✕
        </button>
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={onVer}>
        Apuntar medidas
      </button>
    </div>
  )
}
