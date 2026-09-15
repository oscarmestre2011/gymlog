/**
 * Aviso sonoro del fin del descanso, y utilidades de audio de la app.
 *
 * Por que esta separado y con tantos comentarios: el audio en el navegador tiene tres
 * trampas que cuestan tiempo descubrir.
 *
 * 1. El contexto de audio nace SUSPENDIDO hasta que el usuario toca la pantalla. Si se
 *    crea cuando ya ha sonado la alarma (sin interaccion reciente) no suena nada.
 *    Solucion: crearlo y "desbloquearlo" en el primer toque dentro de la app.
 * 2. El movil puede APAGAR la pantalla mientras se descansa. Entonces el navegador
 *    suspende la pagina y los temporizadores no corren: el aviso suena al volver a
 *    encender la pantalla, no antes. Eso NO se puede evitar en una app web; por eso la app
 *    mantiene la pantalla encendida mientras se usa (ver useWakeLock).
 * 3. En Safari de iPhone el audio no siempre esta disponible.
 *
 * El aviso es un pitido repetido, no un tono unico, para que se oiga desde lejos y por
 * encima de la musica del gimnasio.
 */

export type DuracionAviso = 'corto' | 'largo' | 'muy-largo'

const PATRONES: Record<DuracionAviso, { pitidos: number; separacion: number; tono: number }> = {
  corto: { pitidos: 3, separacion: 220, tono: 900 },
  largo: { pitidos: 6, separacion: 260, tono: 950 },
  'muy-largo': { pitidos: 10, separacion: 300, tono: 1000 },
}

/** Tipo minimo del contexto de audio, para poder simularlo en las pruebas. */
export interface ContextoAudio {
  state?: string
  currentTime: number
  destination: unknown
  resume?: () => Promise<void>
  createOscillator: () => {
    type: string
    frequency: { value: number }
    connect: (destino: unknown) => void
    start: (cuando?: number) => void
    stop: (cuando?: number) => void
  }
  createGain: () => {
    gain: {
      setValueAtTime: (valor: number, cuando: number) => void
      exponentialRampToValueAtTime: (valor: number, cuando: number) => void
    }
    connect: (destino: unknown) => void
  }
}

type ConstructorAudio = new () => ContextoAudio

function constructorAudio(): ConstructorAudio | null {
  if (typeof window === 'undefined') return null
  const ventana = window as unknown as {
    AudioContext?: ConstructorAudio
    webkitAudioContext?: ConstructorAudio
  }
  return ventana.AudioContext ?? ventana.webkitAudioContext ?? null
}

/** Hay algun tipo de audio disponible en este navegador. */
export function audioDisponible(): boolean {
  return constructorAudio() !== null
}

/**
 * Desbloquea el audio: crea el contexto y lo deja listo para sonar.
 * Hay que llamarlo desde un toque del usuario (cualquier botón sirve).
 */
export async function desbloquearAudio(): Promise<ContextoAudio | null> {
  const Constructor = constructorAudio()
  if (!Constructor) return null
  try {
    const contexto = new Constructor()
    if (contexto.state === 'suspended') await contexto.resume?.()
    return contexto
  } catch {
    return null
  }
}

/**
 * Hace sonar el aviso. Devuelve cuantos pitidos ha programado (0 si no ha podido sonar),
 * lo que permite comprobarlo en las pruebas sin oir nada.
 *
 * No usa bucles con esperas: programa todos los pitidos en el tiempo del contexto de
 * audio, asi que el navegador los reproduce seguidos incluso si la pagina va justa de
 * recursos.
 */
export async function sonarAviso(
  duracion: DuracionAviso = 'largo',
  contextoExterno?: ContextoAudio | null,
): Promise<number> {
  const patron = PATRONES[duracion] ?? PATRONES.largo
  const contexto = contextoExterno ?? (await desbloquearAudio())
  if (!contexto) return 0

  try {
    if (contexto.state === 'suspended') await contexto.resume?.()
    const inicio = contexto.currentTime
    for (let i = 0; i < patron.pitidos; i += 1) {
      const cuando = inicio + (i * patron.separacion) / 1000
      const oscilador = contexto.createOscillator()
      const ganancia = contexto.createGain()
      oscilador.type = 'square' // mas penetrante que una onda senoidal: se oye desde lejos
      oscilador.frequency.value = patron.tono
      oscilador.connect(ganancia)
      ganancia.connect(contexto.destination)
      ganancia.gain.setValueAtTime(0.0001, cuando)
      ganancia.gain.exponentialRampToValueAtTime(0.35, cuando + 0.02)
      ganancia.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.16)
      oscilador.start(cuando)
      oscilador.stop(cuando + 0.18)
    }
    return patron.pitidos
  } catch {
    return 0
  }
}

/** Cuanto dura el aviso, en milisegundos (para la interfaz). */
export function duracionDelAviso(duracion: DuracionAviso): number {
  const patron = PATRONES[duracion] ?? PATRONES.largo
  return (patron.pitidos - 1) * patron.separacion + 200
}

/** Patron de vibracion (Android; en iPhone no existe). */
export function patronDeVibracion(duracion: DuracionAviso): number[] {
  const patron = PATRONES[duracion] ?? PATRONES.largo
  const golpes: number[] = []
  for (let i = 0; i < patron.pitidos; i += 1) {
    golpes.push(160, 110)
  }
  return golpes
}
