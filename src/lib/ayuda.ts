/**
 * Preguntas frecuentes e instrucciones.
 *
 * FUENTE UNICA: de aqui salen la pantalla de Ayuda y las pruebas. Si hay que anadir algo, se
 * anade aqui y aparece en los dos sitios.
 *
 * Como escribir una pregunta nueva:
 *  - En el idioma del usuario, tal y como la preguntaria ("¿Por que no me suena el aviso?"), no
 *    como la diria un programador ("Gestion de notificaciones").
 *  - La respuesta empieza por lo que hay que hacer, no por la explicacion.
 *  - Si algo no se puede hacer, se dice claramente. Prometer lo que no hay es peor que no
 *    contestar.
 */

export type CategoriaAyuda =
  | 'empezar'
  | 'entrenar'
  | 'rutinas'
  | 'progreso'
  | 'datos'
  | 'problemas'

export interface PreguntaAyuda {
  id: string
  categoria: CategoriaAyuda
  pregunta: string
  /** Respuesta, en parrafos o pasos. */
  respuesta: string[]
  /** Palabras extra para que la busqueda la encuentre (sinonimos, nombres de botones). */
  claves?: string[]
}

export const CATEGORIAS: { id: CategoriaAyuda; titulo: string; icono: string }[] = [
  { id: 'empezar', titulo: 'Para empezar', icono: '🚀' },
  { id: 'entrenar', titulo: 'Mientras entrenas', icono: '🏋️' },
  { id: 'rutinas', titulo: 'Rutinas y ejercicios', icono: '📋' },
  { id: 'progreso', titulo: 'Tu progreso y medidas', icono: '📈' },
  { id: 'datos', titulo: 'Tus datos y copias', icono: '💾' },
  { id: 'problemas', titulo: 'Si algo va mal', icono: '🔧' },
]

export const AYUDA: PreguntaAyuda[] = [
  /* ------------------------------ para empezar ----------------------------- */
  {
    id: 'instalar',
    categoria: 'empezar',
    pregunta: '¿Cómo la pongo en el móvil como una app?',
    respuesta: [
      'En Android: abre el enlace en Chrome, toca el menú de los tres puntos y elige «Añadir a pantalla de inicio». Aparecerá el icono de Kairós como cualquier otra app.',
      'En iPhone: abre el enlace en Safari, toca el botón de compartir y elige «Añadir a pantalla de inicio». Tiene que ser Safari; desde Chrome en iPhone esa opción no aparece.',
      'Una vez instalada, se abre a pantalla completa y funciona sin conexión: no hace falta tener datos en el gimnasio.',
    ],
    claves: ['instalar', 'icono', 'pantalla de inicio', 'android', 'iphone', 'descargar'],
  },
  {
    id: 'cuenta',
    categoria: 'empezar',
    pregunta: '¿Tengo que crear una cuenta?',
    respuesta: [
      'No. No hay cuentas, ni registro, ni contraseña: abres y ya está.',
      'Tampoco hay nada que pagar ni anuncios. Y nadie más ve tus datos, porque no salen de tu móvil.',
    ],
    claves: ['cuenta', 'registro', 'contraseña', 'pagar', 'gratis', 'anuncios'],
  },
  {
    id: 'primera-sesion',
    categoria: 'empezar',
    pregunta: '¿Cómo apunto mi primer entrenamiento?',
    respuesta: [
      'En la pantalla de Inicio, toca «Empezar entrenamiento».',
      'Elige una de las rutinas que vienen hechas (Fuerza A, B o C) o empieza sin rutina.',
      'En cada ejercicio, escribe el peso y las repeticiones y toca el botón ✓ para guardar la serie. El cronómetro de descanso arranca solo.',
      'Al terminar, toca «Terminar y guardar». Ahí puedes anotar cómo te has sentido.',
    ],
    claves: ['empezar', 'sesión', 'entrenamiento', 'primera vez', 'apuntar'],
  },
  {
    id: 'rutinas-hechas',
    categoria: 'empezar',
    pregunta: '¿Qué rutinas vienen ya puestas?',
    respuesta: [
      'Vienen tres: Fuerza A (empuje y pierna), Fuerza B (tirón y pierna) y Fuerza C (cuerpo completo), con ejercicios, series y descansos ya configurados.',
      'Puedes usarlas tal cual, cambiarlas a tu gusto o crear las tuyas desde cero en la pestaña Rutinas.',
    ],
    claves: ['rutinas', 'vienen', 'por defecto', 'A', 'B', 'C', 'ejemplo'],
  },

  /* ---------------------------- mientras entrenas -------------------------- */
  {
    id: 'apuntar-serie',
    categoria: 'entrenar',
    pregunta: '¿Cómo apunto una serie? ¿Y el RIR?',
    respuesta: [
      'Escribe el peso y las repeticiones y toca el ✓. Aparece como serie hecha y arranca el descanso.',
      'El RIR es cuántas repeticiones te habrían quedado en reserva: si terminaste la serie y podrías haber hecho 2 más, es RIR 2. Es opcional, pero ayuda a saber si fuiste al límite.',
      'Con «+ aproximación» apuntas una serie de calentamiento: no cuenta para el volumen ni para los récords.',
    ],
    claves: ['serie', 'rir', 'peso', 'repeticiones', 'aproximación', 'calentamiento'],
  },
  {
    id: 'descanso',
    categoria: 'entrenar',
    pregunta: '¿Cómo funciona el cronómetro de descanso?',
    respuesta: [
      'Arranca solo al guardar una serie, con el descanso que tenga ese ejercicio. Puedes añadir 30 segundos con «+30s» o pararlo con la ✕.',
      'Al terminar avisa con un sonido repetido y la barra parpadeando en verde. El parpadeo está porque en iPhone el sonido no siempre funciona: así se ve aunque no se oiga.',
      'En Ajustes puedes elegir cuánto dura el aviso (corto, largo o muy largo) y si quieres que la pantalla no se apague mientras entrenas. Si se apaga, el móvil duerme la app y el aviso no suena hasta que vuelvas a encenderla.',
    ],
    claves: ['descanso', 'cronómetro', 'temporizador', 'sonido', 'aviso', 'alarma', 'vibración'],
  },
  {
    id: 'cambiar-ejercicio',
    categoria: 'entrenar',
    pregunta: 'La máquina está ocupada, ¿puedo cambiar el ejercicio?',
    respuesta: [
      'Sí. En cada ejercicio hay un botón ⇄ para cambiarlo por otro en mitad del entrenamiento.',
      'Lo que ya habías apuntado NO se pierde: esas series se quedan con el nombre del ejercicio que estabas haciendo y se marcan como «Cambiado desde…», para que después se entienda.',
      'El hueco en la rutina se conserva: mismas series, repeticiones y descanso.',
    ],
    claves: ['cambiar', 'sustituir', 'ocupada', 'máquina', 'otro ejercicio', 'flecha'],
  },
  {
    id: 'plegar',
    categoria: 'entrenar',
    pregunta: '¿Por qué se cierran los ejercicios que ya he hecho?',
    respuesta: [
      'Al completar las series previstas, el ejercicio se pliega solo para que no tengas que bajar por toda la sesión. Queda el resumen: series hechas y volumen.',
      'Si quieres apuntar una serie de más o corregir algo, toca la flecha ▾ de su cabecera y se vuelve a abrir.',
      'El botón ▴ lo pliega cuando tú quieras, aunque no hayas terminado.',
    ],
    claves: ['plegar', 'cerrar', 'ocultar', 'recoger', 'flecha'],
  },
  {
    id: 'superseries',
    categoria: 'entrenar',
    pregunta: '¿Cómo se hacen las superseries?',
    respuesta: [
      'En Rutinas, al editar una, toca «⇄ Enlazar con el siguiente» para unir dos ejercicios. Se pueden encadenar tres.',
      'Al entrenar se ven juntos con etiquetas A1, A2, y el descanso se ajusta solo: corto al pasar de uno a otro (15 segundos por defecto) y completo al acabar la ronda.',
      'La barra del cronómetro dice para qué es cada descanso: «Siguiente ejercicio» o «Fin de ronda».',
    ],
    claves: ['superserie', 'encadenar', 'biserie', 'ronda', 'A1', 'A2'],
  },
  {
    id: 'salir-sesion',
    categoria: 'entrenar',
    pregunta: 'Si salgo a mirar otra pantalla, ¿pierdo el entrenamiento?',
    respuesta: [
      'No. La sesión sigue abierta y aparece un aviso arriba con un botón para volver donde estabas.',
      'Puedes moverte por Rutinas, Ejercicios o Progreso sin miedo: al volver, todo sigue igual.',
    ],
    claves: ['salir', 'perder', 'cambiar de pantalla', 'volver', 'aviso'],
  },

  /* --------------------------- rutinas y ejercicios ----------------------- */
  {
    id: 'crear-ejercicio',
    categoria: 'rutinas',
    pregunta: 'No encuentro un ejercicio, ¿puedo crearlo?',
    respuesta: [
      'Sí. En la pestaña Ejercicios, toca «+ Añadir ejercicio» y rellena el nombre, la descripción (cómo se hace), la parte del cuerpo que trabaja y el material.',
      'La descripción aparece después al elegir ese ejercicio y mientras entrenas, para acordarte de cómo lo hacías.',
      'Tus ejercicios salen marcados como «mío» y puedes editarlos o borrarlos cuando quieras.',
    ],
    claves: ['crear', 'ejercicio', 'nuevo', 'no está', 'añadir', 'descripción'],
  },
  {
    id: 'borrar-ejercicio',
    categoria: 'rutinas',
    pregunta: 'Si borro un ejercicio, ¿pierdo sus entrenamientos?',
    respuesta: [
      'No. Las series ya apuntadas se quedan con su nombre y siguen contando en la progresión.',
      'La app te avisa de cuántas series usaban ese ejercicio antes de borrarlo, por si acaso.',
    ],
    claves: ['borrar', 'ejercicio', 'perder', 'historial', 'eliminar'],
  },
  {
    id: 'editar-rutina',
    categoria: 'rutinas',
    pregunta: '¿Puedo cambiar series, repeticiones y descansos?',
    respuesta: [
      'Sí. En Rutinas, toca «Editar» en la rutina y cambia lo que quieras: series, rango de repeticiones, descanso, el orden de los ejercicios o quitar alguno.',
      'Los cambios se aplican a los próximos entrenamientos. Las sesiones ya hechas no se tocan.',
    ],
    claves: ['editar', 'rutina', 'cambiar', 'series', 'repeticiones', 'descanso'],
  },

  /* --------------------------- progreso y medidas ------------------------- */
  {
    id: 'progreso-basico',
    categoria: 'progreso',
    pregunta: '¿Cómo sé si estoy mejorando?',
    respuesta: [
      'En la pestaña Progreso, elige un ejercicio y verás su historial: peso, repeticiones y volumen de cada sesión.',
      'Mientras entrenas, cada serie te dice si vas mejor que la última vez (▲) o igual (=), comparando con la misma serie del último entrenamiento.',
      'Abajo tienes el volumen por semana y, si te interesa el equilibrio muscular, el volumen por grupo muscular de las últimas semanas.',
    ],
    claves: ['mejorar', 'progreso', 'evolución', 'subir', 'comparar'],
  },
  {
    id: 'grupos-musculares',
    categoria: 'progreso',
    pregunta: '¿Para qué sirve el volumen por grupo muscular?',
    respuesta: [
      'Sirve para ver el equilibrio: si un grupo se queda muy por detrás de los demás, probablemente lo estés entrenando poco o lo estés saltando.',
      'Se cuenta en series por semana y por grupo (espalda, pecho, cuádriceps…), contando solo las series de trabajo: las de aproximación no cuentan.',
      'Un rango habitual para quien entrena fuerza son 10-20 series por grupo y semana. No es una norma rígida: úsalo para comparar tus grupos entre sí.',
    ],
    claves: ['grupo muscular', 'volumen', 'equilibrio', 'series', 'espalda', 'pecho', 'pierna'],
  },
  {
    id: 'medidas',
    categoria: 'progreso',
    pregunta: '¿Cada cuánto me mido y qué me mido?',
    respuesta: [
      'Peso, abdomen, pecho y muslo, con cinta métrica, cada dos semanas. En ayunas y a la misma hora, para poder comparar.',
      'La app te avisa en Inicio cuando llevas 14 días sin medirte.',
      'El abdomen (a la altura del ombligo) es el dato más fiable: la báscula a corto plazo engaña, la cintura no.',
    ],
    claves: ['medidas', 'cintura', 'abdomen', 'medirse', 'cada cuánto', 'cinta'],
  },
  {
    id: 'perfil',
    categoria: 'progreso',
    pregunta: '¿Qué es el perfil del deportista?',
    respuesta: [
      'Es donde van tus datos fijos: altura, fecha de nacimiento, sexo y cuánto te mueves al día. Con eso la app calcula tu edad, el IMC, la relación cintura/altura y una estimación de lo que gastas al día.',
      'El peso NO se pide ahí: se coge de tu última medición corporal, así solo lo apuntas en un sitio.',
      'Si indicas tu porcentaje de grasa, la estimación mejora. Y son estimaciones para orientarte, no un diagnóstico médico.',
    ],
    claves: ['perfil', 'imc', 'calorías', 'gasto', 'proteína', 'altura', 'edad'],
  },

  /* ----------------------------- datos y copias --------------------------- */
  {
    id: 'donde-datos',
    categoria: 'datos',
    pregunta: '¿Dónde se guardan mis datos? ¿Los ve alguien?',
    respuesta: [
      'En tu móvil y solo en tu móvil. No hay servidor, así que nadie más puede verlos, ni siquiera quien hizo la app.',
      'Como contrapartida: si borras los datos del navegador o desinstalas la app, se pierden. Por eso están las copias de seguridad.',
    ],
    claves: ['datos', 'privacidad', 'nube', 'servidor', 'quién ve', 'guardan'],
  },
  {
    id: 'copia',
    categoria: 'datos',
    pregunta: '¿Cómo hago una copia de seguridad?',
    respuesta: [
      'En Ajustes → Copia de seguridad tienes dos formas, y puedes usar las dos.',
      '1) Descargar el archivo: toca «⬇ Descargar copia» y guarda el archivo donde quieras. Para recuperarlo, «⬆ Importar copia».',
      '2) Copia automática: elige una carpeta del móvil (Android) y la app guardará ahí una copia sola, con la frecuencia que elijas.',
      'El aviso de «toca copia» aparece en Inicio según el recordatorio que configures.',
    ],
    claves: ['copia', 'seguridad', 'backup', 'carpeta', 'restaurar', 'importar', 'exportar'],
  },
  {
    id: 'cambiar-movil',
    categoria: 'datos',
    pregunta: 'Me he cambiado de móvil, ¿cómo paso mis datos?',
    respuesta: [
      'En el móvil viejo: Ajustes → Copia de seguridad → Descargar copia. Mándate el archivo a ti mismo (correo, WhatsApp, Drive).',
      'En el móvil nuevo: instala la app, abre Ajustes → Copia de seguridad → Importar copia y elige ese archivo.',
      'Al importar te preguntará si quieres combinarla con lo que haya o reemplazarlo todo. Si el móvil nuevo está vacío, da igual cuál elijas.',
    ],
    claves: ['cambiar', 'móvil', 'pasar', 'otro teléfono', 'restaurar', 'nuevo'],
  },
  {
    id: 'carpeta-permiso',
    categoria: 'datos',
    pregunta: 'La copia en carpeta dice «permiso caducado», ¿qué hago?',
    respuesta: [
      'Es normal: los navegadores de móvil retiran el permiso de escritura al cerrarse del todo, por seguridad.',
      'Pulsa «Guardar ahora» y acepta el permiso cuando lo pida. Vuelve a funcionar.',
      'Si dice que no puede recordar la carpeta, prueba a elegir otra: algunas carpetas del sistema están protegidas.',
    ],
    claves: ['permiso', 'caducado', 'carpeta', 'no guarda', 'error'],
  },
  {
    id: 'compartir-datos',
    categoria: 'datos',
    pregunta: '¿Puedo pasarle la app a un amigo?',
    respuesta: [
      'Sí: mándale el enlace y que la añada a su pantalla de inicio.',
      'Cada persona tiene sus propios datos: lo que apunte él no se mezcla con lo tuyo, y al revés. No hay cuentas ni nada que configurar.',
    ],
    claves: ['compartir', 'amigo', 'pasar', 'enlace', 'otra persona'],
  },

  /* ----------------------------- si algo va mal --------------------------- */
  {
    id: 'no-actualiza',
    categoria: 'problemas',
    pregunta: 'Hay una versión nueva pero no me aparece',
    respuesta: [
      'Abre la app y ciérrala un par de veces: la actualización entra al abrirla, no hace falta hacer nada más.',
      'Si aun así sigue igual, en Ajustes → Novedades puedes ver qué versión tienes. Si el aviso de versión nueva aparece, toca «Actualizar».',
      'Tus datos no se tocan al actualizar, nunca.',
    ],
    claves: ['actualizar', 'versión', 'nueva', 'no aparece', 'actualización'],
  },
  {
    id: 'pantalla-apagada',
    categoria: 'problemas',
    pregunta: 'Se apaga la pantalla y no suena el aviso del descanso',
    respuesta: [
      'Cuando el móvil apaga la pantalla, el navegador duerme la app y el cronómetro no corre: es una limitación de las apps web, no un fallo.',
      'Solución: en Ajustes → Pantalla, activa «Mantener la pantalla encendida mientras uso la app». Así no se apaga y el aviso suena cuando toca.',
      'Si la apagas tú a propósito (bloqueando el móvil), al volver a encenderla la app se pone al día y avisa en ese momento.',
    ],
    claves: ['pantalla', 'apaga', 'no suena', 'aviso', 'descanso', 'alarma'],
  },
  {
    id: 'sin-sonido',
    categoria: 'problemas',
    pregunta: 'No me suena nada al terminar el descanso',
    respuesta: [
      'Comprueba en Ajustes que el «Aviso sonoro» está activado y que el móvil no está en silencio.',
      'En iPhone el sonido no está garantizado (limitación de Safari), pero verás la barra parpadeando en verde con «¡Descanso terminado!».',
      'Toca cualquier botón de la app al empezar a entrenar: el navegador necesita un toque antes de dejar sonar.',
    ],
    claves: ['sonido', 'no suena', 'silencio', 'iphone', 'aviso'],
  },
  {
    id: 'pantalla-negra',
    categoria: 'problemas',
    pregunta: 'La app se queda en negro o no abre',
    respuesta: [
      'Espera unos segundos: si tarda, la app te dirá qué pasa en lugar de quedarse en negro, con botones para reintentar, limpiar la caché o borrar los datos.',
      'Si estas sin conexión y es la primera vez que la abres en ese móvil, necesita conexión una vez para descargarse.',
      'Antes de borrar nada, prueba «Reintentar». Si nada funciona y tienes copia, importa la copia después de limpiar.',
    ],
    claves: ['negra', 'no abre', 'error', 'pantalla', 'bloqueada'],
  },
  {
    id: 'sugerencia',
    categoria: 'problemas',
    pregunta: '¿Dónde cuento una mejora o un fallo?',
    respuesta: [
      'Habla con quien te pasó el enlace: esta app la hizo Óscar Muela, maestro de Educación Física, no una empresa, y las sugerencias se tienen en cuenta de verdad.',
      'Si algo falla, cuenta en qué pantalla estabas, qué tocaste y qué esperabas que pasara. Con esos tres datos se puede reproducir y arreglar; con un «no funciona» no.',
      'Si el problema es con una copia o con los datos, dilo también: son los fallos que más urge arreglar.',
    ],
    claves: ['sugerencia', 'mejora', 'fallo', 'error', 'contacto', 'ayuda'],
  },
]

/** Quita acentos y mayusculas, para que la busqueda no falle por eso. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Busca preguntas por texto libre.
 *
 * Mira en la pregunta, en la respuesta y en las palabras clave, porque el usuario busca con sus
 * palabras ("alarma", "cintura"), no con las nuestras. Sin texto devuelve todas.
 */
export function buscarAyuda(consulta: string): PreguntaAyuda[] {
  const texto = normalizar(consulta)
  if (!texto) return AYUDA
  const palabras = texto.split(' ').filter((p) => p.length > 2)
  return AYUDA.filter((entrada) => {
    const heno = normalizar(
      [entrada.pregunta, entrada.respuesta.join(' '), (entrada.claves ?? []).join(' ')].join(' '),
    )
    // Todas las palabras tienen que aparecer: buscar "copia carpeta" no debe devolver todo lo de copias.
    return palabras.every((p) => heno.includes(p))
  })
}

/** Las preguntas de una categoria. */
export function ayudaDeCategoria(categoria: CategoriaAyuda): PreguntaAyuda[] {
  return AYUDA.filter((entrada) => entrada.categoria === categoria)
}

/** Cuantas preguntas hay en total, para mostrarlo. */
export function cuantasPreguntas(): number {
  return AYUDA.length
}

/** Titulo de una categoria. */
export function tituloDeCategoria(categoria: CategoriaAyuda): string {
  return CATEGORIAS.find((c) => c.id === categoria)?.titulo ?? categoria
}
