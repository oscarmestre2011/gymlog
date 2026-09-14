import { useRef, useState } from 'react'
import type { BackupFile, Settings } from '../types'
import {
  exportBackup,
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
import { exerciseSummary } from '../lib/format'
import { progressionToMarkdown, sessionsToMarkdown } from '../lib/markdown'

export function SettingsScreen({
  settings,
  onSave,
  notify,
}: {
  settings: Settings
  onSave: (patch: Partial<Settings>) => Promise<void>
  notify: (message: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmReseed, setConfirmReseed] = useState(false)
  const [busy, setBusy] = useState(false)

  const download = (contents: string, filename: string, type = 'text/plain') => {
    const blob = new Blob([contents], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const handleExportJSON = async () => {
    setBusy(true)
    try {
      const backup = await exportBackup()
      const stamp = new Date().toISOString().slice(0, 10)
      download(JSON.stringify(backup, null, 2), `gymlog-copia-${stamp}.json`, 'application/json')
      await onSave({ lastBackupAt: Date.now() })
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
          checked={settings.soundOn}
          onChange={(v) => void onSave({ soundOn: v })}
        />
        <Toggle
          label="Vibración al terminar el descanso"
          hint="Depende del navegador del móvil; en iPhone no está disponible."
          checked={settings.vibrateOn}
          onChange={(v) => void onSave({ vibrateOn: v })}
        />
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
        <div className="kv">
          <span className="k">Versión</span>
          <span className="v">1.0.4</span>
        </div>
        <div className="kv">
          <span className="k">Funciona sin conexión</span>
          <span className="v">Sí</span>
        </div>
        <div className="kv">
          <span className="k">Servidor / cuentas</span>
          <span className="v">Ninguno</span>
        </div>
        <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
          GymLog guarda todo en el almacenamiento local del navegador (IndexedDB). No envía nada a
          ningún sitio. Para instalarla en el móvil, ábrela en el navegador y usa «Añadir a pantalla de
          inicio».
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
