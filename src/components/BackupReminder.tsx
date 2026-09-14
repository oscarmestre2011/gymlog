import { useEffect, useState } from 'react'
import type { Settings } from '../types'
import { estadoDeCopia, mensajeDeCopia } from '../lib/backup'

/** Clave donde se recuerda que el aviso se descarto, para no repetirlo cada vez. */
const CLAVE_DESCARTADO = 'gymlog.avisoCopiaDescartado'

/**
 * Aviso de que toca hacer copia de seguridad.
 *
 * Existe porque los datos viven SOLO en el movil: si se borran los datos del navegador
 * (la casilla "Cookies y datos de sitios") o se cambia de telefono, sin copia no hay nada
 * que hacer. Recuerda y no molesta: se puede descartar, y si se descarta no vuelve en
 * unas horas, solo en una sesion posterior.
 */
export function BackupReminder({
  settings,
  hayDatos,
  onDescargar,
}: {
  settings: Settings
  hayDatos: boolean
  onDescargar: () => Promise<void> | void
}) {
  const [descartado, setDescartado] = useState(true)
  const [descargando, setDescargando] = useState(false)

  useEffect(() => {
    try {
      setDescartado(localStorage.getItem(CLAVE_DESCARTADO) === 'si')
    } catch {
      setDescartado(false)
    }
  }, [])

  const estado = estadoDeCopia(settings, hayDatos)
  if (estado.tipo === 'oculto' || descartado) return null

  const { titulo, detalle } = mensajeDeCopia(estado)

  const descartar = () => {
    setDescartado(true)
    try {
      localStorage.setItem(CLAVE_DESCARTADO, 'si')
    } catch {
      /* si no se puede guardar, el aviso volvera a salir: no es grave */
    }
  }

  return (
    <div className="card reminder">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div className="grow">
          <div style={{ fontWeight: 700 }}>💾 {titulo}</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {detalle}
          </div>
        </div>
        <button className="icon-btn" onClick={descartar} aria-label="Recordármelo luego">
          ✕
        </button>
      </div>
      <button
        className="btn primary block"
        style={{ marginTop: 12 }}
        disabled={descargando}
        onClick={async () => {
          setDescargando(true)
          try {
            await onDescargar()
            descartar()
          } finally {
            setDescargando(false)
          }
        }}
      >
        ⬇ Descargar copia ahora
      </button>
    </div>
  )
}
