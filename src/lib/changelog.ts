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
    version: '1.9.0',
    fecha: '2026-09-16',
    titulo: 'Arreglados los estilos que faltaban (ayuda y plan de la semana)',
    cambios: [
      { tipo: 'arreglo', texto: 'La pantalla de Ayuda se veía mal: las preguntas salían como texto suelto, subrayado y difícil de leer. Le faltaban TODOS sus estilos.' },
      { tipo: 'arreglo', texto: 'El resumen de la semana en Rutinas también se quedó sin estilos: ahora cada día es una fila, con lo que toca y los huecos marcados.' },
      { tipo: 'mejora', texto: 'Los accesos de la pantalla de inicio (copia, progreso, ayuda) son filas con su icono y su descripción, en lugar de tres textos blancos sueltos que no se leían como botones.' },
      { tipo: 'mejora', texto: 'El texto de la ayuda se puede leer bien: contraste comprobado (6,6:1 en las preguntas y 4,5:1 en las respuestas) y sin subrayados.' },
    ],
  },
  {
    version: '1.8.0',
    fecha: '2026-09-16',
    titulo: 'Series en metros o por tiempo, y plantilla de cuatro tramos',
    cambios: [
      { tipo: 'mejora', texto: 'Los tramos se pueden apuntar por tiempo, por METROS (400 m, 200 m: lo de pista) o por kilómetros. Antes solo en minutos.' },
      { tipo: 'mejora', texto: 'La plantilla de un entrenamiento por series ahora son CUATRO tramos: calentamiento, serie, recuperación y vuelta a la calma. Antes proponía 14 y había que borrar la mitad antes de empezar.' },
      { tipo: 'mejora', texto: 'El atajo «⚡ + Serie» añade una serie más con su recuperación, en su sitio (antes de la vuelta a la calma).' },
      { tipo: 'mejora', texto: 'Cada tramo indica qué es cada casilla (minutos y km, o metros y minutos), y el total se muestra en la unidad elegida.' },
    ],
  },
  {
    version: '1.7.0',
    fecha: '2026-09-16',
    titulo: 'Cardio por series y fartlek',
    cambios: [
      { tipo: 'nuevo', texto: 'El cardio se puede apuntar por TRAMOS: series (tramos fuertes con recuperaciones) y fartlek (cambios de ritmo). Antes solo había un bloque continuo.' },
      { tipo: 'nuevo', texto: 'Cada tramo lleva sus minutos, sus kilómetros y su intensidad (recuperación, suave, medio, fuerte o a tope), con una marca de color para ver la estructura de un vistazo.' },
      { tipo: 'nuevo', texto: 'Atajos para no empezar de cero: «+ Tramo» y «⚡ +4 series», que añade una estructura de calentamiento, series con recuperaciones y vuelta a la calma.' },
      { tipo: 'nuevo', texto: 'Cada entrenamiento por series dice cuántos tramos fuertes hizo, y el tiempo total sale de sumar los tramos.' },
      { tipo: 'mejora', texto: 'El cardio continuo sigue igual: si no se elige series ni fartlek, todo funciona como antes.' },
    ],
  },
  {
    version: '1.6.0',
    fecha: '2026-09-16',
    titulo: 'La semana en curso en Inicio, y el equilibrio muscular en barras',
    cambios: [
      { tipo: 'nuevo', texto: 'Inicio resume la semana en curso: días entrenados, kilos levantados y kilómetros de cardio, más las semanas seguidas que llevas.' },
      { tipo: 'mejora', texto: 'El volumen por grupo muscular se ve en un gráfico de barras: comparar alturas se lee mejor que una lista, y cada barra lleva su número exacto.' },
    ],
  },
  {
    version: '1.5.0',
    fecha: '2026-09-16',
    titulo: 'Los entrenamientos se programan por días',
    cambios: [
      { tipo: 'nuevo', texto: 'Cada rutina tiene sus días: se eligen al prepararla (con la ✎ de su tarjeta) y pueden ser varios, por ejemplo lunes y jueves.' },
      { tipo: 'nuevo', texto: 'En Inicio aparece el entrenamiento que toca ese día, con sus ejercicios, y se empieza con un toque. Si ese día no hay nada programado, lo dice en vez de proponer otra cosa.' },
      { tipo: 'nuevo', texto: 'En Rutinas hay un resumen de la semana con lo que toca cada día, y avisa de los días repetidos o de las rutinas sin programar.' },
      { tipo: 'mejora', texto: 'La pantalla de Inicio queda solo para entrenar: los totales, las últimas sesiones y el cardio están en sus apartados, no repetidos ahí.' },
      { tipo: 'mejora', texto: 'El botón de compartir la copia ahora comparte de verdad. Antes comprobaba antes de intentarlo y, si la comprobación fallaba, descargaba el archivo: hacía lo mismo que el botón de guardar.' },
      { tipo: 'mejora', texto: 'Los totales generales y las sesiones guardadas (con la opción de borrarlas) están en Progresión.' },
    ],
  },
  {
    version: '1.4.0',
    fecha: '2026-09-16',
    titulo: 'Ayuda, equilibrio muscular y compartir la copia',
    cambios: [
      { tipo: 'nuevo', texto: 'Ayuda e instrucciones: 22 preguntas con respuesta, agrupadas por temas y con buscador. Está en Ajustes, en la pantalla de Inicio y durante el entrenamiento (botón ？).' },
      { tipo: 'nuevo', texto: 'Volumen por grupo muscular: series por semana de cada grupo, para ver el equilibrio. Si un grupo se queda muy por detrás, avisa.' },
      { tipo: 'nuevo', texto: 'Fuerza y cardio juntos, semana a semana, con los días de actividad y los que hiciste las dos cosas.' },
      { tipo: 'nuevo', texto: 'Cada serie te dice si va mejor que la última vez (▲ +2,5 kg) o igual (=), mientras entrenas.' },
      { tipo: 'nuevo', texto: 'Compartir la copia de seguridad desde Inicio, con un toque (WhatsApp, correo, Drive). Así el archivo sale del móvil, que es lo único que protege de perderlo.' },
      { tipo: 'arreglo', texto: 'Progresión se caía entera al abrirla después de entrenar (un fallo técnico al dibujar la pantalla). Arreglado, y con una prueba que lo vigila.' },
    ],
  },
  {
    version: '1.3.1',
    fecha: '2026-09-16',
    titulo: 'Las copias de seguridad, en un solo apartado',
    cambios: [
      { tipo: 'mejora', texto: 'Las copias estaban repartidas en dos apartados («Copia de seguridad» y «Carpeta de copias») que hacían lo mismo con nombres distintos. Ahora es uno solo, ordenado: primero cuándo fue la última copia, luego las dos formas de copiar (el archivo a mano y la carpeta automática) y al final el recordatorio.' },
      { tipo: 'mejora', texto: 'Al guardar en la carpeta, «última copia» se actualiza al momento.' },
    ],
  },
  {
    version: '1.3.0',
    fecha: '2026-09-16',
    titulo: 'Perfil del deportista y arreglo de la carpeta de copias',
    cambios: [
      { tipo: 'nuevo', texto: 'Perfil del deportista: altura, fecha de nacimiento, sexo y cuánto te mueves al día. Con eso calcula tu edad (sola, desde la fecha), el IMC, la relación cintura/altura y una estimación de lo que gastas al día y de la proteína que te toca.' },
      { tipo: 'mejora', texto: 'El peso NO se pide en el perfil: se coge de tu última medición corporal, así no hay dos sitios donde apuntarlo ni pueden contradecirse.' },
      { tipo: 'mejora', texto: 'Si indicas tu porcentaje de grasa, la estimación pasa a usar una fórmula mejor (Katch-McArdle), que parte de tu masa magra.' },
      { tipo: 'mejora', texto: 'La pantalla explica de dónde sale cada número y avisa de que son estimaciones, no un diagnóstico médico.' },
      { tipo: 'arreglo', texto: 'La carpeta de las copias automáticas no se podía recordar en el móvil («no se ha podido recordar la carpeta»). Era un fallo de la app: la carpeta se guardaba de una forma que el navegador del móvil rechaza. Ya funciona, y si vuelve a fallar el aviso dice el motivo.' },
    ],
  },
  {
    version: '1.2.0',
    fecha: '2026-09-16',
    titulo: 'Ejercicios plegables y cambio de ejercicio',
    cambios: [
      { tipo: 'nuevo', texto: 'Los ejercicios ya terminados se pliegan solos, para no tener que bajar por toda la sesión. Se pueden volver a abrir para apuntar una serie de más.' },
      { tipo: 'nuevo', texto: 'Puedes cambiar un ejercicio por otro en mitad del entrenamiento (por ejemplo si la máquina está ocupada), con el botón ⇄ de cada ejercicio.' },
      { tipo: 'mejora', texto: 'Al cambiar de ejercicio NO se pierde nada: las series apuntadas se quedan y se marcan como «Cambiado desde X», para entender después por qué hay series de dos ejercicios.' },
      { tipo: 'arreglo', texto: 'Ya no se pueden poner dos veces el mismo ejercicio en una sesión: los que ya están salen marcados como «ya en la sesión».' },
    ],
  },
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
