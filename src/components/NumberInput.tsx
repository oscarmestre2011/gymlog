import { useEffect, useRef, useState } from 'react'
import { formatNumber } from '../lib/format'

/**
 * Campo numerico pensado para el gimnasio y para escribir con el pulgar.
 *
 * Reglas (aprendidas de un fallo real):
 * - Mientras se escribe, el campo conserva LO QUE SE HA TECLEADO. Antes se
 *   convertia a numero en cada pulsacion, y al teclear la coma el valor "42," se
 *   convertia en 42 y la coma desaparecia: era imposible escribir "42,27" o
 *   "52,5", porque salia "4227" y "525".
 * - La conversion a numero se hace para avisar al formulario, y el ajuste final
 *   (redondeo en los campos enteros) se aplica al salir del campo o al pulsar
 *   Enter, nunca mientras se escribe.
 * - Acepta coma y punto: en el teclado español la coma es lo natural.
 * - Al enfocar se selecciona el texto, para escribir encima sin borrar.
 */
export function NumberInput({
  value,
  onChange,
  onCommit,
  placeholder,
  ariaLabel,
  integer = false,
}: {
  value: number | '' | undefined
  onChange: (value: number | undefined) => void
  /** Se llama al salir del campo o al pulsar Enter, con el valor ya ajustado. */
  onCommit?: (value: number | undefined) => void
  placeholder?: string
  ariaLabel: string
  /** Solo numeros enteros (repeticiones, RIR, desnivel, frecuencia cardiaca). */
  integer?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [borrador, setBorrador] = useState<string | null>(null)
  const [enfocado, setEnfocado] = useState(false)

  // Si el valor cambia desde fuera y el campo no se esta editando, se refleja.
  useEffect(() => {
    if (!enfocado) setBorrador(null)
  }, [value, enfocado])

  const valorMostrado =
    borrador !== null
      ? borrador
      : value === undefined || value === '' || Number.isNaN(Number(value))
        ? ''
        : integer
          ? String(value)
          : formatNumber(Number(value))

  /** Convierte el texto tecleado a numero. Acepta coma y punto. */
  const analizar = (texto: string): number | undefined => {
    const limpio = texto.replace(/\s/g, '').replace(',', '.')
    if (limpio === '' || limpio === '.') return undefined
    const numero = Number(limpio)
    if (Number.isNaN(numero) || numero < 0) return undefined
    return integer ? Math.round(numero) : numero
  }

  const finalizar = () => {
    setEnfocado(false)
    const numero = analizar(borrador ?? valorMostrado)
    // Aqui si se ajusta: los campos enteros se redondean al salir.
    const ajustado = numero === undefined ? undefined : integer ? Math.round(numero) : numero
    if (ajustado !== undefined) onChange(ajustado)
    else onChange(undefined)
    setBorrador(null)
    onCommit?.(ajustado)
  }

  return (
    <input
      ref={ref}
      className="input num"
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      enterKeyHint="done"
      autoComplete="off"
      value={valorMostrado}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setEnfocado(true)
        e.currentTarget.select()
      }}
      onBlur={finalizar}
      onChange={(e) => {
        const texto = e.target.value
        // Se conserva lo tecleado, sin reformatear, mientras se escribe.
        setBorrador(texto)
        onChange(analizar(texto))
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
