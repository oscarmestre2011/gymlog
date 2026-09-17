/**
 * Pruebas de lo que la app cuenta hacia fuera (la web de presentacion).
 *
 * Lo que se protege aqui no es el codigo, son las promesas: la web no puede decir que la app hace
 * algo que no hace, ni anunciar una version que no es la publicada. El caso real que lo motivo: la
 * app avisa de que en iPhone el sonido del descanso no esta garantizado; si la web prometiera "te
 * avisa con sonido" a secas, estaria mintiendo a quien llega nuevo.
 */
import { describe, expect, it } from 'vitest'
import { AYUDA } from './ayuda'
import { versionMasReciente, VERSIONES } from './changelog'
import {
  ENLACE_APP,
  ENLACE_WEB,
  loQueHace,
  preguntasParaLaWeb,
  versionParaLaWeb,
} from './kairos'

describe('lo que hace la app, contado para la web', () => {
  it('hay suficientes caracteristicas y ninguna vacia', () => {
    const lista = loQueHace()
    expect(lista.length).toBeGreaterThanOrEqual(8)
    for (const item of lista) {
      expect(item.icono.length, `${item.titulo} sin icono`).toBeGreaterThan(0)
      expect(item.titulo.length, 'titulo demasiado corto').toBeGreaterThan(10)
      expect(item.texto.length, `${item.titulo} con texto corto`).toBeGreaterThan(60)
    }
  })

  it('no hay dos caracteristicas con el mismo titulo', () => {
    const titulos = loQueHace().map((c) => c.titulo.toLowerCase())
    expect(new Set(titulos).size).toBe(titulos.length)
  })

  it('no promete sincronizacion entre moviles ni cuenta de usuario', () => {
    // Son las dos cosas que la app NO tiene y que mas se dan por supuestas.
    const texto = loQueHace()
      .map((c) => `${c.titulo} ${c.texto}`)
      .join(' ')
      .toLowerCase()
    expect(texto).not.toMatch(/sincroniza(do|cion)?\s+(automatic|entre)/)
    expect(texto).not.toMatch(/crea (tu|una) cuenta/)
  })

  it('quien promete sonido, avisa del limite en iPhone', () => {
    // Este es el fallo que motivo esta prueba: se prometia "avisa con sonido" sin decir que en
    // iPhone no esta garantizado, que es justo lo que la app avisa por dentro. La regla no es
    // "no hables del iPhone" (la copia es siempre el archivo, y eso hay que decirlo): es que si
    // prometes sonido, digas tambien el limite.
    const frasesConSonido = loQueHace()
      .flatMap((c) => c.texto.split(/(?<=\.)\s+/))
      .filter((frase) => /sonido|avisa con|suena|alarma/i.test(frase))

    expect(frasesConSonido.length, 'ya no se habla del aviso sonoro en ningun sitio').toBeGreaterThan(0)
    for (const frase of frasesConSonido) {
      const textoCompleto = loQueHace()
        .map((c) => c.texto)
        .join(' ')
      expect(textoCompleto, `se promete sonido sin decir el limite: "${frase}"`).toMatch(
        /iPhone[^.]{0,80}?no está garantizado/i,
      )
    }
  })

  it('menciona los limites de la copia en carpeta, que es solo de Android', () => {
    const texto = loQueHace()
      .map((c) => `${c.titulo} ${c.texto}`)
      .join(' ')
    expect(texto).toMatch(/Android/)
  })
})

describe('preguntas frecuentes de la web', () => {
  it('salen de la ayuda de la app, no de una lista aparte', () => {
    const enLaWeb = preguntasParaLaWeb()
    expect(enLaWeb.length).toBeGreaterThanOrEqual(10)
    expect(enLaWeb.length).toBeLessThanOrEqual(AYUDA.length)
    for (const pregunta of enLaWeb) {
      const original = AYUDA.find((a) => a.id === pregunta.id)
      expect(original, `${pregunta.id} no esta en la ayuda de la app`).toBeDefined()
      expect(pregunta.pregunta).toBe(original?.pregunta)
    }
  })

  it('deja fuera las que solo tienen sentido con la app abierta', () => {
    // "Hay una version nueva pero no me aparece" no se entiende en una web que no es la app.
    const ids = preguntasParaLaWeb().map((p) => p.id)
    expect(ids).not.toContain('no-actualiza')
  })

  it('las respuestas van en un solo texto y dicen algo', () => {
    for (const pregunta of preguntasParaLaWeb()) {
      expect(pregunta.respuesta.length, `${pregunta.id} con respuesta corta`).toBeGreaterThan(40)
      expect(pregunta.respuesta).not.toContain('\n')
    }
  })

  it('las respuestas coinciden con las de la app, palabra por palabra', () => {
    for (const pregunta of preguntasParaLaWeb()) {
      const original = AYUDA.find((a) => a.id === pregunta.id)
      expect(pregunta.respuesta).toBe(original?.respuesta.join(' '))
    }
  })
})

describe('enlaces y version que se anuncian', () => {
  it('la direccion de la app es la publicada de verdad', () => {
    expect(ENLACE_APP).toBe('https://oscarmestre2011.github.io/gymlog/')
    expect(ENLACE_WEB).toBe('https://oscarmestre2011.github.io/kairos/')
  })

  it('se anuncia la version mas reciente, no una copiada a mano', () => {
    expect(versionMasReciente()).toBe(VERSIONES[0]?.version)
    expect(versionParaLaWeb()).toBe(VERSIONES[0]?.version)
  })
})
