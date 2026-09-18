/**
 * Lo que la app dice de si misma hacia fuera: la web de presentacion.
 *
 * FUENTE UNICA: de aqui sale el archivo `publicar/kairos.json` que consume la web
 * (https://kairosentrena.com/). Se genera con `npm run web`.
 *
 * El motivo de que esto exista: la web y la app cuentan lo mismo, y si se escriben dos veces
 * acaban contradiciendose. El ejemplo real: la app avisa de que en iPhone el sonido del aviso no
 * esta garantizado; la web no puede prometer "te avisa con sonido" a secas.
 *
 * Reglas al anadir algo:
 *  - Solo lo que la app HACE de verdad. Si algo esta a medias, o no se pone o se pone con su limite.
 *  - Los datos que se publican (enlace, version, preguntas) se cogen de su fuente, no se copian.
 */

import { AYUDA } from './ayuda'
import { VERSIONES } from './changelog'

/**
 * Direccion publica de la app.
 *
 * Vive aqui para que no haya que cambiarla en dos sitios. Se mudo desde
 * `https://oscarmestre2011.github.io/gymlog/` a `https://kairosentrena.com/app/` el 17-09-2026,
 * al comprar el dominio propio. La direccion vieja redirige a esta.
 */
export const ENLACE_APP = 'https://kairosentrena.com/app/'

/** Direccion de la web de presentacion. */
export const ENLACE_WEB = 'https://kairosentrena.com/'

/**
 * Quien ha hecho la app. Fuente unica: lo usan la web y la pantalla de Ajustes.
 *
 * Se escribe con nombre y profesion a proposito: es lo que diferencia a Kairos de las otras mil
 * apps de gimnasio (que la ha hecho un maestro de Educacion Fisica, no una empresa).
 *
 * OJO con el apellido: es MUELA, no Mestre (Mestre se coló por la direccion de correo).
 */
export const AUTOR = {
  nombre: 'Óscar Muela',
  profesion: 'maestro de Educación Física',
  /** Como se firma en una linea. */
  firma: 'Óscar Muela — maestro de Educación Física',
}

/* ------------------------------- apoyo voluntario ------------------------------- */

/**
 * Enlace de donacion voluntaria (PayPal.me).
 *
 * Reglas, y no son de estilo:
 *  - La donacion NO desbloquea nada. Si desbloqueara algo, dejaria de ser una donacion y pasaria a
 *    ser una venta, con IVA y con derecho de desistimiento de 14 dias. Por eso la app y la web lo
 *    dicen con todas las letras: "no desbloquea nada".
 *  - No se dice en ningun sitio que desgrave: las donaciones a particulares no desgravan.
 *  - No se promete nada a cambio, ni contenido exclusivo, ni soporte prioritario.
 */
export const ENLACE_APOYO = 'https://paypal.me/oscarmuela85'

/** Cantidades sugeridas. Deliberadamente NO hay importes de 1-3 €: PayPal se queda casi el 15 %. */
export const CANTIDADES_APOYO = [5, 10, 20]

/**
 * Enlace de donacion con una cantidad sugerida.
 *
 * El parametro `amount` es una ayuda, no una obligacion: PayPal lo usa para rellenar el importe y,
 * si algun dia dejara de aceptarlo, el enlace sigue funcionando y la cantidad se escribe a mano.
 * Por eso el enlace pelado (`ENLACE_APOYO`) siempre vale.
 */
export function enlaceApoyoCon(cantidad: number): string {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return ENLACE_APOYO
  return `${ENLACE_APOYO}/${cantidad}EUR`
}

/** Los importes que se ofrecen, con su enlace ya montado. */
export function opcionesDeApoyo(): { cantidad: number; enlace: string }[] {
  return CANTIDADES_APOYO.map((cantidad) => ({ cantidad, enlace: enlaceApoyoCon(cantidad) }))
}

/**
 * El texto del apoyo, escrito UNA vez.
 *
 * Lo usan los dos sitios (la tarjeta de Ajustes y la seccion de la web), y las pruebas vigilan que
 * no diga nada que no sea cierto: que no desbloquee nada y que no desgrave.
 */
export const APOYO = {
  titulo: 'Kairós es gratis, y lo será',
  texto:
    'Sin anuncios, sin suscripciones y sin funciones capadas. Si te resulta útil y quieres aportar tu granito, puedes dejar una donación voluntaria por PayPal.',
  aclaracion:
    'No desbloquea nada: la app sigue igual de gratis y completa. Tampoco desgrava, porque no es una donación a una ONG.',
}

/** Para las pruebas: comprueba que el enlace de apoyo es de PayPal y con https. */
export function enlaceApoyoSeguro(): boolean {
  return /^https:\/\/(www\.)?paypal\.me\/[A-Za-z0-9._-]+$/.test(ENLACE_APOYO)
}

export interface CaracteristicaWeb {
  /** Emoji que la representa. */
  icono: string
  titulo: string
  /** Una o dos frases, en el idioma de quien lee. */
  texto: string
}

/**
 * Lo que hace la app, contado para alguien que no la conoce.
 *
 * El orden importa: primero lo que resuelve el problema del dia a dia (acordarse de lo que
 * levantaste), y al final lo que solo usa una parte de la gente.
 */
export function loQueHace(): CaracteristicaWeb[] {
  return [
    {
      icono: '📝',
      titulo: 'Apuntar una serie cuesta dos toques',
      texto:
        'Escribes peso y repeticiones, tocas el ✓ y ya está. Las flechas + y − suben y bajan de 2,5 en 2,5 kg. Sin teclados raros ni ventanas encima.',
    },
    {
      icono: '⏱️',
      titulo: 'El descanso arranca solo',
      texto:
        'Al guardar la serie empieza a contar con el descanso de ese ejercicio: puedes añadir 30 segundos o pararlo. Al terminar avisa con sonido y con la barra parpadeando en verde. En iPhone el sonido no está garantizado, así que ahí te guía el parpadeo.',
    },
    {
      icono: '⇄',
      titulo: 'Si la máquina está ocupada, cambias el ejercicio',
      texto:
        'Tocas ⇄ y sigues con otro. Lo que ya habías apuntado no se pierde, y queda marcado de dónde venías para que después se entienda.',
    },
    {
      icono: '▲',
      titulo: 'Cada serie te dice si vas mejor que la última vez',
      texto:
        'Compara con la misma serie de la sesión anterior: ▲ si has subido, ▼ si has bajado. Es la forma más simple de saber que estás progresando.',
    },
    {
      icono: '📋',
      titulo: 'Tres rutinas hechas y las tuyas propias',
      texto:
        'Fuerza A, B y C vienen listas para usar, con series, repeticiones y descansos. Puedes cambiarlas o crear las tuyas, y poner cada una en su día de la semana.',
    },
    {
      icono: '🏋️',
      titulo: 'Superseries y series de aproximación',
      texto:
        'Enlaza dos o tres ejercicios y la app ajusta los descansos sola. Las series de calentamiento se apuntan aparte y no cuentan para el volumen ni para los récords.',
    },
    {
      icono: '📈',
      titulo: 'Progreso sin hojas de cálculo',
      texto:
        'Volumen por sesión y por semana, y series semanales por grupo muscular, para ver si un grupo se queda atrás. Las series de aproximación no cuentan.',
    },
    {
      icono: '📏',
      titulo: 'Peso y medidas con aviso cada 14 días',
      texto:
        'Peso, abdomen, pecho y muslo. La app te recuerda medirte cuando toca y te muestra la evolución. La cintura es más fiable que la báscula a corto plazo.',
    },
    {
      icono: '🚴',
      titulo: 'Cardio continuo, por series o fartlek',
      texto:
        'Bici, carrera o cinta con tramos: calentamiento, series, recuperaciones y vuelta a la calma. Puedes apuntarlos en tiempo, en metros o en kilómetros.',
    },
    {
      icono: '💾',
      titulo: 'Tus datos son tuyos, y te ayuda a no perderlos',
      texto:
        'No hay cuentas ni servidor. Todo vive en tu móvil, y por eso la app insiste en las copias: la descargas a un archivo cuando quieras o, en Android, dejas que se guarde sola en una carpeta del teléfono. En iPhone, la copia es siempre el archivo.',
    },
  ]
}

export interface PreguntaWeb {
  id: string
  pregunta: string
  /** La respuesta en un solo texto (la app la muestra en parrafos). */
  respuesta: string
}

/**
 * Preguntas frecuentes de la web: las mismas que responde la app dentro.
 *
 * Se excluyen las que solo tienen sentido con la app abierta (como "hay una version nueva pero no
 * me aparece"), porque en la web no se entienden.
 */
export function preguntasParaLaWeb(): PreguntaWeb[] {
  const fuera = new Set(['no-actualiza', 'sugerencia'])
  return AYUDA.filter((entrada) => !fuera.has(entrada.id)).map((entrada) => ({
    id: entrada.id,
    pregunta: entrada.pregunta,
    respuesta: entrada.respuesta.join(' '),
  }))
}

/** Version que se anuncia en la web. */
export function versionParaLaWeb(): string {
  return VERSIONES[0]?.version ?? '0.0.0'
}
