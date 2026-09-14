import { useRef } from 'react'
import { formatNumber } from '../lib/format'

/**
 * Campo numerico pensado para el gimnasio:
 * - teclado decimal en movil
 * - selecciona el texto al enfocar, para escribir encima sin borrar
 * - acepta coma o punto
 */
export function NumberInput({
  value,
  onChange,
  onCommit,
  placeholder,
  ariaLabel,
  integer = false,
  light = false,
}: {
  value: number | '' | undefined
  onChange: (value: number | undefined) => void
  /** Se llama al salir del campo o al pulsar Enter: aqui se guarda el cambio. */
  onCommit?: () => void
  placeholder?: string
  ariaLabel: string
  /** Solo enteros (repeticiones, RIR). */
  integer?: boolean
  /** Estilo compacto para las filas de series. */
  light?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  const shown =
    value === '' || value === undefined || Number.isNaN(value)
      ? ''
      : integer
        ? String(value)
        : String(value).replace('.', ',')

  return (
    <input
      ref={ref}
      className={`input${light ? '' : ''} num`}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      enterKeyHint="done"
      autoComplete="off"
      value={shown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => onCommit?.()}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.').trim()
        if (raw === '') {
          onChange(undefined)
          return
        }
        const parsed = Number(raw)
        if (Number.isNaN(parsed)) return
        onChange(integer ? Math.round(parsed) : parsed)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** Texto de ayuda para los objetivos de una serie: "4 × 8-10". */
export function targetLabel(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`
}

/** "4 × 8-10 · descanso 2:00". */
export function targetSummary(targetSets: number, min: number, max: number, restSeconds: number): string {
  const rest = restSeconds >= 60 ? `${Math.round(restSeconds / 60)} min` : `${restSeconds} s`
  return `${targetSets} × ${targetLabel(min, max)} reps · descanso ${rest}`
}

/** Peso en kg listo para mostrar, o "PC" si es peso corporal. */
export function weightLabel(weight: number): string {
  return weight <= 0 ? 'PC' : `${formatNumber(weight)} kg`
}
