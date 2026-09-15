/**
 * Pruebas del registro de actualizaciones.
 *
 * Lo que se protege aqui es que el registro no se descuadre solo: que cada version aparezca una
 * vez, que este ordenado, que la version mas nueva sea la que esta publicada, y que
 * CHANGELOG.md se pueda generar. Es facil que un registro se abandone si nada avisa de que esta
 * mal.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  VERSIONES,
  changelogEnTexto,
  etiquetaDeTipo,
  iconoDeTipo,
  novedadesDe,
  versionMasReciente,
} from './changelog'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..', '..')

describe('registro de actualizaciones', () => {
  it('la version mas nueva del registro es la que esta publicada', () => {
    /*
     * Se lee la version que muestra la app en Ajustes. Si al publicar una version nueva se
     * olvida anadirla al registro, esta prueba avisa: es el error mas facil de cometer.
     */
    const ajustes = readFileSync(join(raiz, 'src', 'screens', 'SettingsScreen.tsx'), 'utf8')
    const publicada = /<span className="v">(\d+\.\d+\.\d+)<\/span>/.exec(ajustes)?.[1]
    expect(publicada).toBeTruthy()
    expect(
      versionMasReciente(),
      `la app dice ser la ${publicada} pero el registro acaba en la ${versionMasReciente()}`,
    ).toBe(publicada)
  })

  it('cada version aparece una sola vez', () => {
    const versiones = VERSIONES.map((v) => v.version)
    expect(new Set(versiones).size).toBe(versiones.length)
  })

  it('estan ordenadas de la mas nueva a la mas antigua', () => {
    const fechas = VERSIONES.map((v) => v.fecha)
    const ordenadas = [...fechas].sort().reverse()
    expect(fechas).toEqual(ordenadas)
  })

  it('todas las versiones tienen fecha valida y titulo', () => {
    for (const v of VERSIONES) {
      expect(v.fecha, `${v.version} sin fecha valida`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(v.titulo.length, `${v.version} sin titulo`).toBeGreaterThan(3)
      expect(v.cambios.length, `${v.version} sin cambios`).toBeGreaterThan(0)
    }
  })

  it('todos los cambios son de un tipo conocido y se explican', () => {
    for (const v of VERSIONES) {
      for (const c of v.cambios) {
        expect(['nuevo', 'mejora', 'arreglo']).toContain(c.tipo)
        expect(c.texto.length, `${v.version}: cambio demasiado corto`).toBeGreaterThan(8)
      }
    }
  })

  it('las versiones estan en formato correcto', () => {
    for (const v of VERSIONES) {
      expect(v.version, `${v.version} no parece una version`).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it('hay historial desde la primera version', () => {
    // Se reconstruyo desde los commits: si falta la 1.0.0 es que se perdio el origen.
    expect(VERSIONES.some((v) => v.version === '1.0.0')).toBe(true)
    expect(VERSIONES.length).toBeGreaterThanOrEqual(15)
  })

  it('encuentra las novedades de una version concreta', () => {
    const novedades = novedadesDe('1.0.15')
    expect(novedades?.titulo).toBe('Superseries')
    expect(novedades?.cambios.some((c) => /superserie/i.test(c.texto))).toBe(true)
  })

  it('sin indicar version devuelve la mas reciente', () => {
    expect(novedadesDe()?.version).toBe(versionMasRecibiente())
  })

  it('una version que no existe no inventa nada', () => {
    expect(novedadesDe('9.9.9')).toBeNull()
  })

  it('las etiquetas de tipo son legibles', () => {
    expect(etiquetaDeTipo('nuevo')).toBe('Nuevo')
    expect(etiquetaDeTipo('mejora')).toBe('Mejorado')
    expect(etiquetaDeTipo('arreglo')).toBe('Arreglado')
    expect(iconoDeTipo('nuevo')).toBeTruthy()
    expect(iconoDeTipo('arreglo')).toBeTruthy()
  })

  it('el texto del changelog incluye todas las versiones', () => {
    const texto = changelogEnTexto()
    for (const v of VERSIONES) {
      expect(texto).toContain(`## ${v.version}`)
    }
    expect(texto).toContain(`## ${versionMasReciente()}`)
  })
})

/** Alias para que la prueba se lea mejor. */
function versionMasRecibiente(): string {
  return versionMasReciente()
}
