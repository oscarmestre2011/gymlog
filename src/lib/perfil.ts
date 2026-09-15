/**
 * Calculos del perfil del deportista.
 *
 * Que datos se piden, y por que esos:
 *  - **Altura**: hace falta para el IMC y para la relacion cintura/altura.
 *  - **Fecha de nacimiento** (no la edad): asi la edad se calcula sola y no hay que actualizarla
 *    cada cumpleanos. Es un dato que se queda obsoleto si se guarda como numero.
 *  - **Sexo**: las formulas de gasto energetico lo usan. Sin el, no se puede estimar.
 *  - **Nivel de actividad**: para pasar del gasto en reposo al gasto del dia.
 *  - **Porcentaje de grasa** (opcional): si se conoce, hay una formula mejor (Katch-McArdle) que
 *    no necesita ni altura ni sexo, porque parte de la masa magra.
 *
 * Todo son funciones puras: se pueden probar sin navegador.
 */

/** Nivel de actividad diaria, para estimar el gasto total. */
export type NivelActividad = 'sedentario' | 'ligero' | 'moderado' | 'alto' | 'muy-alto'

export interface DatosPerfil {
  heightCm?: number
  /** Fecha de nacimiento en formato YYYY-MM-DD. */
  birthDate?: string
  sex?: 'hombre' | 'mujer'
  activity?: NivelActividad
  /** Porcentaje de grasa corporal (0-60). Opcional. */
  bodyFatPercent?: number
}

/** Factores de actividad, los habituales para estimar el gasto diario. */
export const FACTORES_ACTIVIDAD: Record<NivelActividad, { factor: number; texto: string }> = {
  sedentario: { factor: 1.2, texto: 'Poco o ningún ejercicio' },
  ligero: { factor: 1.375, texto: 'Ejercicio ligero, 1-3 días por semana' },
  moderado: { factor: 1.55, texto: 'Ejercicio moderado, 3-5 días por semana' },
  alto: { factor: 1.725, texto: 'Ejercicio fuerte, 6-7 días por semana' },
  'muy-alto': { factor: 1.9, texto: 'Ejercicio muy fuerte, trabajo físico o dos sesiones al día' },
}

/**
 * Edad en anos cumplidos a partir de la fecha de nacimiento.
 *
 * Se calcula en vez de guardarla porque la edad caduca cada ano: guardada como numero, en dos
 * anos estaria mal y nadie se acordaria de cambiarla.
 */
export function edadDesde(birthDate: string | undefined, hoy = new Date()): number | null {
  if (!birthDate) return null
  const [y, m, d] = birthDate.split('-').map(Number)
  if (!y || !m || !d) return null
  let edad = hoy.getFullYear() - y
  const mesActual = hoy.getMonth() + 1
  if (mesActual < m || (mesActual === m && hoy.getDate() < d)) edad -= 1
  if (edad < 0 || edad > 120) return null
  return edad
}

/**
 * Gasto energetico en reposo (kcal al dia).
 *
 * - Con porcentaje de grasa: **Katch-McArdle**, que usa la masa magra. Es mas exacta porque no
 *   depende de suposiciones sobre la composicion.
 * - Sin el: **Mifflin-St Jeor**, la formula recomendada para poblacion general.
 *
 * Devuelve null si faltan datos: mejor no dar nada que dar un numero inventado.
 */
export function gastoEnReposo(
  datos: DatosPerfil,
  pesoKg: number | undefined,
  edad: number | null,
): number | null {
  if (!pesoKg || pesoKg <= 0) return null

  const grasa = datos.bodyFatPercent
  if (typeof grasa === 'number' && grasa > 0 && grasa < 70) {
    // Katch-McArdle: 370 + (21,6 x masa magra en kg)
    const masaMagra = pesoKg * (1 - grasa / 100)
    return Math.round(370 + 21.6 * masaMagra)
  }

  if (!edad || !datos.sex || !datos.heightCm) return null
  // Mifflin-St Jeor
  const base = 10 * pesoKg + 6.25 * datos.heightCm - 5 * edad
  return Math.round(datos.sex === 'hombre' ? base + 5 : base - 161)
}

/** Gasto total del dia: el de reposo por el factor de actividad. */
export function gastoTotal(reposo: number | null, actividad: NivelActividad | undefined): number | null {
  if (reposo === null) return null
  const factor = FACTORES_ACTIVIDAD[actividad ?? 'ligero']?.factor ?? 1.375
  return Math.round(reposo * factor)
}

/**
 * Rango de proteina recomendado al dia, en gramos.
 *
 * El rango 1,6-2,2 g por kilo es el que sostiene la masa muscular en personas que entrenan fuerza,
 * y es el que sigue el plan del usuario. Se da como rango y no como numero unico porque no hay un
 * valor exacto que sea mejor para todos: segun el objetivo (perder grasa, mantener, ganar) se
 * mueve dentro del rango.
 */
export function rangoProteina(pesoKg: number | undefined): { min: number; max: number } | null {
  if (!pesoKg || pesoKg <= 0) return null
  return { min: Math.round(pesoKg * 1.6), max: Math.round(pesoKg * 2.2) }
}

/**
 * Indice de masa corporal. Se repite aqui (esta tambien en medidas) para que el perfil pueda
 * usarlo con el peso mas reciente sin depender de la pantalla de medidas.
 */
export function imcPerfil(pesoKg: number | undefined, alturaCm: number | undefined): number | null {
  if (!pesoKg || !alturaCm || pesoKg <= 0 || alturaCm <= 0) return null
  const alturaM = alturaCm / 100
  return pesoKg / (alturaM * alturaM)
}

/** Que datos del perfil faltan para poder calcular lo que se promete. */
export function queFalta(datos: DatosPerfil, hayPeso: boolean): string[] {
  const faltan: string[] = []
  if (!datos.heightCm) faltan.push('la altura')
  if (!datos.birthDate) faltan.push('la fecha de nacimiento')
  if (!datos.sex) faltan.push('el sexo')
  if (!hayPeso) faltan.push('el peso (se coge de las medidas corporales)')
  return faltan
}

/** Cuantos anos tiene el perfil, en texto, para mostrarlo. */
export function textoEdad(edad: number | null): string {
  if (edad === null) return 'sin fecha de nacimiento'
  if (edad === 1) return '1 año'
  return `${edad} años`
}
