/*
 * Comprueba que TODAS las clases que usa la app tienen estilo (o estan justificadas).
 *
 * Motivo: varias inserciones de CSS fallaron en silencio (el texto que usaba de ancla no existia en
 * el archivo), asi que hubo pantallas que se dibujaron enteras con los estilos del navegador. En la
 * ayuda eso se veia como preguntas subrayadas y dificiles de leer.
 *
 * Esta prueba saca las clases usadas en el codigo y comprueba que aparecen en el CSS. Las que no son
 * visuales (banderas de estado, clases que solo sirven para las pruebas) se listan aparte.
 *
 * Uso:  node scripts/comprobar-clases-css.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const raiz = join(here, '..')
const src = join(raiz, 'src')

/** Clases que NO tienen (ni necesitan) estilo propio. */
const SIN_ESTILO = new Set([
  // Estados que solo marcan si algo esta abierto, activo o vacio: el estilo lo pone el contenedor.
  'abierta',
  'active',
  'done',
  'warmup',
  'up',
  'down',
  'vacio',
  'grow',
  'row',
  'wrap',
  'num',
  'main',
  'title',
  'meta',
  'tiny',
  'small',
  'muted',
  'good',
  'warn',
  'danger',
  'card',
  'screen',
  'app',
  'empty',
  'big',
  'btn',
  'chip',
  'input',
  'field',
  'list',
  'list-item',
  'badge',
  'stat',
  'stats',
  'kv',
  'k',
  'v',
  'clock',
  'idx',
  'actions',
  'target',
  'name',
  'section-head',
  'card-title',
  'grid-2',
  'grid-3',
  'modal',
  'topbar',
  'nav',
  'spinner',
  'overlay',
  'overlay-head',
  'link-button',
  // Valores que se pasan como texto, no clases: el chip "Todas" y el tipo de aviso "largo".
  'Todas',
  'largo',
  // Prefijo que se completa en el codigo: nivel-1, nivel-2... (si, se generan en una plantilla).
  'nivel-',
])

/** Recorre los archivos del codigo. */
function archivos(dir) {
  const salida = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta))
    else if (/\.(ts|tsx)$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

/** Saca las clases de los atributos className (incluidas las de plantilla). */
function clasesDe(texto) {
  const encontradas = new Set()

  // className="a b c"
  for (const m of texto.matchAll(/className="([^"{}]+)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) encontradas.add(c)
  }

  /*
   * Plantillas: className={`a ${cond ? 'b' : ''}`}
   *
   * Lo que va dentro de ${...} es CODIGO, no nombres de clase, asi que se quita antes de partir. Si
   * no se quita, el extractor saca cosas como "settingsactivity" y llena la lista de ruido.
   */
  for (const m of texto.matchAll(/className=\{`([^`]+)`\}/g)) {
    const soloTexto = m[1].replace(/\$\{[^}]*\}/g, ' ')
    for (const c of soloTexto.split(/\s+/)) {
      if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c)) encontradas.add(c)
    }
    // Y las cadenas de dentro de las condiciones: ? 'a' : 'b'
    for (const s of m[1].matchAll(/'([^']+)'/g)) {
      for (const c of s[1].split(/\s+/)) {
        if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c)) encontradas.add(c)
      }
    }
  }

  return encontradas
}

const css = readFileSync(join(src, 'styles.css'), 'utf8')
const usadas = new Set()
for (const archivo of archivos(src)) {
  if (archivo.includes('.test.')) continue
  for (const c of clasesDe(readFileSync(archivo, 'utf8'))) usadas.add(c)
}

const sinRegla = [...usadas]
  .filter((c) => !SIN_ESTILO.has(c))
  .filter((c) => !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![a-zA-Z0-9_-])`).test(css))
  .sort()

console.log(`clases usadas en el codigo: ${usadas.size}`)
console.log(`de ellas, sin regla en el CSS: ${sinRegla.length}`)
if (sinRegla.length > 0) {
  console.log('\nFaltan estilos para:')
  for (const c of sinRegla) console.log(`  - ${c}`)
  process.exit(1)
}
console.log('\nTodas las clases visuales tienen su estilo.')
