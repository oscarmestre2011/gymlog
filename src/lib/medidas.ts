import type { BodyMeasurement } from '../types'

/**
 * Calculos de las medidas corporales.
 *
 * Los indicadores que se calculan son los mismos que el usuario sigue en su vault
 * (02 Registro/Medidas corporales): IMC y relacion cintura/altura, con sus umbrales de
 * riesgo. Calcularlos en la app evita tener que mirarlos a mano cada vez.
 *
 * Todo son funciones puras, para poder probarlas sin navegador.
 */

/** Indice de masa corporal. Devuelve null si faltan datos. */
export function imc(pesoKg?: number, alturaCm?: number): number | null {
  if (!pesoKg || !alturaCm || pesoKg <= 0 || alturaCm <= 0) return null
  const alturaM = alturaCm / 100
  return pesoKg / (alturaM * alturaM)
}

/** Clasificacion del IMC segun la OMS. */
export function clasificacionImc(valor: number | null): string {
  if (valor === null) return '—'
  if (valor < 18.5) return 'bajo peso'
  if (valor < 25) return 'normopeso'
  if (valor < 30) return 'sobrepeso'
  return 'obesidad'
}

/**
 * Relacion cintura/altura (WHtR). Es mejor indicador que el IMC para grasa visceral.
 * Se usa la cintura, o el abdomen si no hay cintura.
 */
export function cinturaAltura(
  medicion: Pick<BodyMeasurement, 'abdomenCm' | 'waistCm'>,
  alturaCm?: number,
): number | null {
  const cintura = medicion.waistCm ?? medicion.abdomenCm
  if (!cintura || !alturaCm || cintura <= 0 || alturaCm <= 0) return null
  return cintura / alturaCm
}

export type NivelRiesgo = 'sano' | 'atencion' | 'alto' | 'muy-alto'

/**
 * Nivel de riesgo del perimetro abdominal, con los umbrales que usa el vault
 * (alerta a partir de 94 cm y riesgo muy elevado a partir de 102 cm).
 */
export function riesgoAbdominal(abdomenCm?: number): { nivel: NivelRiesgo; texto: string } | null {
  if (!abdomenCm || abdomenCm <= 0) return null
  if (abdomenCm < 94) return { nivel: 'sano', texto: 'por debajo del umbral de alerta (94 cm)' }
  if (abdomenCm < 102) return { nivel: 'atencion', texto: 'por encima del umbral de alerta (94 cm)' }
  return { nivel: 'muy-alto', texto: 'por encima de 102 cm: riesgo elevado' }
}

/** Nivel segun la relacion cintura/altura: sano por debajo de 0,5. */
export function riesgoCinturaAltura(whTr: number | null): { nivel: NivelRiesgo; texto: string } | null {
  if (whTr === null) return null
  if (whTr < 0.5) return { nivel: 'sano', texto: 'por debajo de 0,5: sano' }
  if (whTr < 0.6) return { nivel: 'atencion', texto: 'por encima de 0,5: conviene vigilarlo' }
  return { nivel: 'alto', texto: 'por encima de 0,6: riesgo alto' }
}

/** Medicion mas reciente que tenga ese dato. */
export function ultimaConDato(
  mediciones: BodyMeasurement[],
  campo: 'weightKg' | 'abdomenCm' | 'waistCm' | 'chestCm' | 'thighCm',
): BodyMeasurement | null {
  const ordenadas = [...mediciones].sort((a, b) => b.date.localeCompare(a.date))
  return ordenadas.find((m) => typeof m[campo] === 'number' && (m[campo] as number) > 0) ?? null
}

/** Cuanto ha cambiado un dato entre dos mediciones (positivo = ha subido). */
export function diferencia(antes?: number, despues?: number): number | null {
  if (typeof antes !== 'number' || typeof despues !== 'number') return null
  return Math.round((despues - antes) * 100) / 100
}

export interface ResumenMedidas {
  /** Ultima medicion que tiene ese dato. */
  ultima: BodyMeasurement | null
  /** Primer registro que tiene ese dato. */
  primera: BodyMeasurement | null
  /** Cambio desde el primer registro. */
  cambio: number | null
}

/**
 * Resumen de la evolucion de un dato: primer valor, ultimo y diferencia.
 * Se usa para las tarjetas de la pantalla de medidas.
 */
export function resumenDe(
  mediciones: BodyMeasurement[],
  campo: 'weightKg' | 'abdomenCm' | 'waistCm' | 'chestCm' | 'thighCm',
): ResumenMedidas {
  const conDato = mediciones
    .filter((m) => typeof m[campo] === 'number' && (m[campo] as number) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (conDato.length === 0) return { ultima: null, primera: null, cambio: null }
  const primera = conDato[0]
  const ultima = conDato[conDato.length - 1]
  return {
    primera,
    ultima,
    cambio: diferencia(primera[campo] as number, ultima[campo] as number),
  }
}

/** Valores de un dato a lo largo del tiempo, para dibujar la evolucion. */
export function serieDe(
  mediciones: BodyMeasurement[],
  campo: 'weightKg' | 'abdomenCm' | 'waistCm' | 'chestCm' | 'thighCm',
): { date: string; valor: number }[] {
  return mediciones
    .filter((m) => typeof m[campo] === 'number' && (m[campo] as number) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, valor: m[campo] as number }))
}

/**
 * Si toca medirse.
 *
 * El usuario se mide cada dos semanas (esta en su vault y en el episodio del podcast: "una
 * vez al mes, con cinta metrica"). Aqui se avisa a los 14 dias, que es su ritmo real.
 */
export function diasDesdeLaUltima(mediciones: BodyMeasurement[]): number | null {
  if (mediciones.length === 0) return null
  const ultima = [...mediciones].sort((a, b) => b.date.localeCompare(a.date))[0]
  const [y, m, d] = ultima.date.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  const hoy = new Date()
  const dias = Math.floor((hoy.getTime() - fecha.getTime()) / 86400000)
  return dias
}

export function tocaMedirse(mediciones: BodyMeasurement[]): boolean {
  const dias = diasDesdeLaUltima(mediciones)
  if (dias === null) return false
  return dias >= 14
}
