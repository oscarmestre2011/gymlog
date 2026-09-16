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
  onCompartir,
}: {
  settings: Settings
  hayDatos: boolean
  onDescargar: () => Promise<void> | void
  /**
   * Compartir la copia (WhatsApp, correo, Drive). Es la forma de que el archivo SALGA del movil,
   * que es lo unico que protege de perderlo. Si no se pasa, solo se ofrece descargar.
   */
  onCompartir?: () => Promise<void> | void
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
    <div className="card reminder reminder-copia">
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
      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        {onCompartir ? (
          <button
            className="btn primary grow"
            disabled={descargando}
            onClick={async () => {
              setDescargando(true)
              try {
                await onCompartir()
                descartar()
              } finally {
                setDescargando(false)
              }
            }}
          >
            ↗ Compartir copia
          </button>
        ) : null}
        <button
          className={`btn${onCompartir ? '' : ' primary'} ${onCompartir ? 'grow' : 'block'}`}
          style={onCompartir ? undefined : { marginTop: 12 }}
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
          ⬇ Descargar
        </button>
      </div>
    </div>
  )
}
