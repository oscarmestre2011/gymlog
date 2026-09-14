/**
 * Simbolo de Kairós.
 *
 * Sigue el brief de identidad del podcast que esta en el vault: marco circular (la
 * rueda del tiempo), una barra vertical (el hierro y el eje del tiempo), la omega
 * griega en lugar de la O. Paleta: carbon #1A1A1A, oro #C9A84C, terracota #C85A3E
 * y blanco calido #F5F0E8.
 *
 * Sin detalle fino: tiene que leerse a 26 px en la cabecera. El meandro griego del
 * brief se probo y quedaba tapado por el marco, asi que se deja fuera.
 *
 * Este dibujo y public/icon.svg deben coincidir: si se cambia uno, cambiar el otro.
 */
export function KairosMark({
  size = 40,
  conFondo = true,
  titulo = 'Kairós',
}: {
  size?: number
  /** Con el fondo carbon redondeado, como el icono de la app. */
  conFondo?: boolean
  titulo?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={titulo}
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {conFondo ? <rect width="512" height="512" rx="112" fill="#1A1A1A" /> : null}
      <g fill="none" strokeLinecap="round">
        <circle cx="256" cy="256" r="168" stroke="#F5F0E8" strokeWidth="10" opacity="0.92" />
        <line x1="256" y1="140" x2="256" y2="372" stroke="#C85A3E" strokeWidth="23" />
        <line x1="196" y1="180" x2="316" y2="180" stroke="#C9A84C" strokeWidth="23" />
        <line x1="196" y1="332" x2="316" y2="332" stroke="#C9A84C" strokeWidth="23" />
        <path
          d="M206 214 h33 a52 52 0 0 0 34 88 a52 52 0 0 0 34 -88 h33"
          stroke="#F5F0E8"
          strokeWidth="19"
        />
      </g>
    </svg>
  )
}
