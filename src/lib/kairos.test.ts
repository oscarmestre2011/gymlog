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
  APOYO,
  AUTOR,
  CANTIDADES_APOYO,
  ENLACE_APOYO,
  ENLACE_APP,
  ENLACE_WEB,
  enlaceApoyoCon,
  enlaceApoyoSeguro,
  loQueHace,
  opcionesDeApoyo,
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

describe('apoyo voluntario (donaciones)', () => {
  it('el enlace es de PayPal y con https', () => {
    expect(ENLACE_APOYO).toMatch(/^https:\/\/(www\.)?paypal\.me\/[A-Za-z0-9._-]+$/)
    expect(enlaceApoyoSeguro()).toBe(true)
  })

  it('las cantidades sugeridas tienen su enlace bien montado', () => {
    const opciones = opcionesDeApoyo()
    expect(opciones.length).toBeGreaterThanOrEqual(2)
    for (const opcion of opciones) {
      expect(opcion.cantidad).toBeGreaterThan(0)
      expect(opcion.enlace.startsWith(ENLACE_APOYO)).toBe(true)
      expect(opcion.enlace).toContain(String(opcion.cantidad))
    }
  })

  it('no se ofrecen cantidades ridiculas: PayPal se queda casi el 15 % de las pequenas', () => {
    // 2,9 % + 0,35 € por cobro: en 1 € la comision es de un 38 %. No tiene sentido pedirlo.
    for (const cantidad of CANTIDADES_APOYO) {
      expect(cantidad, 'una donacion de menos de 5 € la devora la comision').toBeGreaterThanOrEqual(5)
    }
  })

  it('una cantidad invalida no rompe el enlace', () => {
    // Si alguien llama con basura, se devuelve el enlace pelado: PayPal deja escribirla a mano.
    expect(enlaceApoyoCon(0)).toBe(ENLACE_APOYO)
    expect(enlaceApoyoCon(-5)).toBe(ENLACE_APOYO)
    expect(enlaceApoyoCon(Number.NaN)).toBe(ENLACE_APOYO)
  })

  it('el texto del apoyo dice que NO desbloquea nada', () => {
    /*
     * Esta es la prueba que de verdad importa de las donaciones. Si la donacion desbloqueara algo,
     * dejaria de ser una donacion y seria una venta: con IVA que ingresar y con derecho de
     * desistimiento de 14 dias. Se dice claro, en la app y en la web.
     */
    expect(APOYO.aclaracion).toMatch(/no desbloquea nada/i)
    expect(APOYO.texto).toMatch(/voluntaria/i)
  })

  it('nunca dice que desgrave', () => {
    /*
     * Las donaciones a particulares no desgravan (desgravan a ONG y fundaciones). Decir lo
     * contrario seria publicidad engañosa, y en la app de un profesor seria ademas un mal consejo.
     *
     * Ojo con la forma de comprobarlo: la palabra "desgrava" SI puede aparecer, pero solo negada
     * ("tampoco desgrava..."). Prohibir la palabra a secas seria prohibir la advertencia correcta,
     * que es justo lo que hay que decir.
     */
    // Las tres formas validas de negarlo: "no desgrava", "nunca desgrava", "tampoco desgrava".
    expect(APOYO.aclaracion).toMatch(/\b(no|nunca|tampoco)\s+(?:te\s+)?desgrav/i)
    const frases = APOYO.aclaracion.split(/(?<=\.)\s+/)
    for (const frase of frases) {
      if (!/desgrav/i.test(frase)) continue
      expect(frase, `frase que promete desgravacion: "${frase}"`).toMatch(
        /\b(no|nunca|tampoco)\s+desgrav/i,
      )
    }
  })

  it('no se promete nada a cambio', () => {
    const todo = `${APOYO.texto} ${APOYO.aclaracion}`.toLowerCase()
    for (const promesa of ['acceso', 'soporte prioritario', 'funciones extra', 'versión completa']) {
      expect(todo, `el apoyo no puede prometer "${promesa}"`).not.toContain(promesa)
    }
  })

  it('el texto del apoyo es el mismo que publica la web', () => {
    // Si alguien cambia uno y no el otro, la app y la web dirian cosas distintas de lo mismo.
    expect(APOYO.titulo).toBe('Kairós es gratis, y lo será')
    expect(opcionesDeApoyo().length).toBe(CANTIDADES_APOYO.length)
  })
})
describe('quien ha hecho la app', () => {
  it('la firma lleva nombre y profesion', () => {
    expect(AUTOR.nombre).toBe('Óscar Muela')
    expect(AUTOR.profesion).toBe('maestro de Educación Física')
    expect(AUTOR.firma).toContain(AUTOR.nombre)
    expect(AUTOR.firma).toContain('Educación Física')
  })

  it('el apellido esta bien escrito: es Muela, no Mestre', () => {
    /*
     * Mestre se colo en la web (venia de la direccion de correo oscarmestre2011) y estuvo publicado
     * un tiempo.
     *
     * OJO con la direccion del repositorio: `oscarmestre2011.github.io/gymlog` se compila DENTRO de
     * la app (el aviso de version nueva la lleva), asi que buscarla en el archivo compilado daria un
     * falso positivo. Por eso se quita antes de comprobar, en lugar de prohibir la palabra.
     */
    const SIN_DIRECCIONES = /oscarmestre2011\.github\.io|github\.com\/oscarmestre2011/g
    const limpio = JSON.stringify(AUTOR).replace(SIN_DIRECCIONES, '')
    expect(limpio).not.toMatch(/Mestre/i)
    expect(AUTOR.firma).not.toMatch(/Mestre/i)
  })

  it('la profesion se dice entera, no abreviada', () => {
    // "profesor" o "EF" a secas no dicen lo que hace. Y es justo lo que diferencia la app.
    expect(AUTOR.profesion).toMatch(/maestro/i)
    expect(AUTOR.profesion).toMatch(/Educación Física/i)
  })
})

describe('enlaces y version que se anuncian', () => {
  it('la direccion de la app es la publicada de verdad', () => {
    expect(ENLACE_APP).toBe('https://kairosentrena.com/app/')
    expect(ENLACE_WEB).toBe('https://kairosentrena.com/')
  })

  it('se anuncia la version mas reciente, no una copiada a mano', () => {
    expect(versionMasReciente()).toBe(VERSIONES[0]?.version)
    expect(versionParaLaWeb()).toBe(VERSIONES[0]?.version)
  })
})
