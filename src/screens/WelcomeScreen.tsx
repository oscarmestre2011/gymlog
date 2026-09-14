import { saveSettings } from '../db/repository'
import { KairosMark } from '../components/KairosMark'

/**
 * Pantalla de bienvenida: se ve UNA vez, la primera vez que se abre la app.
 *
 * Existe porque quien instala la app por primera vez no sabe que es esto, quien la
 * ha hecho, que rutinas trae, ni sobre todo donde van a parar sus datos. Esa es la
 * duda numero uno de cualquiera que instala algo desconocido, y aqui se responde
 * antes de empezar a usarla.
 */
export function WelcomeScreen({
  onDone,
  onStartFresh,
}: {
  onDone: () => void
  /** Empieza directamente el entrenamiento del dia. */
  onStartFresh: () => void
}) {
  const cerrar = async (empezarAhora: boolean) => {
    try {
      await saveSettings({ hasSeenWelcome: true })
    } catch {
      // Si falla el guardado, la bienvenida volvera a salir: no es grave.
    }
    onDone()
    if (empezarAhora) onStartFresh()
  }

  return (
    <div className="screen welcome">
      <div className="welcome-hero">
        <div className="welcome-logo">
          <KairosMark size={104} grande titulo="Kairós" />
        </div>
        <h2>Bienvenido a Kairós</h2>
        <p className="muted">
          Para apuntar tus entrenamientos de gimnasio desde el móvil: series, pesos, rutinas,
          progresión y cardio. <b>Funciona sin conexión</b>, así que da igual que en el gimnasio no
          haya cobertura.
        </p>
      </div>

      <div className="card">
        <h3 className="card-title">Tus datos son tuyos</h3>
        <div className="welcome-point">
          <span aria-hidden>📱</span>
          <div>
            <b>Se guardan solo en tu móvil.</b> No hay servidor, ni cuentas, ni publicidad. Nadie
            más puede verlos.
          </div>
        </div>
        <div className="welcome-point">
          <span aria-hidden>💾</span>
          <div>
            <b>Haz copia de vez en cuando.</b> En Ajustes puedes descargar un archivo con todo. Si
            borras los datos del navegador, sin copia se pierden.
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Ya viene con rutinas</h3>
        <div className="welcome-point">
          <span aria-hidden>📋</span>
          <div>
            <b>Fuerza A, B y C</b> (empuje, tracción y cuerpo completo) más una de movilidad para
            casa. Puedes editarlas o crear las tuyas.
          </div>
        </div>
        <div className="welcome-point">
          <span aria-hidden>💡</span>
          <div>
            <b>Te propone cuándo subir de peso:</b> si completas todas las series al tope de
            repeticiones, te sugiere el siguiente disco.
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Cómo apuntar una serie</h3>
        <div className="welcome-point">
          <span aria-hidden>1️⃣</span>
          <div>Pulsa <b>Empezar entrenamiento</b> y elige la rutina del día.</div>
        </div>
        <div className="welcome-point">
          <span aria-hidden>2️⃣</span>
          <div>
            Escribe peso y repeticiones (admite coma: <b>52,5</b>) y pulsa <b>✓</b>. El cronómetro de
            descanso arranca solo.
          </div>
        </div>
        <div className="welcome-point">
          <span aria-hidden>3️⃣</span>
          <div>
            Al terminar, pulsa <b>Terminar y guardar</b>. La sesión queda en <b>Progresión</b>.
          </div>
        </div>
      </div>

      <button className="btn primary block lg" onClick={() => void cerrar(true)}>
        Empezar el entrenamiento de hoy
      </button>
      <button className="btn ghost block" onClick={() => void cerrar(false)}>
        Ya lo veré luego
      </button>

      <p className="tiny muted center" style={{ marginTop: 4 }}>
        Kairós · Registro de entrenamiento
      </p>
    </div>
  )
}
