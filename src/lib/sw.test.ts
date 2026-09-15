/*
 * Pruebas de la clave de cache del service worker.
 *
 * IMPORTANTE: el service worker se carga aqui con `new Function` en lugar de `import`, porque
 * en el entorno de pruebas `self` no existe (el sw.js se apoya en `self.addEventListener`) y
 * un import fallaria. Ademas asi se ejecuta el ARCHIVO REAL, no una copia: si alguien cambia
 * `claveDe`, estas pruebas lo notan.
 *
 * Lo que se comprueba es justo el fallo que tuvo la app: la clave de cache NO puede perder lo
 * que va despues de la interrogacion. La app pide `index.html?comprobacion=123` para saber si
 * hay version nueva; si al normalizar la direccion se borrara el parametro, esa peticion
 * acabaria devolviendo la copia guardada en lugar de ir al servidor, la app compararia la copia
 * consigo misma y el aviso de "version nueva" no saldria nunca.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const fuente = readFileSync(join(aqui, '..', '..', 'public', 'sw.js'), 'utf8')

/** Carga el codigo del service worker y devuelve sus funciones. */
function cargarServiceWorker() {
  const contexto = { self: { addEventListener: () => undefined }, caches: {}, fetch: () => undefined }
  const fabrica = new Function(
    'self',
    'caches',
    'fetch',
    `${fuente}\nreturn { claveDe, VERSION }`,
  )
  return fabrica(contexto.self, contexto.caches, contexto.fetch)
}

/** Crea un objeto parecido a un Request, que es lo unico que usa la funcion. */
const peticion = (url: string) => ({ url, method: 'GET' })

describe('clave de cache del service worker', () => {
  it('la version de la cache ha subido tras el arreglo', () => {
    const { VERSION } = cargarServiceWorker()
    // v8: la clave incluye lo que va despues de la interrogacion (desde v7) y las
    // comprobaciones de version ya no se guardan (desde v8). Con v6 el aviso no salia nunca.
    expect(VERSION).toBe('v8')
  })

  it('CONSERVA el parametro de la direccion', () => {
    /*
     * Esta es LA prueba del fallo: la comprobacion de version nueva.
     * Si esta prueba falla, el aviso de "hay una version nueva" dejara de salir.
     */
    const { claveDe } = cargarServiceWorker()
    const clave = claveDe(peticion('https://ejemplo.com/gymlog/index.html?comprobacion=123'))
    expect(clave.url).toBe('https://ejemplo.com/gymlog/index.html?comprobacion=123')
  })

  it('dos comprobaciones distintas dan claves distintas', () => {
    // El parametro es distinto en cada comprobacion, precisamente para que no coincida con
    // ninguna copia guardada.
    const { claveDe } = cargarServiceWorker()
    const una = claveDe(peticion('https://ejemplo.com/gymlog/index.html?comprobacion=111'))
    const otra = claveDe(peticion('https://ejemplo.com/gymlog/index.html?comprobacion=222'))
    expect(una.url).not.toBe(otra.url)
  })

  it('la misma direccion da siempre la misma clave', () => {
    // Lo contrario tambien importa: sin esto la cache no acertaria nunca y se llenaria de copias.
    const { claveDe } = cargarServiceWorker()
    const a = claveDe(peticion('https://ejemplo.com/gymlog/index.html'))
    const b = claveDe(peticion('https://ejemplo.com/gymlog/index.html'))
    expect(a.url).toBe(b.url)
  })

  it('la direccion con parametro NO coincide con la de sin parametro', () => {
    // Si coincidieran, la comprobacion de version nueva volveria a recibir la copia guardada.
    const { claveDe } = cargarServiceWorker()
    const conParametro = claveDe(peticion('https://ejemplo.com/gymlog/index.html?comprobacion=1'))
    const sinParametro = claveDe(peticion('https://ejemplo.com/gymlog/index.html'))
    expect(conParametro.url).not.toBe(sinParametro.url)
  })

  it('quita el resto de la direccion (origen repetido, fragmentos)', () => {
    // La clave es el origen mas la ruta mas la consulta: ni credenciales ni fragmentos.
    const { claveDe } = cargarServiceWorker()
    const clave = claveDe(peticion('https://ejemplo.com/gymlog/assets/index-abc.js?v=2#trozo'))
    expect(clave.url).toBe('https://ejemplo.com/gymlog/assets/index-abc.js?v=2')
  })

  it('funciona con la app en una subcarpeta (como GitHub Pages)', () => {
    const { claveDe } = cargarServiceWorker()
    const clave = claveDe(peticion('https://usuario.github.io/gymlog/'))
    expect(clave.url).toBe('https://usuario.github.io/gymlog/')
  })
})
