/**
 * Genera el archivo que alimenta la web de presentacion: `kairos-web/publicar/kairos.json`.
 *
 * FUENTE UNICA: no escribe ni un dato de su cosecha. La version sale de src/lib/changelog.ts y las
 * preguntas frecuentes de src/lib/ayuda.ts, que son las mismas que responde la app por dentro.
 * Asi la web no puede prometer algo distinto de lo que hace la app.
 *
 * Uso:  npm run web
 *
 * Detalle de por que hace falta un comando y no basta con escribir el JSON a mano: la version de la
 * app cambia en cada publicacion. Si el numero estuviera copiado en el HTML, en la web pondria una
 * version vieja y nadie se daria cuenta.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  ENLACE_APP,
  ENLACE_WEB,
  loQueHace,
  preguntasParaLaWeb,
  versionParaLaWeb,
} from '../src/lib/kairos'
import { VERSIONES } from '../src/lib/changelog'

/** Donde se deja el archivo. Se puede cambiar con el primer argumento, para las pruebas. */
const destino = resolve(
  process.argv[2] ?? resolve(process.cwd(), '..', 'kairos-web', 'publicar', 'kairos.json'),
)

const datos = {
  version: versionParaLaWeb(),
  /** Fecha de la version mas reciente, no la de hoy: es la de la app, no la de la web. */
  fecha: VERSIONES[0]?.fecha ?? '',
  enlaceApp: ENLACE_APP,
  enlaceWeb: ENLACE_WEB,
  caracteristicas: loQueHace(),
  preguntas: preguntasParaLaWeb(),
}

// Comprobaciones que evitan publicar una web vacia sin enterarse.
if (datos.caracteristicas.length < 5) {
  throw new Error(`Solo ${datos.caracteristicas.length} caracteristicas: revisa src/lib/kairos.ts`)
}
if (datos.preguntas.length < 10) {
  throw new Error(`Solo ${datos.preguntas.length} preguntas: revisa src/lib/ayuda.ts`)
}
if (!/^\d+\.\d+\.\d+$/.test(datos.version)) {
  throw new Error(`Version rara: ${datos.version}`)
}

mkdirSync(dirname(destino), { recursive: true })
writeFileSync(destino, JSON.stringify(datos, null, 2) + '\n', 'utf8')

console.log(`kairos.json escrito en ${destino}`)
console.log(`  version ${datos.version} (${datos.fecha})`)
console.log(`  ${datos.caracteristicas.length} caracteristicas, ${datos.preguntas.length} preguntas`)
