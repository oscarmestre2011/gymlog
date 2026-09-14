import type { ReactNode } from 'react'

/** Hoja inferior reutilizable. Se cierra tocando fuera o con el boton de cerrar. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="row between" style={{ marginBottom: 12 }}>
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="small muted">{subtitle}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
        {actions ? (
          <div className="row" style={{ marginTop: 16, gap: 10 }}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Confirmacion destructiva, para no borrar nada por un toque accidental. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Borrar',
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn ghost grow" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn danger grow" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="small muted" style={{ margin: 0 }}>
        {message}
      </p>
    </Modal>
  )
}
