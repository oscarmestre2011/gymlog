/**
 * Emblema de Kairós (el corredor dentro del anillo, sin el texto).
 *
 * Es una imagen y no un dibujo vectorial porque el logo real es una ilustración
 * (figura griega, meandro, corredor): reproducirla a mano en SVG daria un resultado
 * peor. El recorte lo genera scripts/make-icons.mjs a partir de public/logo-kairos.png,
 * midiendo donde acaba el emblema y donde empieza el texto "KAIROS" para no colarlo.
 *
 * Tamaños disponibles:
 *   /logo-mark.png         192 px (48 KB) — para cabecera y listas
 *   /logo-mark-grande.png  512 px (334 KB) — para la bienvenida, ocupando mas
 */
export function KairosMark({
  size = 40,
  titulo = 'Kairós',
  grande = false,
}: {
  size?: number
  titulo?: string
  /** Usa la version de 512 px, para cuando el emblema se ve grande. */
  grande?: boolean
}) {
  return (
    <img
      src={grande ? './logo-mark-grande.png' : './logo-mark.png'}
      width={size}
      height={size}
      alt={titulo}
      style={{ display: 'block', flex: '0 0 auto', objectFit: 'contain' }}
    />
  )
}
