/**
 * Registro de actualizaciones de Kairós.
 *
 * FUENTE UNICA: este archivo. De aqui salen los tres sitios donde se ve el historial:
 *  - la pantalla "Novedades", que se abre desde el aviso de version nueva,
 *  - Ajustes -> Informacion, con el historial completo,
 *  - el CHANGELOG.md del repositorio, que se genera con `npm run changelog`.
 *
 * Asi no hay dos listas que puedan contradecirse (que es exactamente el problema que tuvimos
 * con las versiones de la cache del service worker).
 *
 * Como anadir una version nueva: se pone ARRIBA, con su fecha y lo que cambio contado para
 * quien usa la app (que nota, no que se toco por dentro).
 */

/** Un cambio concreto dentro de una version. */
export interface CambioVersion {
  /** 'nuevo' | 'mejora' | 'arreglo' */
  tipo: 'nuevo' | 'mejora' | 'arreglo'
  texto: string
}

export interface VersionApp {
  version: string
  /** Fecha en formato YYYY-MM-DD. */
  fecha: string
  /** Titulo corto de la version. */
  titulo: string
  cambios: CambioVersion[]
}

/**
 * Versiones, de la mas nueva a la mas antigua.
 *
 * AVISO: de la 1.0.0 a la 1.0.12 el detalle esta reconstruido a partir de los mensajes de
 * commit del repositorio, no de un registro que se llevara entonces. Conviene revisarlo.
 */
export const VERSIONES: VersionApp[] = [
  {
    version: '1.1.1',
    fecha: '2026-09-16',
    titulo: 'Arreglada la copia en carpeta',
    cambios: [
      { tipo: 'arreglo', texto: 'La copia en carpeta no guardaba en algunos móviles: al elegir la carpeta se concedía el permiso, pero al ir a guardar ya no estaba y la app se retiraba sin pedirlo. Ahora lo pide en el momento de guardar (y al elegir la carpeta), y funciona.' },
      { tipo: 'arreglo', texto: 'Si algo falla al guardar, la app dice QUÉ ha fallado (permiso, carpeta perdida, sin espacio) en lugar de un mensaje genérico.' },
      { tipo: 'mejora', texto: 'Los avisos de error duran más en pantalla: antes desaparecían antes de que diera tiempo a leerlos.' },
    ],
  },
  {
    version: '1.1.0',
    fecha: '2026-09-16',
    titulo: 'Registro de actualizaciones y copias automaticas',
    cambios: [
      { tipo: 'nuevo', texto: 'Pantalla de Novedades: al actualizar la app te cuenta qué ha cambiado.' },
      { tipo: 'nuevo', texto: 'Historial completo de versiones en Ajustes.' },
      { tipo: 'nuevo', texto: 'Copia de seguridad automática en una carpeta del móvil (Android).' },
      { tipo: 'arreglo', texto: 'El aviso de «versión nueva» ya sale cuando corresponde. Antes no aparecía nunca.' },
      { tipo: 'arreglo', texto: 'La altura de las medidas ya no viene puesta: cada persona pone la suya, y sin ella no se calculan el IMC ni el indicador cintura/altura (antes se usaba la de otra persona y daba números falsos).' },
      { tipo: 'mejora', texto: 'El aviso de versión nueva deja hueco a la cabecera en lugar de taparla, y mide su propio alto para no descuadrarse.' },
    ],
  },
  {
    version: '1.0.16',
    fecha: '2026-09-15',
    titulo: 'Medidas corporales',
    cambios: [
      { tipo: 'nuevo', texto: 'Medidas corporales: peso, abdomen, pecho y muslo, con notas.' },
      { tipo: 'nuevo', texto: 'IMC, relación cintura/altura y aviso del perímetro abdominal, con sus umbrales de riesgo.' },
      { tipo: 'nuevo', texto: 'Gráficas de evolución del peso y del abdomen, y diferencia desde el primer registro.' },
      { tipo: 'nuevo', texto: 'Aviso cada dos semanas de que toca medirse.' },
      { tipo: 'mejora', texto: 'Las medidas entran en la copia de seguridad.' },
    ],
  },
  {
    version: '1.0.15',
    fecha: '2026-09-15',
    titulo: 'Superseries',
    cambios: [
      { tipo: 'nuevo', texto: 'Superseries: encadena dos o más ejercicios y se apuntan alternando.' },
      { tipo: 'nuevo', texto: 'El descanso se ajusta solo: corto entre ejercicios de la ronda y completo al acabar la ronda.' },
      { tipo: 'nuevo', texto: 'Etiquetas A1, A2 para saber en qué punto de la superserie estás.' },
    ],
  },
  {
    version: '1.0.14',
    fecha: '2026-09-15',
    titulo: 'Pantalla encendida y aviso más largo',
    cambios: [
      { tipo: 'nuevo', texto: 'La pantalla no se apaga mientras usas la app (desactivable en Ajustes).' },
      { tipo: 'mejora', texto: 'El aviso del descanso es más largo y repetido, y se elige entre corto, largo o muy largo.' },
      { tipo: 'mejora', texto: 'La barra del descanso parpadea mientras suena, para verlo aunque no se oiga.' },
      { tipo: 'arreglo', texto: 'Guardar un ajuste no se aplicaba hasta recargar la app.' },
      { tipo: 'arreglo', texto: 'El cronómetro se ponía al día al volver a la app después de apagarse la pantalla.' },
    ],
  },
  {
    version: '1.0.13',
    fecha: '2026-09-15',
    titulo: 'Biblioteca de ejercicios',
    cambios: [
      { tipo: 'nuevo', texto: 'Pestaña Ejercicios: ver, buscar, crear, editar y borrar ejercicios.' },
      { tipo: 'nuevo', texto: 'Al crear un ejercicio se indica su descripción, la parte del cuerpo que trabaja y el material.' },
      { tipo: 'nuevo', texto: 'La descripción se ve al elegir el ejercicio y mientras entrenas.' },
    ],
  },
  {
    version: '1.0.12',
    fecha: '2026-09-14',
    titulo: 'Recordatorio de copia de seguridad',
    cambios: [
      { tipo: 'nuevo', texto: 'La app recuerda hacer copia de seguridad cada cierto tiempo.' },
      { tipo: 'nuevo', texto: 'Aviso claro de que los datos viven solo en el móvil y qué pasa si se borran.' },
    ],
  },
  {
    version: '1.0.11',
    fecha: '2026-09-14',
    titulo: 'Formatos coherentes',
    cambios: [
      { tipo: 'mejora', texto: 'Los totales de cardio y el volumen se muestran igual en toda la app.' },
      { tipo: 'mejora', texto: 'Los miles se separan con punto (1.340 kg) como es costumbre en español.' },
    ],
  },
  {
    version: '1.0.10',
    fecha: '2026-09-14',
    titulo: 'Actualizaciones fiables',
    cambios: [
      { tipo: 'arreglo', texto: 'La app ya se actualiza en el móvil al volver a abrirla.' },
      { tipo: 'arreglo', texto: 'Ya no se queda una copia antigua guardada por debajo.' },
    ],
  },
  {
    version: '1.0.9',
    fecha: '2026-09-14',
    titulo: 'Totales de cardio',
    cambios: [
      { tipo: 'mejora', texto: 'Totales de cardio exactos, con total semanal y mensual de kilómetros y tiempo.' },
    ],
  },
  {
    version: '1.0.8',
    fecha: '2026-09-14',
    titulo: 'Sin referencias al podcast',
    cambios: [
      { tipo: 'mejora', texto: 'La app deja de mencionar el podcast: es solo una herramienta de entrenamiento.' },
    ],
  },
  {
    version: '1.0.7',
    fecha: '2026-09-14',
    titulo: 'Nombre e identidad: Kairós',
    cambios: [
      { tipo: 'nuevo', texto: 'La app pasa a llamarse Kairós, con su emblema en el icono y en la cabecera.' },
    ],
  },
  {
    version: '1.0.6',
    fecha: '2026-09-14',
    titulo: 'Bienvenida',
    cambios: [
      { tipo: 'nuevo', texto: 'Pantalla de bienvenida la primera vez, explicando de qué va la app.' },
      { tipo: 'mejora', texto: 'Cada dispositivo guarda sus propios datos, sin mezclarse con los de nadie.' },
    ],
  },
  {
    version: '1.0.5',
    fecha: '2026-09-14',
    titulo: 'Comprobada en Safari',
    cambios: [
      { tipo: 'mejora', texto: 'Aviso visual al terminar el descanso, porque en iPhone no hay sonido ni vibración.' },
      { tipo: 'mejora', texto: 'Revisada y ajustada en Safari (iPhone).' },
    ],
  },
  {
    version: '1.0.4',
    fecha: '2026-09-14',
    titulo: 'Decimales con coma',
    cambios: [
      { tipo: 'arreglo', texto: 'Se pueden escribir decimales con coma (42,5 kg) sin que se conviertan en otra cosa.' },
    ],
  },
  {
    version: '1.0.3',
    fecha: '2026-09-14',
    titulo: 'Nunca una pantalla en blanco',
    cambios: [
      { tipo: 'arreglo', texto: 'Si algo falla al abrir, la app lo explica y ofrece soluciones en lugar de quedarse en negro.' },
      { tipo: 'mejora', texto: 'Comprobado que actualizar la app no pierde ningún entrenamiento.' },
    ],
  },
  {
    version: '1.0.2',
    fecha: '2026-09-14',
    titulo: 'Instalación en el móvil',
    cambios: [
      { tipo: 'mejora', texto: 'Instrucciones para añadir la app a la pantalla de inicio en Android.' },
    ],
  },
  {
    version: '1.0.1',
    fecha: '2026-09-14',
    titulo: 'Primer aviso de versión nueva',
    cambios: [
      { tipo: 'nuevo', texto: 'Aviso cuando hay una versión nueva de la app.' },
    ],
  },
  {
    version: '1.0.0',
    fecha: '2026-09-14',
    titulo: 'Primera versión',
    cambios: [
      { tipo: 'nuevo', texto: 'Registro de entrenamientos: series con peso, repeticiones y RIR.' },
      { tipo: 'nuevo', texto: 'Rutinas reutilizables con el programa A/B/C.' },
      { tipo: 'nuevo', texto: 'Progresión por ejercicio e historial.' },
      { tipo: 'nuevo', texto: 'Cronómetro de descanso y registro de cardio.' },
      { tipo: 'nuevo', texto: 'Funciona sin conexión y sin cuentas: los datos se quedan en tu móvil.' },
    ],
  },
]

/** La version mas reciente del registro. */
export function versionMasReciente(): string {
  return VERSIONES[0]?.version ?? '0.0.0'
}

/**
 * Novedades de una version concreta, o de la mas reciente si no se indica otra.
 * Devuelve null si esa version no esta en el registro.
 */
export function novedadesDe(version?: string): VersionApp | null {
  if (!version) return VERSIONES[0] ?? null
  return VERSIONES.find((v) => v.version === version) ?? null
}

/** Etiqueta legible del tipo de cambio. */
export function etiquetaDeTipo(tipo: CambioVersion['tipo']): string {
  if (tipo === 'nuevo') return 'Nuevo'
  if (tipo === 'mejora') return 'Mejorado'
  return 'Arreglado'
}

/** Icono del tipo de cambio. */
export function iconoDeTipo(tipo: CambioVersion['tipo']): string {
  if (tipo === 'nuevo') return '＋'
  if (tipo === 'mejora') return '↑'
  return '✓'
}

/** El registro en texto, para el CHANGELOG.md del repositorio. */
export function changelogEnTexto(): string {
  const lineas = [
    '# Historial de versiones de Kairós',
    '',
    '> Generado desde `src/lib/changelog.ts` con `npm run changelog`.',
    '> No editar a mano: los cambios se hacen en ese archivo.',
    '',
  ]
  for (const v of VERSIONES) {
    lineas.push(`## ${v.version} — ${v.titulo}`)
    lineas.push('')
    lineas.push(`_${v.fecha}_`)
    lineas.push('')
    for (const c of v.cambios) {
      lineas.push(`- **${etiquetaDeTipo(c.tipo)}:** ${c.texto}`)
    }
    lineas.push('')
  }
  return lineas.join('\n')
}
