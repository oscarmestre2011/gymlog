import { useMemo, useState } from 'react'
import {
  AYUDA,
  CATEGORIAS,
  buscarAyuda,
  ayudaDeCategoria,
  cuantasPreguntas,
  type CategoriaAyuda,
} from '../lib/ayuda'
import { AUTOR } from '../lib/kairos'

/**
 * Ayuda: instrucciones y preguntas frecuentes.
 *
 * Pensada para que la use alguien que abre la app por primera vez (un amigo, o un cliente), y
 * tambien para resolver dudas del dia a dia sin tener que preguntar. Por eso:
 *  - se busca con las palabras del usuario ("alarma", "cintura"), no con las nuestras;
 *  - las respuestas empiezan por lo que hay que hacer;
 *  - cada grupo se despliega al tocarlo, para no marear con un muro de texto.
 */
export function Ayuda() {
  const [consulta, setConsulta] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAyuda | 'Todas'>('Todas')
  const [abierta, setAbierta] = useState<string | null>(null)

  const resultados = useMemo(() => {
    const encontradas = buscarAyuda(consulta)
    if (categoria === 'Todas') return encontradas
    return encontradas.filter((a) => a.categoria === categoria)
  }, [consulta, categoria])

  /** Solo se muestran las categorias que tienen resultados con la busqueda actual. */
  const categoriasVisibles = useMemo(
    () => CATEGORIAS.filter((c) => resultados.some((a) => a.categoria === c.id)),
    [resultados],
  )

  const buscando = consulta.trim().length > 0

  return (
    <div className="screen">
      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>
          ¿En qué te ayudo?
        </h2>
        <input
          className="input"
          type="search"
          placeholder="Busca: copia, cintura, descanso, instalar…"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Buscar en la ayuda"
          autoComplete="off"
        />

        <div className="chips" style={{ marginTop: 12 }}>
          <button
            className={`chip${categoria === 'Todas' ? ' active' : ''}`}
            onClick={() => setCategoria('Todas')}
          >
            Todas
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              className={`chip${categoria === c.id ? ' active' : ''}`}
              onClick={() => setCategoria(c.id)}
            >
              {c.icono} {c.titulo}
            </button>
          ))}
        </div>

        <p className="tiny muted" style={{ margin: '10px 0 0' }}>
          {buscando
            ? `${resultados.length} ${resultados.length === 1 ? 'respuesta' : 'respuestas'} para «${consulta.trim()}»`
            : `${cuantasPreguntas()} preguntas con respuesta. Toca una para leerla.`}
        </p>
      </div>

      {resultados.length === 0 ? (
        <div className="empty">
          <div className="big">🔍</div>
          <p>No encuentro nada para «{consulta.trim()}».</p>
          <p className="small muted">
            Prueba con otra palabra (por ejemplo «copia», «medidas» o «descanso»). Y si no está, se
            puede añadir: dilo y se añade.
          </p>
        </div>
      ) : null}

      {categoriasVisibles.map((c) => (
        <div key={c.id} className="card">
          <h3 className="card-title">
            {c.icono} {c.titulo}
          </h3>
          <div className="faq">
            {ayudaDeCategoria(c.id)
              .filter((a) => resultados.some((r) => r.id === a.id))
              .map((entrada) => {
                const desplegada = abierta === entrada.id
                return (
                  <div key={entrada.id} className={`faq-item${desplegada ? ' abierta' : ''}`}>
                    <button
                      className="faq-pregunta"
                      onClick={() => setAbierta(desplegada ? null : entrada.id)}
                      aria-expanded={desplegada}
                    >
                      <span className="grow">{entrada.pregunta}</span>
                      <span className="faq-flecha" aria-hidden="true">
                        {desplegada ? '▾' : '▸'}
                      </span>
                    </button>
                    {desplegada ? (
                      <div className="faq-respuesta">
                        {entrada.respuesta.map((parrafo, i) => (
                          <p key={i} style={{ marginTop: i === 0 ? 0 : 8 }}>
                            {parrafo}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
          </div>
        </div>
      ))}

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        ¿Falta algo en la ayuda? Dilo y se añade: esta app la hizo {AUTOR.firma}, no una empresa.
      </p>
    </div>
  )
}

/** Cuantas preguntas hay, para mostrarlo donde haga falta. */
export const TOTAL_PREGUNTAS = AYUDA.length
