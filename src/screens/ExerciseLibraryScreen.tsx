import { useMemo, useState } from 'react'
import type { Equipment, Exercise, ExerciseSide, MuscleGroup } from '../types'
import {
  countSetsByExercise,
  deleteExercise,
  listExercises,
  upsertExercise,
} from '../db/repository'
import { newId } from '../db'
import { useQuery } from '../hooks'
import { ConfirmDialog, Modal } from '../components/Modal'
import { NumberInput } from '../components/NumberInput'
import { formatNumber } from '../lib/format'

/** Todos los grupos musculares que admite la app, en el orden en que se muestran. */
const GRUPOS: MuscleGroup[] = [
  'Pecho',
  'Espalda',
  'Hombro',
  'Biceps',
  'Triceps',
  'Cuadriceps',
  'Femoral',
  'Gluteo',
  'Gemelo',
  'Core',
  'Cuerpo completo',
]

const MATERIALES: Equipment[] = [
  'Barra',
  'Mancuernas',
  'Maquina',
  'Polea',
  'Peso corporal',
  'Banda elastica',
  'Otro',
]

const LADOS: { valor: ExerciseSide; texto: string }[] = [
  { valor: 'bilateral', texto: 'Los dos lados a la vez' },
  { valor: 'por-lado', texto: 'Por lado' },
  { valor: 'unilateral', texto: 'A una sola pierna/brazo' },
]

/**
 * Biblioteca de ejercicios: ver, buscar, crear, editar y borrar.
 *
 * Antes los ejercicios que no venian en la lista solo se podian crear desde dentro de una
 * sesion, y quedaban como "Cuerpo completo / Otro", sin descripcion y sin poder
 * corregirlos despues. Aqui se gestionan como es debido.
 */
export function ExerciseLibraryScreen({ notify }: { notify: (message: string) => void }) {
  const [busqueda, setBusqueda] = useState('')
  const [grupo, setGrupo] = useState<MuscleGroup | 'Todos' | 'Mios' | 'Frecuentes'>('Frecuentes')
  const [editando, setEditando] = useState<Exercise | 'nuevo' | null>(null)
  const [porBorrar, setPorBorrar] = useState<Exercise | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: ejercicios } = useQuery(() => listExercises(), [refreshKey], [])
  const { data: usos } = useQuery(() => countSetsByExercise(), [refreshKey], {})

  const lista = useMemo(() => {
    const todos = ejercicios ?? []
    const texto = busqueda
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

    let filtrados = todos
    if (grupo === 'Mios') filtrados = todos.filter((e) => e.custom)
    else if (grupo === 'Frecuentes') {
      const frecuentes = todos.filter((e) => e.favorite || e.custom)
      filtrados = frecuentes.length > 0 ? frecuentes : todos
    } else if (grupo !== 'Todos') filtrados = todos.filter((e) => e.group === grupo)

    if (!texto) return filtrados
    return filtrados.filter((e) => {
      const enNombre = e.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .includes(texto)
      const enDescripcion = (e.description ?? '').toLowerCase().includes(texto)
      const enMaterial = e.equipment.toLowerCase().includes(texto)
      return enNombre || enDescripcion || enMaterial
    })
  }, [ejercicios, busqueda, grupo])

  const totalMios = (ejercicios ?? []).filter((e) => e.custom).length

  return (
    <div className="screen">
      <button className="btn primary block lg" onClick={() => setEditando('nuevo')}>
        ＋ Añadir ejercicio
      </button>

      <input
        className="input"
        placeholder="Buscar por nombre, descripción o material…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        aria-label="Buscar ejercicio"
      />

      <div className="chips">
        {(['Frecuentes', 'Mios', 'Todos', ...GRUPOS] as (MuscleGroup | 'Todos' | 'Mios' | 'Frecuentes')[]).map(
          (opcion) => (
            <button
              key={opcion}
              className={`chip${grupo === opcion ? ' active' : ''}`}
              onClick={() => setGrupo(opcion)}
            >
              {opcion === 'Mios' ? `Míos${totalMios > 0 ? ` (${totalMios})` : ''}` : opcion}
            </button>
          ),
        )}
      </div>

      <p className="tiny muted" style={{ margin: 0 }}>
        {(ejercicios ?? []).length} ejercicios en la biblioteca
        {totalMios > 0 ? `, ${totalMios} creados por ti` : ''}. Los que añades aquí están disponibles al
        apuntar una sesión.
      </p>

      {lista.length === 0 ? (
        <div className="empty">
          <div className="big">🔍</div>
          <p>Ningún ejercicio coincide con «{busqueda}».</p>
          {busqueda.trim().length >= 3 ? (
            <button className="btn primary" onClick={() => setEditando('nuevo')}>
              ＋ Crear «{busqueda.trim()}»
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="list">
        {lista.map((ejercicio) => (
          <div key={ejercicio.id} className="list-item">
            <div className="main">
              <div className="title">
                {ejercicio.name}
                {ejercicio.custom ? <span className="badge" style={{ marginLeft: 8 }}>mío</span> : null}
              </div>
              <div className="meta">
                {ejercicio.group} · {ejercicio.equipment}
                {ejercicio.side !== 'bilateral' ? ` · ${ejercicio.side.replace('-', ' ')}` : ''}
                {usos?.[ejercicio.id] ? ` · ${usos[ejercicio.id]} series apuntadas` : ''}
              </div>
              {ejercicio.description ? (
                <div className="tiny muted" style={{ marginTop: 3 }}>
                  {ejercicio.description}
                </div>
              ) : null}
            </div>
            <button
              className="icon-btn"
              onClick={() => setEditando(ejercicio)}
              aria-label={`Editar ${ejercicio.name}`}
            >
              ✎
            </button>
            <button
              className="icon-btn danger"
              onClick={() => setPorBorrar(ejercicio)}
              aria-label={`Borrar ${ejercicio.name}`}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      {editando ? (
        <FormularioEjercicio
          ejercicio={editando === 'nuevo' ? null : editando}
          nombreInicial={editando === 'nuevo' && busqueda.trim().length >= 3 ? busqueda.trim() : undefined}
          onGuardar={async (datos) => {
            const existente = editando === 'nuevo' ? null : editando
            await upsertExercise({
              id: existente?.id ?? newId('e_'),
              name: datos.name,
              group: datos.group,
              equipment: datos.equipment,
              side: datos.side,
              description: datos.description,
              increment: datos.increment,
              favorite: existente?.favorite ?? true,
              custom: true,
              createdAt: existente?.createdAt ?? Date.now(),
            })
            setEditando(null)
            setBusqueda('')
            setGrupo('Mios')
            setRefreshKey((k) => k + 1)
            notify(existente ? 'Ejercicio actualizado' : `«${datos.name}» añadido a la biblioteca`)
          }}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      {porBorrar ? (
        <ConfirmDialog
          title="Borrar ejercicio"
          message={
            usos?.[porBorrar.id]
              ? `«${porBorrar.name}» se ha usado en ${usos[porBorrar.id]} series. Esas series NO se borran: guardan su propio nombre. Solo desaparece de la biblioteca, para que no vuelva a ofrecerse.`
              : `«${porBorrar.name}» desaparecerá de la biblioteca. No se puede deshacer.`
          }
          onConfirm={async () => {
            await deleteExercise(porBorrar.id)
            setPorBorrar(null)
            setRefreshKey((k) => k + 1)
            notify('Ejercicio borrado de la biblioteca')
          }}
          onCancel={() => setPorBorrar(null)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Formulario de ejercicio                                             */
/* ------------------------------------------------------------------ */

function FormularioEjercicio({
  ejercicio,
  nombreInicial,
  onGuardar,
  onCerrar,
}: {
  ejercicio: Exercise | null
  nombreInicial?: string
  onGuardar: (datos: {
    name: string
    group: MuscleGroup
    equipment: Equipment
    side: ExerciseSide
    description?: string
    increment: number
  }) => Promise<void>
  onCerrar: () => void
}) {
  const [name, setNombre] = useState(ejercicio?.name ?? nombreInicial ?? '')
  const [group, setGrupo] = useState<MuscleGroup>(ejercicio?.group ?? 'Cuerpo completo')
  const [equipment, setMaterial] = useState<Equipment>(ejercicio?.equipment ?? 'Otro')
  const [side, setLado] = useState<ExerciseSide>(ejercicio?.side ?? 'bilateral')
  const [description, setDescripcion] = useState(ejercicio?.description ?? ejercicio?.notes ?? '')
  const [increment, setIncremento] = useState(ejercicio?.increment ?? 2.5)
  const [guardando, setGuardando] = useState(false)

  const nombreLimpio = name.trim()
  const puedeGuardar = nombreLimpio.length >= 2

  return (
    <Modal
      title={ejercicio ? 'Editar ejercicio' : 'Nuevo ejercicio'}
      subtitle="Estará disponible al apuntar tus sesiones"
      onClose={onCerrar}
      actions={
        <>
          <button className="btn ghost grow" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="btn primary grow"
            disabled={!puedeGuardar || guardando}
            onClick={async () => {
              setGuardando(true)
              try {
                await onGuardar({
                  name: nombreLimpio,
                  group,
                  equipment,
                  side,
                  description: description.trim() || undefined,
                  increment,
                })
              } finally {
                setGuardando(false)
              }
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="ej-nombre">Nombre del ejercicio</label>
        <input
          id="ej-nombre"
          className="input"
          placeholder="Remo invertido en mesa"
          value={name}
          maxLength={60}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
        />
        {!puedeGuardar ? (
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Escribe al menos dos letras.
          </p>
        ) : null}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="ej-desc">Descripción (opcional)</label>
        <textarea
          id="ej-desc"
          className="input"
          placeholder="Cómo se hace: agarre, rango, a qué altura la barra, precauciones…"
          value={description}
          maxLength={300}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          Aparecerá al abrir el ejercicio durante la sesión, para acordarte de cómo lo hacías.
        </p>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="ej-grupo">Parte del cuerpo que trabaja</label>
        <div className="chips chips-grid">
          {GRUPOS.map((opcion) => (
            <button
              key={opcion}
              className={`chip${group === opcion ? ' active' : ''}`}
              onClick={() => setGrupo(opcion)}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="ej-material">Material</label>
        <div className="chips chips-grid">
          {MATERIALES.map((opcion) => (
            <button
              key={opcion}
              className={`chip${equipment === opcion ? ' active' : ''}`}
              onClick={() => setMaterial(opcion)}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="ej-lado">Ejecución</label>
          <select
            id="ej-lado"
            className="input"
            value={side}
            onChange={(e) => setLado(e.target.value as ExerciseSide)}
          >
            {LADOS.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ej-incremento">Salto de peso (kg)</label>
          <NumberInput
            value={increment}
            onChange={(v) => setIncremento(v ?? 2.5)}
            ariaLabel="Salto de peso en kilos"
          />
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            El disco más pequeño que puedes poner: {formatNumber(increment)} kg
          </p>
        </div>
      </div>
    </Modal>
  )
}
