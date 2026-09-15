/*
 * Genera CHANGELOG.md a partir de src/lib/changelog.ts.
 *
 * El historial vive en UN solo sitio (src/lib/changelog.ts) y de ahi salen los tres lugares
 * donde se ve: la pantalla de Novedades, el historial de Ajustes y este archivo. Asi no hay
 * dos listas que puedan contradecirse.
 *
 * El fuente esta en TypeScript y no se puede importar directamente desde Node, asi que se
 * convierte a JavaScript en memoria con esbuild (que ya viene con el proyecto) y se ejecuta.
 *
 * Uso:  node scripts/generar-changelog.mjs
 */
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..')
const ORIGEN = join(raiz, 'src', 'lib', 'changelog.ts')
const DESTINO = join(raiz, 'CHANGELOG.md')

const { outputFiles } = await build({
  entryPoints: [ORIGEN],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
})

const codigo = outputFiles[0].text
// Se ejecuta el modulo ya convertido y se le pide el texto del historial.
const modulo = await import(`data:text/javascript;base64,${Buffer.from(codigo, 'utf8').toString('base64')}`)

if (typeof modulo.changelogEnTexto !== 'function') {
  console.error('No se ha encontrado changelogEnTexto en src/lib/changelog.ts')
  process.exit(1)
}

const texto = modulo.changelogEnTexto()
const anterior = await readFile(DESTINO, 'utf8').catch(() => null)

if (anterior === texto) {
  console.log('CHANGELOG.md ya estaba al dia')
} else {
  await writeFile(DESTINO, texto, 'utf8')
  const cuantas = modulo.VERSIONES.length
  console.log(`CHANGELOG.md actualizado con ${cuantas} versiones (la ultima: ${modulo.VERSIONES[0].version})`)
}
