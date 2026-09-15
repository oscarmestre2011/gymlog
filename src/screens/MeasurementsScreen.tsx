import { useMemo, useState } from 'react'
import type { BodyMeasurement } from '../types'
import {
  deleteMeasurement,
  listMeasurements,
  saveMeasurement,
} from '../db/repository'
import { newId } from '../db'
import { useQuery, useSettings } from '../hooks'
import { ConfirmDialog, Modal } from '../components/Modal'
import { NumberInput } from '../components/NumberInput'
import {
  cinturaAltura,
  clasificacionImc,
  diasDesdeLaUltima,
  imc,
  riesgoAbdominal,
  riesgoCinturaAltura,
  resumenDe,
  serieDe,
} from '../lib/medidas'
import { formatNumber, prettyDate, todayISO } from '../lib/format'

/** Campo de medidas con su etiqueta y unidad. */
type CampoMedida = 'weightKg' | 'abdomenCm' | 'waistCm' | 'chestCm' | 'thighCm'

const CAMPOS: { campo: CampoMedida; titulo: string; unidad: string; ayuda?: string }[] = [
  { campo: 'weightKg', titulo: 'Peso', unidad: 'kg' },
  { campo: 'abdomenCm', titulo: 'Abdomen', unidad: 'cm', ayuda: 'A la altura del ombligo. Es el más fiable.' },
  { campo: 'chestCm', titulo: 'Pecho', unidad: 'cm' },
  { campo: 'thighCm', titulo: 'Muslo', unidad: 'cm' },
  { campo: 'waistCm', titulo: 'Cintura', unidad: 'cm', ayuda: 'Por encima del ombligo, la parte más estrecha.' },
]

/**
 * Medidas corporales: peso, abdomen, pecho y muslo.
 *
 * Son los mismos datos que se llevan en el vault (02 Registro/Medidas corporales), con los
 * mismos indicadores: IMC y relacion cintura/altura. Se toman cada dos semanas, no a diario,
 * de ahi que vayan aparte de las sesiones.
 */
export function MeasurementsScreen({ notify }: { notify: (message: string) => void }) {
  const [settings] = useSettings()
  const [editando, setEditando] = useState<BodyMeasurement | 'nueva' | null>(null)
  const [porBorrar, setPorBorrar] = useState<BodyMeasurement | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: mediciones } = useQuery(() => listMeasurements(), [refreshKey], [])
  const lista = mediciones ?? []
  const altura = settings.heightCm || undefined

  const resumenes = useMemo(
    () => CAMPOS.map((c) => ({ ...c, ...resumenDe(lista, c.campo) })),
    [lista],
  )

  const ultima = lista[0]
  const seriePeso = useMemo(() => serieDe(lista, 'weightKg').slice(-12), [lista])
  const serieAbdomen = useMemo(() => serieDe(lista, 'abdomenCm').slice(-12), [lista])

  const valorImc = imc(ultima?.weightKg, altura)
  const whTr = ultima ? cinturaAltura(ultima, altura) : null
  const riesgoAbd = riesgoAbdominal(ultima?.abdomenCm)
  const riesgoWhTr = riesgoCinturaAltura(whTr)
  const dias = diasDesdeLaUltima(lista)

  return (
    <div className="screen">
      {/* --------------------------- ultima medicion --------------------------- */}
      {ultima ? (
        <div className="card">
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="card-title" style={{ margin: 0 }}>
              Última medición
            </span>
            <span className="tiny muted">
              {prettyDate(ultima.date)}
              {dias !== null ? ` · hace ${dias} ${dias === 1 ? 'día' : 'días'}` : ''}
            </span>
          </div>

          <div className="stats">
            {resumenes
              .filter((r) => r.ultima)
              .map((r) => (
                <div key={r.campo} className="stat">
                  <div className="value">
                    {formatNumber(r.ultima?.[r.campo] as number)} {r.unidad}
                  </div>
                  <div className="label">{r.titulo}</div>
                  {r.cambio !== null && r.cambio !== 0 ? (
                    <div className={`tiny ${r.cambio < 0 ? 'good' : 'warn'}`}>
                      {r.cambio > 0 ? '↑' : '↓'} {formatNumber(Math.abs(r.cambio))} {r.unidad} desde el
                      inicio
                    </div>
                  ) : null}
                </div>
              ))}
          </div>

          {/* Indicadores que el usuario sigue en su vault. */}
          {valorImc !== null || whTr !== null || riesgoAbd ? (
            <div style={{ marginTop: 12 }}>
              <h3 className="card-title">Indicadores</h3>
              {valorImc !== null ? (
                <div className="kv">
                  <span className="k">IMC</span>
                  <span className="v">
                    {formatNumber(valorImc, 1)} · {clasificacionImc(valorImc)}
                  </span>
                </div>
              ) : null}
              {whTr !== null && riesgoWhTr ? (
                <div className="kv">
                  <span className="k">Cintura / altura</span>
                  <span className="v">
                    <span className={`dot ${riesgoWhTr.nivel}`} /> {formatNumber(whTr, 2)} · {riesgoWhTr.texto}
                  </span>
                </div>
              ) : null}
              {riesgoAbd ? (
                <div className="kv">
                  <span className="k">Perímetro abdominal</span>
                  <span className="v">
                    <span className={`dot ${riesgoAbd.nivel}`} /> {riesgoAbd.texto}
                  </span>
                </div>
              ) : null}
              <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
                El IMC no distingue músculo de grasa: con entrenamiento de fuerza, la cintura y la
                fuerza son mejores señales. Altura configurada: {altura ?? '—'} cm.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty">
          <div className="big">📏</div>
          <p>Todavía no hay medidas.</p>
          <p className="small">
            Se toman cada dos semanas, con cinta métrica. Con la primera ya verás la evolución.
          </p>
        </div>
      )}

      <button className="btn primary block lg" onClick={() => setEditando('nueva')}>
        ＋ Añadir medición
      </button>

      {/* ------------------------------- evolucion ------------------------------ */}
      {seriePeso.length > 1 ? (
        <div className="card">
          <h3 className="card-title">Evolución del peso</h3>
          <Grafica serie={seriePeso} unidad="kg" />
        </div>
      ) : null}

      {serieAbdomen.length > 1 ? (
        <div className="card">
          <h3 className="card-title">Evolución del abdomen</h3>
          <Grafica serie={serieAbdomen} unidad="cm" />
        </div>
      ) : null}

      {/* ------------------------------ historial ------------------------------- */}
      {lista.length > 0 ? (
        <div className="card">
          <h3 className="card-title">Historial ({lista.length})</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="num">Peso</th>
                  <th className="num">Abd.</th>
                  <th className="num">Pecho</th>
                  <th className="num">Muslo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {prettyDate(m.date)}
                      {m.notes ? <div className="tiny muted">{m.notes}</div> : null}
                    </td>
                    <td className="num">{m.weightKg ? formatNumber(m.weightKg, 1) : '—'}</td>
                    <td className="num">{m.abdomenCm ? formatNumber(m.abdomenCm, 1) : '—'}</td>
                    <td className="num">{m.chestCm ? formatNumber(m.chestCm, 1) : '—'}</td>
                    <td className="num">{m.thighCm ? formatNumber(m.thighCm, 1) : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="icon-btn"
                          onClick={() => setEditando(m)}
                          aria-label={`Editar medición del ${m.date}`}
                        >
                          ✎
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => setPorBorrar(m)}
                          aria-label={`Borrar medición del ${m.date}`}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {editando ? (
        <FormularioMedida
          medicion={editando === 'nueva' ? null : editando}
          onGuardar={async (datos) => {
            const existente = editando === 'nueva' ? null : editando
            await saveMeasurement({
              id: existente?.id ?? newId('m_'),
              createdAt: existente?.createdAt ?? Date.now(),
              ...datos,
            })
            setEditando(null)
            setRefreshKey((k) => k + 1)
            notify(existente ? 'Medición actualizada' : 'Medición guardada')
          }}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      {porBorrar ? (
        <ConfirmDialog
          title="Borrar medición"
          message={`La medición del ${prettyDate(porBorrar.date)} desaparecerá. No se puede deshacer.`}
          onConfirm={async () => {
            await deleteMeasurement(porBorrar.id)
            setPorBorrar(null)
            setRefreshKey((k) => k + 1)
            notify('Medición borrada')
          }}
          onCancel={() => setPorBorrar(null)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

/** Grafica sencilla de barras, como la de la pantalla de progresion. */
function Grafica({ serie, unidad }: { serie: { date: string; valor: number }[]; unidad: string }) {
  const valores = serie.map((p) => p.valor)
  const maximo = Math.max(...valores)
  const minimo = Math.min(...valores)
  // Se escala desde el minimo menos un margen, para que se vean las diferencias pequenas:
  // en el peso, 2 kg sobre 80 no se apreciarian empezando en cero.
  const suelo = minimo - (maximo - minimo) * 0.35 - 0.2
  const techo = maximo + 0.1
  const alto = (valor: number) => `${Math.max(6, ((valor - suelo) / (techo - suelo)) * 100)}%`
  const primero = serie[0]
  const ultimo = serie[serie.length - 1]
  const cambio = ultimo.valor - primero.valor

  return (
    <>
      <div className="spark">
        {serie.map((p) => (
          <div
            key={p.date}
            className="bar"
            style={{ height: alto(p.valor) }}
            title={`${prettyDate(p.date)}: ${formatNumber(p.valor)} ${unidad}`}
          />
        ))}
      </div>
      <div className="row between tiny muted" style={{ marginTop: 6 }}>
        <span>{prettyDate(primero.date)}</span>
        <span className={cambio < 0 ? 'good' : cambio > 0 ? 'warn' : ''}>
          {cambio === 0 ? 'sin cambios' : `${cambio > 0 ? '+' : ''}${formatNumber(cambio)} ${unidad}`}
        </span>
        <span>{prettyDate(ultimo.date)}</span>
      </div>
    </>
  )
}

/** Formulario de una medicion. Solo la fecha es obligatoria. */
function FormularioMedida({
  medicion,
  onGuardar,
  onCerrar,
}: {
  medicion: BodyMeasurement | null
  onGuardar: (datos: Omit<BodyMeasurement, 'id' | 'createdAt'>) => Promise<void>
  onCerrar: () => void
}) {
  const [date, setFecha] = useState(medicion?.date ?? todayISO())
  const [valores, setValores] = useState<Record<CampoMedida, number | undefined>>({
    weightKg: medicion?.weightKg,
    abdomenCm: medicion?.abdomenCm,
    waistCm: medicion?.waistCm,
    chestCm: medicion?.chestCm,
    thighCm: medicion?.thighCm,
  })
  const [notes, setNotas] = useState(medicion?.notes ?? '')
  const [guardando, setGuardando] = useState(false)

  const hayAlgunDato = Object.values(valores).some((v) => typeof v === 'number' && v > 0)

  return (
    <Modal
      title={medicion ? 'Editar medición' : 'Nueva medición'}
      subtitle="Con cinta métrica, en ayunas y a la misma hora, para poder comparar"
      onClose={onCerrar}
      actions={
        <>
          <button className="btn ghost grow" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="btn primary grow"
            disabled={!hayAlgunDato || guardando}
            onClick={async () => {
              setGuardando(true)
              try {
                await onGuardar({ date, ...valores, notes: notes.trim() || undefined })
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
        <label htmlFor="med-fecha">Fecha</label>
        <input
          id="med-fecha"
          className="input"
          type="date"
          value={date}
          onChange={(e) => setFecha(e.target.value || todayISO())}
        />
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        {CAMPOS.map((c) => (
          <div className="field" key={c.campo}>
            <label htmlFor={`med-${c.campo}`}>
              {c.titulo} ({c.unidad})
            </label>
            <NumberInput
              value={valores[c.campo]}
              onChange={(v) => setValores((actuales) => ({ ...actuales, [c.campo]: v }))}
              ariaLabel={`${c.titulo} en ${c.unidad}`}
              placeholder={c.campo === 'weightKg' ? '79,2' : c.campo === 'abdomenCm' ? '97' : ''}
            />
            {c.ayuda ? (
              <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                {c.ayuda}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="med-notas">Notas</label>
        <input
          id="med-notas"
          className="input"
          placeholder="Contexto: viaje, enfermedad, semana suelta…"
          value={notes}
          onChange={(e) => setNotas(e.target.value)}
        />
      </div>

      <p className="tiny muted" style={{ marginTop: 12, marginBottom: 0 }}>
        Puedes rellenar solo lo que te midas: el peso o la cintura son suficientes para seguir la
        evolución.
      </p>
    </Modal>
  )
}
