/**
 * Pruebas de la ayuda (FAQ).
 *
 * Se comprueba lo que hace util una FAQ: que se encuentre lo que se busca con las palabras del
 * usuario, que no haya preguntas repetidas ni respuestas vacias, y que las respuestas digan cosas
 * concretas (botones y pantallas de verdad), no generalidades.
 */
import { describe, expect, it } from 'vitest'
import { AYUDA, CATEGORIAS, buscarAyuda, ayudaDeCategoria, cuantasPreguntas, tituloDeCategoria } from './ayuda'

describe('contenido de la ayuda', () => {
  it('hay preguntas suficientes para que sirva de algo', () => {
    expect(cuantasPreguntas()).toBeGreaterThanOrEqual(18)
  })

  it('no hay preguntas repetidas', () => {
    const ids = AYUDA.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    const preguntas = AYUDA.map((a) => a.pregunta.toLowerCase())
    expect(new Set(preguntas).size).toBe(preguntas.length)
  })

  it('todas tienen respuesta y ninguna vacia', () => {
    for (const entrada of AYUDA) {
      expect(entrada.respuesta.length, `${entrada.id} sin respuesta`).toBeGreaterThan(0)
      for (const parrafo of entrada.respuesta) {
        expect(parrafo.trim().length, `${entrada.id} con un parrafo vacio`).toBeGreaterThan(20)
      }
    }
  })

  it('todas estan en una categoria conocida', () => {
    const categorias = CATEGORIAS.map((c) => c.id)
    for (const entrada of AYUDA) {
      expect(categorias, `${entrada.id}`).toContain(entrada.categoria)
    }
  })

  it('todas las categorias tienen al menos una pregunta', () => {
    // Una categoria vacia en la pantalla se ve como un apartado roto.
    for (const categoria of CATEGORIAS) {
      expect(ayudaDeCategoria(categoria.id).length, `${categoria.id} vacia`).toBeGreaterThan(0)
    }
  })

  it('las preguntas de "cómo se hace" dan pasos concretos', () => {
    /*
     * Se exige mencionar algo concreto de la app (una pantalla, un boton), pero SOLO en las
     * preguntas de procedimiento. Hay preguntas que son informativas y no deben nombrar ningun
     * boton: "¿tengo que crear una cuenta?" se contesta que no, y punto. Exigirlo en todas
     * obligaria a meter relleno, que es justo lo contrario de lo que se busca.
     */
    const concretos = [
      'Ajustes', 'Rutinas', 'Progreso', 'Ejercicios', 'Inicio', 'medidas',
      'botón', 'flecha', 'pantalla de inicio', 'Añadir a pantalla de inicio',
      'Descargar copia', 'Importar copia', 'Guardar ahora', '+30s', '⇄', '⬇', '✓',
    ]
    const deProcedimiento = AYUDA.filter((a) => /^¿(cómo|puedo|si |me )/i.test(a.pregunta))
    expect(deProcedimiento.length).toBeGreaterThan(8)

    const flojas = deProcedimiento.filter((a) => !concretos.some((c) => a.respuesta.join(' ').includes(c)))
    expect(flojas.map((a) => a.id)).toEqual([])
  })

  it('avisa de lo que NO se puede hacer, en lugar de callarlo', () => {
    // La honestidad es parte de la ayuda: si algo no funciona en iPhone, se dice.
    const sinSonido = AYUDA.find((a) => a.id === 'sin-sonido')
    expect(sinSonido?.respuesta.join(' ')).toContain('iPhone')
    const pantalla = AYUDA.find((a) => a.id === 'pantalla-apagada')
    expect(pantalla?.respuesta.join(' ')).toMatch(/limitación/i)
  })

  it('explica que los datos no salen del móvil', () => {
    const donde = AYUDA.find((a) => a.id === 'donde-datos')
    expect(donde?.respuesta.join(' ')).toMatch(/solo en tu móvil|no hay servidor/i)
  })
})

describe('buscar en la ayuda', () => {
  it('sin texto devuelve todo', () => {
    expect(buscarAyuda('')).toHaveLength(AYUDA.length)
  })

  it('encuentra por la pregunta', () => {
    const encontradas = buscarAyuda('superseries')
    expect(encontradas.some((a) => a.id === 'superseries')).toBe(true)
  })

  it('encuentra por las palabras clave, no solo por la pregunta', () => {
    // El usuario busca "alarma", no "aviso del descanso".
    expect(buscarAyuda('alarma').some((a) => a.id === 'descanso' || a.id === 'pantalla-apagada')).toBe(true)
    // Y "cintura", que aparece en las claves de medidas.
    expect(buscarAyuda('cintura').some((a) => a.id === 'medidas')).toBe(true)
  })

  it('da igual escribir con acentos o sin ellos', () => {
    const con = buscarAyuda('calorías')
    const sin = buscarAyuda('calorias')
    expect(con.map((a) => a.id)).toEqual(sin.map((a) => a.id))
    expect(con.length).toBeGreaterThan(0)
  })

  it('da igual escribir en mayusculas', () => {
    expect(buscarAyuda('SUPERSERIES').map((a) => a.id)).toEqual(buscarAyuda('superseries').map((a) => a.id))
  })

  it('con varias palabras, las exige todas', () => {
    // "copia carpeta" debe ir a lo de la carpeta, no a todo lo de copias.
    const encontradas = buscarAyuda('copia carpeta')
    expect(encontradas.length).toBeGreaterThan(0)
    expect(encontradas.length).toBeLessThan(AYUDA.length)
    expect(encontradas.some((a) => a.id === 'copia' || a.id === 'carpeta-permiso')).toBe(true)
  })

  it('si no encuentra nada, devuelve vacio (y la pantalla lo dirá)', () => {
    expect(buscarAyuda('xyzabc')).toEqual([])
  })

  it('ignora las palabras muy cortas, que ensuciarian la busqueda', () => {
    // "la de el" no debe dejar la lista vacia.
    expect(buscarAyuda('la de el').length).toBe(AYUDA.length)
  })
})

describe('categorias', () => {
  it('cada una tiene titulo e icono', () => {
    for (const categoria of CATEGORIAS) {
      expect(categoria.titulo.length).toBeGreaterThan(3)
      expect(categoria.icono.length).toBeGreaterThan(0)
    }
  })

  it('el titulo se puede pedir por su identificador', () => {
    expect(tituloDeCategoria('entrenar')).toBe('Mientras entrenas')
  })

  it('separa las preguntas por categoria', () => {
    const empezar = ayudaDeCategoria('empezar')
    expect(empezar.length).toBeGreaterThanOrEqual(3)
    expect(empezar.every((a) => a.categoria === 'empezar')).toBe(true)
  })
})
