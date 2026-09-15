import { useMemo, useState } from 'react'
import type { Settings } from '../types'
import { listMeasurements } from '../db/repository'
import { useQuery, useSettings } from '../hooks'
import { NumberInput } from '../components/NumberInput'
import {
  FACTORES_ACTIVIDAD,
  edadDesde,
  gastoEnReposo,
  gastoTotal,
  imcPerfil,
  queFalta,
  rangoProteina,
  textoEdad,
  type NivelActividad,
} from '../lib/perfil'
import { clasificacionImc, cinturaAltura, resumenDe, riesgoCinturaAltura } from '../lib/medidas'
import { formatKilograms, formatNumber, prettyDate } from '../lib/format'

/**
 * Perfil del deportista.
 *
 * Reune los datos que no cambian con el entrenamiento (altura, fecha de nacimiento, sexo, cuanto
 * se mueve al dia) y calcula a partir de ellos lo que si cambia: la edad, el IMC, la relacion
 * cintura/altura y una estimacion de lo que gasta al dia.
 *
 * El PESO no se pide aqui: se coge de la medicion mas reciente de las medidas corporales. Asi hay
 * un unico sitio donde apuntarlo y no puede contradecirse con otro.
 *
 * Los calculos son estimaciones, y la pantalla lo dice: no son un diagnostico medico.
 */
export function ProfileScreen() {
  const [settings, guardar] = useSettings()
  const [verDetalle, setVerDetalle] = useState(true)

  const { data: mediciones } = useQuery(() => listMeasurements(), [], [])
  const peso = useMemo(() => resumenDe(mediciones ?? [], 'weightKg').ultima ?? null, [mediciones])
  const pesoKg = peso?.weightKg

  const datos = {
    heightCm: settings.heightCm,
    birthDate: settings.birthDate,
    sex: settings.sex,
    activity: settings.activity,
    bodyFatPercent: settings.bodyFatPercent,
  }

  const edad = useMemo(() => edadDesde(settings.birthDate), [settings.birthDate])
  const reposo = gastoEnReposo(datos, pesoKg, edad)
  const total = gastoTotal(reposo, settings.activity)
  const proteina = rangoProteina(pesoKg)
  const imc = imcPerfil(pesoKg, settings.heightCm)
  const whTr = peso ? cinturaAltura(peso, settings.heightCm) : null
  const riesgoWhTr = riesgoCinturaAltura(whTr)
  const faltan = queFalta(datos, Boolean(pesoKg))

  /** Guarda y avisa. Los cambios se aplican al momento en toda la app. */
  const guardarDato = async (patch: Partial<Settings>) => {
    await guardar(patch)
  }

  return (
    <div className="screen">
      {/* ------------------------------ tus datos ------------------------------ */}
      <div className="card">
        <h2 className="card-title">Tus datos</h2>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="perfil-altura">Altura (cm)</label>
            <NumberInput
              value={settings.heightCm}
              onChange={(v) => void guardarDato({ heightCm: v })}
              integer
              ariaLabel="Tu altura en centímetros"
              placeholder="170"
            />
          </div>
          <div className="field">
            <label htmlFor="perfil-nacimiento">Fecha de nacimiento</label>
            <input
              id="perfil-nacimiento"
              className="input"
              type="date"
              value={settings.birthDate ?? ''}
              onChange={(e) => void guardarDato({ birthDate: e.target.value || undefined })}
              aria-label="Fecha de nacimiento"
            />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              {edad !== null ? `${textoEdad(edad)}` : 'Se calcula la edad sola con esta fecha.'}
            </p>
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Sexo</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {(['hombre', 'mujer'] as const).map((opcion) => (
              <button
                key={opcion}
                className={`chip${settings.sex === opcion ? ' active' : ''}`}
                onClick={() => void guardarDato({ sex: opcion })}
              >
                {opcion === 'hombre' ? 'Hombre' : 'Mujer'}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Hace falta para estimar el gasto energético: las fórmulas usan un valor distinto.
          </p>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Cuánto te mueves al día</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {(Object.keys(FACTORES_ACTIVIDAD) as NivelActividad[]).map((nivel) => (
              <button
                key={nivel}
                className={`chip${settings.activity === nivel ? ' active' : ''}`}
                onClick={() => void guardarDato({ activity: nivel })}
                title={FACTORES_ACTIVIDAD[nivel].texto}
              >
                {nivel === 'muy-alto' ? 'Muy alto' : nivel.charAt(0).toUpperCase() + nivel.slice(1)}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            {settings.activity ? FACTORES_ACTIVIDAD[settings.activity].texto : 'Elige el que más se parezca a tu semana.'}
          </p>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="perfil-grasa">Porcentaje de grasa (opcional)</label>
          <NumberInput
            value={settings.bodyFatPercent}
            onChange={(v) => void guardarDato({ bodyFatPercent: v })}
            ariaLabel="Porcentaje de grasa corporal"
            placeholder="—"
          />
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Si lo conoces (báscula de bioimpedancia, medición con plicómetro), la estimación mejora:
            se calcula a partir de tu masa magra y no de suposiciones.
          </p>
        </div>
      </div>

      {/* ----------------------------- resultados ----------------------------- */}
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            Lo que sale de tus datos
          </h2>
          {peso ? (
            <span className="tiny muted">
              con tu peso del {prettyDate(peso.date)}
            </span>
          ) : null}
        </div>

        {pesoKg ? (
          <div className="stats">
            {edad !== null ? (
              <div className="stat">
                <div className="value">{edad}</div>
                <div className="label">años</div>
              </div>
            ) : null}
            {imc !== null ? (
              <div className="stat">
                <div className="value">{formatNumber(imc, 1)}</div>
                <div className="label">IMC · {clasificacionImc(imc)}</div>
              </div>
            ) : null}
            <div className="stat">
              <div className="value">{formatKilograms(pesoKg)}</div>
              <div className="label">peso actual</div>
            </div>
            {total !== null ? (
              <div className="stat">
                <div className="value">{formatNumber(total)}</div>
                <div className="label">kcal al día (estimado)</div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="small muted">
            Apunta tu peso en <b>Medidas corporales</b> y aquí aparecerán los cálculos. El peso no se
            pide dos veces: se coge de la última medición.
          </p>
        )}

        {riesgoWhTr && whTr !== null ? (
          <div className="kv" style={{ marginTop: 10 }}>
            <span className="k">Cintura / altura</span>
            <span className="v">
              <span className={`dot ${riesgoWhTr.nivel}`} /> {formatNumber(whTr, 2)} · {riesgoWhTr.texto}
            </span>
          </div>
        ) : null}

        {reposo !== null ? (
          <div className="kv">
            <span className="k">En reposo</span>
            <span className="v">{formatNumber(reposo)} kcal</span>
          </div>
        ) : null}

        {proteina ? (
          <div className="kv">
            <span className="k">Proteína al día</span>
            <span className="v">
              {formatNumber(proteina.min)}–{formatNumber(proteina.max)} g
            </span>
          </div>
        ) : null}

        {faltan.length > 0 ? (
          <p className="small warn" style={{ marginTop: 10, marginBottom: 0 }}>
            Para calcularlo todo falta: {faltan.join(', ')}.
          </p>
        ) : null}

        <button className="btn block ghost" style={{ marginTop: 10 }} onClick={() => setVerDetalle((v) => !v)}>
          {verDetalle ? 'Ocultar cómo se calcula' : 'Ver cómo se calcula'}
        </button>

        {verDetalle ? (
          <div className="tiny muted" style={{ marginTop: 10 }}>
            <p style={{ marginTop: 0 }}>
              <b>Gasto en reposo:</b>{' '}
              {settings.bodyFatPercent
                ? 'fórmula de Katch-McArdle, que parte de tu masa magra (la más exacta si el dato de grasa es fiable).'
                : 'fórmula de Mifflin-St Jeor, la recomendada con datos generales. Con tu porcentaje de grasa sería más exacta.'}
            </p>
            <p>
              <b>Gasto del día:</b> el de reposo multiplicado por {FACTORES_ACTIVIDAD[settings.activity ?? 'ligero'].factor}{' '}
              (nivel {settings.activity ?? 'ligero'}). Es una estimación: cada persona gasta algo distinto para
              la misma actividad, así que sirve como punto de partida, no como una cifra exacta.
            </p>
            <p>
              <b>Proteína:</b> entre 1,6 y 2,2 g por kilo de peso al día, el rango que sostiene la masa
              muscular en quien entrena fuerza. Dentro del rango, más cerca del máximo si estás
              perdiendo grasa.
            </p>
            <p style={{ marginBottom: 0 }}>
              <b>El IMC</b> no distingue músculo de grasa: con entrenamiento de fuerza, la cintura y la
              fuerza son mejores señales que el IMC.
            </p>
          </div>
        ) : null}
      </div>

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        Son estimaciones para orientarte, no un diagnóstico médico. Tus datos se quedan en tu móvil.
      </p>
    </div>
  )
}
