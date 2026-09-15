import { useRef, useState } from 'react'
import type { BackupFile, Settings } from '../types'
import {
  getExerciseHistory,
  importBackup,
  listCardio,
  listSessions,
  listTrainedExercises,
  wipeAll,
} from '../db/repository'
import { db } from '../db'
import { seedIfEmpty } from '../db/seed'
import { ConfirmDialog } from '../components/Modal'
import { descargarArchivo, descargarCopiaDeSeguridad } from '../lib/descargar'
import { audioDisponible, duracionDelAviso } from '../lib/audio'
import type { EstadoPantalla } from '../hooks/useWakeLock'
import { KairosMark } from '../components/KairosMark'
import { exerciseSummary } from '../lib/format'
import { progressionToMarkdown, sessionsToMarkdown } from '../lib/markdown'

export function SettingsScreen({
  settings,
  onSave,
  notify,
  estadoPantalla = 'inactivo',
  reintentarPantalla,
}: {
  settings: Settings
  onSave: (patch: Partial<Settings>) => Promise<void>
  notify: (message: string) => void
  /** Si la pantalla se esta manteniendo encendida o por que no. */
  estadoPantalla?: EstadoPantalla
  reintentarPantalla?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmReseed, setConfirmReseed] = useState(false)
  const [busy, setBusy] = useState(false)

  /** Se usa el ayudante compartido: la misma descarga que el aviso de la portada. */
  const download = (contents: string, filename: string, type = 'text/plain') =>
    descargarArchivo(contents, filename, type)

  const handleExportJSON = async () => {
    setBusy(true)
    try {
      await descargarCopiaDeSeguridad()
      notify('Copia descargada')
    } finally {
      setBusy(false)
    }
  }

  const handleExportMarkdown = async () => {
    setBusy(true)
    try {
      const [sessions, allSets, cardio] = await Promise.all([
        listSessions(),
        db.sets.toArray(),
        listCardio(),
      ])
      const md = sessionsToMarkdown(sessions, allSets, cardio)
      download(md, `registro-entrenamiento-${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown')
      notify('Markdown exportado: ya puedes pegarlo en el vault')
    } finally {
      setBusy(false)
    }
  }

  const handleExportProgression = async () => {
    setBusy(true)
    try {
      const trained = await listTrainedExercises()
      const rows = []
      for (const exercise of trained) {
        const history = await getExerciseHistory(exercise.id)
        rows.push({
          exerciseName: exercise.name,
          entries: history.map((h) => ({
            date: h.date,
            summary: exerciseSummary(h.sets),
            topWeight: h.topWeight,
            volume: h.volume,
          })),
        })
      }
      download(
        progressionToMarkdown(rows),
        `progresion-ejercicios-${new Date().toISOString().slice(0, 10)}.md`,
        'text/markdown',
      )
      notify('Progresión exportada')
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return
    setBusy(true)
    try {
      const result = await importBackup(pendingImport, mode)
      setPendingImport(null)
      notify(`Importadas ${result.sessions} sesiones y ${result.sets} series`)
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo importar')
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as BackupFile
      if (parsed?.format !== 'gymlog-backup') {
        notify('Ese archivo no es una copia de GymLog')
        return
      }
      setPendingImport(parsed)
    } catch {
      notify('No se pudo leer el archivo')
    }
  }

  const daysSinceBackup = settings.lastBackupAt
    ? Math.floor((Date.now() - settings.lastBackupAt) / 86400000)
    : null

  return (
    <div className="screen">
      {/* ------------------------------- descanso ------------------------------ */}
      <div className="card">
        <h2 className="card-title">Descanso</h2>
        <div className="field">
          <label>Descanso por defecto para ejercicios nuevos</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[45, 60, 75, 90, 120, 150, 180].map((seconds) => (
              <button
                key={seconds}
                className={`chip${settings.defaultRestSeconds === seconds ? ' active' : ''}`}
                onClick={() => void onSave({ defaultRestSeconds: seconds })}
              >
                {seconds >= 60 ? `${seconds / 60} min` : `${seconds} s`}
              </button>
            ))}
          </div>
        </div>

        <Toggle
          label="Arrancar el cronómetro al guardar una serie"
          hint="Si lo desactivas, tendrás que arrancarlo a mano con el botón del ejercicio."
          checked={settings.autoStartRest}
          onChange={(v) => void onSave({ autoStartRest: v })}
        />
        <Toggle
          label="Aviso sonoro al terminar el descanso"
          hint="En iPhone Safari no permite sonidos: allí el aviso es visual (la barra se pone verde y escribe «¡Descanso terminado!»)."
          checked={settings.soundOn}
          onChange={(v) => void onSave({ soundOn: v })}
        />
        <Toggle
          label="Vibración al terminar el descanso"
          hint="Solo en Android. En iPhone no existe: al terminar el descanso verás el aviso en pantalla, en verde."
          checked={settings.vibrateOn}
          onChange={(v) => void onSave({ vibrateOn: v })}
        />

        {/* Duracion del aviso: el usuario pidio que fuera mas largo. */}
        <div className="field" style={{ marginTop: 14 }}>
          <label>Duración del aviso</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {(
              [
                { valor: 'corto', texto: 'Corto' },
                { valor: 'largo', texto: 'Largo' },
                { valor: 'muy-largo', texto: 'Muy largo' },
              ] as const
            ).map((opcion) => (
              <button
                key={opcion.valor}
                className={`chip${(settings.alertLength ?? 'largo') === opcion.valor ? ' active' : ''}`}
                onClick={() => void onSave({ alertLength: opcion.valor })}
              >
                {opcion.texto}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            El aviso sonoro dura unos {(duracionDelAviso(settings.alertLength ?? 'largo') / 1000).toFixed(1)} s
            {audioDisponible() ? '' : ' (este navegador no permite sonidos: se verá en pantalla)'}.
          </p>
        </div>
      </div>

      {/* ------------------------------- pantalla ------------------------------ */}
      <div className="card">
        <h2 className="card-title">Pantalla</h2>
        <Toggle
          label="Mantener la pantalla encendida mientras uso la app"
          hint="Si el móvil apaga la pantalla, el navegador duerme la app y el aviso del descanso no suena hasta que vuelvas a encenderla. Con esto no se apaga. Gasta más batería."
          checked={settings.keepScreenOn}
          onChange={(v) => void onSave({ keepScreenOn: v })}
        />
        <div className="kv" style={{ marginTop: 8 }}>
          <span className="k">Estado</span>
          <span className="v">
            {estadoPantalla === 'activo'
              ? '✅ mantenida encendida'
              : estadoPantalla === 'no-disponible'
                ? 'este navegador no lo permite'
                : estadoPantalla === 'denegado'
                  ? 'el navegador lo ha denegado'
                  : 'en pausa (app en segundo plano)'}
          </span>
        </div>
        {estadoPantalla === 'denegado' && reintentarPantalla ? (
          <button className="btn block" style={{ marginTop: 8 }} onClick={reintentarPantalla}>
            Volver a intentarlo
          </button>
        ) : null}
        <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Si el móvil apaga la pantalla de todas formas (porque tú lo bloqueas), la app no puede
          evitarlo: en ese momento el navegador la duerme. Al volver a encenderla, el cronómetro se
          pone al día y el aviso suena en ese momento.
        </p>
      </div>

      {/* -------------------------------- copia -------------------------------- */}
      <div className="card">
        <h2 className="card-title">Copia de seguridad</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Los datos viven solo en este dispositivo. Si borras los datos del navegador, se pierden: haz
          copia de vez en cuando.
          {daysSinceBackup !== null
            ? daysSinceBackup === 0
              ? ' Última copia: hoy.'
              : ` Última copia: hace ${daysSinceBackup} ${daysSinceBackup === 1 ? 'día' : 'días'}.`
            : ' Todavía no has hecho ninguna copia.'}
        </p>

        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary grow" onClick={() => void handleExportJSON()} disabled={busy}>
            ⬇ Descargar copia (.json)
          </button>
          <button className="btn grow" onClick={() => fileRef.current?.click()} disabled={busy}>
            ⬆ Importar copia
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />

        {/* Cada cuanto recordar que toca copia. 0 = no recordar. */}
        <div className="field" style={{ marginTop: 14 }}>
          <label>Recordarme que haga copia</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[
              { dias: 7, texto: 'Cada semana' },
              { dias: 14, texto: 'Cada 14 días' },
              { dias: 30, texto: 'Cada mes' },
              { dias: 0, texto: 'No recordar' },
            ].map((opcion) => (
              <button
                key={opcion.dias}
                className={`chip${(settings.backupReminderDays ?? 7) === opcion.dias ? ' active' : ''}`}
                onClick={() => void onSave({ backupReminderDays: opcion.dias })}
              >
                {opcion.texto}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            {(settings.backupReminderDays ?? 7) === 0
              ? 'Sin recordatorio. Acuérdate de hacer copia por tu cuenta.'
              : 'Aparecerá un aviso en la pantalla de inicio cuando toque. Se puede descartar.'}
          </p>
        </div>
      </div>

      {/* ------------------------------ exportar ------------------------------- */}
      <div className="card">
        <h2 className="card-title">Exportar al vault de Obsidian</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Genera Markdown con el mismo formato que usas en «20 Vida saludable». Se descarga el archivo y
          tú decides dónde ponerlo: la app no escribe en tu vault.
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn grow" onClick={() => void handleExportMarkdown()} disabled={busy}>
            📄 Sesiones en Markdown
          </button>
          <button className="btn grow" onClick={() => void handleExportProgression()} disabled={busy}>
            📈 Progresión en Markdown
          </button>
        </div>
      </div>

      {/* ------------------------------ peligro -------------------------------- */}
      <div className="card" style={{ borderColor: 'rgba(248,113,113,0.3)' }}>
        <h2 className="card-title" style={{ color: 'var(--danger)' }}>
          Zona delicada
        </h2>
        <div className="list">
          <button
            className="list-item"
            style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--border)', width: '100%', textAlign: 'left' }}
            onClick={() => setConfirmReseed(true)}
          >
            <div className="main">
              <div className="title">Restaurar ejercicios y rutinas de ejemplo</div>
              <div className="meta">Vuelve a crear el programa A/B/C. No toca tus sesiones.</div>
            </div>
          </button>
          <button
            className="list-item"
            style={{ background: 'transparent', border: 0, width: '100%', textAlign: 'left' }}
            onClick={() => setConfirmWipe(true)}
          >
            <div className="main">
              <div className="title" style={{ color: 'var(--danger)' }}>
                Borrar todos los datos
              </div>
              <div className="meta">Sesiones, series, rutinas, cardio y ajustes. Irreversible.</div>
            </div>
          </button>
        </div>
      </div>

      {/* -------------------------------- acerca ------------------------------- */}
      <div className="card">
        <h2 className="card-title">Acerca de</h2>

        <div className="about-head">
          <KairosMark size={58} titulo="Kairós" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.02rem' }}>Kairós</div>
            <div className="tiny muted">Registro de entrenamiento</div>
          </div>
        </div>

        <div className="kv">
          <span className="k">Creada por</span>
          <span className="v">Óscar</span>
        </div>
        <div className="kv">
          <span className="k">Versión</span>
          <span className="v">1.0.15</span>
        </div>
        <div className="kv">
          <span className="k">Funciona sin conexión</span>
          <span className="v">Sí</span>
        </div>
        <div className="kv">
          <span className="k">Servidor / cuentas</span>
          <span className="v">Ninguno</span>
        </div>

        <p className="tiny muted" style={{ marginTop: 10, marginBottom: 8 }}>
          Kairós guarda todo en el almacenamiento local del navegador (IndexedDB): no envía nada a
          ningún sitio y nadie más puede ver tus entrenamientos.
        </p>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Para instalarla: en Android, menú ⋮ → «Instalar aplicación»; en iPhone, Safari → Compartir →
          «Añadir a pantalla de inicio».
        </p>
      </div>

      {/* ------------------------------- modales ------------------------------- */}
      {pendingImport ? (
        <ImportDialog
          backup={pendingImport}
          onCancel={() => setPendingImport(null)}
          onConfirm={(mode) => void handleImport(mode)}
        />
      ) : null}

      {confirmWipe ? (
        <ConfirmDialog
          title="Borrar todos los datos"
          message="Se borrará absolutamente todo: sesiones, series, rutinas, cardio y ajustes. Descarga antes una copia si no estás seguro."
          confirmLabel="Borrar todo"
          onConfirm={async () => {
            setConfirmWipe(false)
            await wipeAll()
            window.setTimeout(() => window.location.reload(), 400)
          }}
          onCancel={() => setConfirmWipe(false)}
        />
      ) : null}

      {confirmReseed ? (
        <ConfirmDialog
          title="Restaurar ejemplos"
          message="Se sustituirán los ejercicios y rutinas actuales por el programa A/B/C de ejemplo. Tus sesiones registradas no se tocan."
          confirmLabel="Restaurar"
          onConfirm={async () => {
            setConfirmReseed(false)
            await seedIfEmpty(true)
            notify('Ejercicios y rutinas restaurados')
            window.setTimeout(() => window.location.reload(), 500)
          }}
          onCancel={() => setConfirmReseed(false)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      className="row between"
      style={{
        background: 'transparent',
        border: 0,
        width: '100%',
        padding: '12px 0',
        borderTop: '1px solid var(--border)',
        marginTop: 10,
        textAlign: 'left',
      }}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="grow">
        <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 550 }}>{label}</span>
        {hint ? <span className="tiny muted">{hint}</span> : null}
      </span>
      <span
        style={{
          width: 48,
          height: 28,
          borderRadius: 99,
          background: checked ? 'var(--accent)' : 'var(--bg-elev-2)',
          border: '1px solid var(--border)',
          position: 'relative',
          flex: '0 0 auto',
          transition: 'background 0.15s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: checked ? 'var(--accent-ink)' : 'var(--text-dim)',
            transition: 'left 0.15s ease',
          }}
        />
      </span>
    </button>
  )
}

function ImportDialog({
  backup,
  onCancel,
  onConfirm,
}: {
  backup: BackupFile
  onCancel: () => void
  onConfirm: (mode: 'merge' | 'replace') => void
}) {
  const counts = {
    sessions: backup.data?.sessions?.length ?? 0,
    sets: backup.data?.sets?.length ?? 0,
    routines: backup.data?.routines?.length ?? 0,
    cardio: backup.data?.cardio?.length ?? 0,
  }
  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>Copia de {new Date(backup.exportedAt).toLocaleString('es-ES')}</h2>
        <div className="kv">
          <span className="k">Sesiones</span>
          <span className="v">{counts.sessions}</span>
        </div>
        <div className="kv">
          <span className="k">Series</span>
          <span className="v">{counts.sets}</span>
        </div>
        <div className="kv">
          <span className="k">Rutinas</span>
          <span className="v">{counts.routines}</span>
        </div>
        <div className="kv">
          <span className="k">Cardio</span>
          <span className="v">{counts.cardio}</span>
        </div>

        <p className="small muted">
          <b>Combinar</b> añade lo que falte y actualiza lo que coincida por identificador.
          <br />
          <b>Reemplazar</b> borra todo lo actual y deja únicamente la copia.
        </p>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost grow" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn grow" onClick={() => onConfirm('merge')}>
            Combinar
          </button>
          <button className="btn danger grow" onClick={() => onConfirm('replace')}>
            Reemplazar
          </button>
        </div>
      </div>
    </div>
  )
}
