/** Funciones puras de formato y calculo. Sin dependencias: se prueban aisladas. */

const pad = (n: number) => String(n).padStart(2, '0')

/** Fecha local en formato YYYY-MM-DD (nunca UTC: el usuario entrena de noche). */
export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function timeOfDay(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "23 jun 2026" a partir de YYYY-MM-DD, sin desfase de zona horaria. */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${meses[m - 1]} ${y}`
}

export function weekdayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return dias[new Date(y, m - 1, d).getDay()]
}

/** Suma dias a una fecha ISO. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return todayISO(date)
}

/** Segundos -> "1h 23m 32s" o "8m 30s" o "45s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${pad(sec)}s`
  if (m > 0) return `${m}m ${pad(sec)}s`
  return `${sec}s`
}

/** Segundos -> "MM:SS" para el cronometro. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

/**
 * Minutos -> "18 h 19 min".
 *
 * Para los TOTALES, no para una sesion suelta: en los totales solo interesan horas y
 * minutos, y los segundos sobran. Si sobraran segundos se redondean al minuto, que es
 * la unica forma de que la suma de varias sesiones no parezca haber perdido tiempo.
 * Por debajo de una hora devuelve solo los minutos ("45 min").
 */
export function formatHoursMinutes(totalMinutes: number): string {
  const minutos = Math.max(0, Math.round(totalMinutes))
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0) return `${resto} min`
  if (resto === 0) return `${horas} h`
  return `${horas} h ${resto} min`
}

/**
 * Distancia total en km, con los metros exactos.
 *
 * Nada de redondear a kilometros enteros: sumando salidas largas en bici, el redondeo
 * escondia cientos de metros (42,27 km se mostraba como "42 km"). Se dan dos decimales
 * (precision de 10 m) y sin ceros sobrantes: 42,27 km, 30,5 km, 12 km.
 */
export function formatKilometers(totalKm: number): string {
  const km = Math.max(0, totalKm)
  // Se redondea a 10 metros: mas precision que esa no aporta nada.
  const redondeado = Math.round(km * 100) / 100
  return `${formatNumber(redondeado, 2)} km`
}

/** Lunes de la semana a la que pertenece una fecha ISO (semana que empieza en lunes). */
export function startOfWeekISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = (date.getDay() + 6) % 7 // lunes = 0
  date.setDate(date.getDate() - day)
  return todayISO(date)
}

/** Primer dia del mes al que pertenece una fecha ISO. */
export function startOfMonthISO(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${y}-${pad(m)}-01`
}

/**
 * Acepta lo que uno escribe de verdad: "45", "1:23:32", "1h23m", "23m32s", "83:32".
 * Devuelve segundos, o null si no se entiende.
 */
export function parseDurationInput(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/,/g, '.')
  if (!text) return null

  // Formato con etiquetas: 1h 23m 32s
  if (/[hms]/.test(text)) {
    const h = /(\d+(?:\.\d+)?)\s*h/.exec(text)
    const m = /(\d+(?:\.\d+)?)\s*m(?!s)/.exec(text)
    const s = /(\d+(?:\.\d+)?)\s*s/.exec(text)
    if (!h && !m && !s) return null
    const total =
      (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0)
    return Math.round(total)
  }

  // Formato con dos puntos: mm:ss o hh:mm:ss
  if (text.includes(':')) {
    const parts = text.split(':').map((p) => Number(p.trim()))
    if (parts.some((p) => Number.isNaN(p))) return null
    if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1])
    if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
    return null
  }

  // Minutos sueltos
  const n = Number(text)
  if (Number.isNaN(n) || n < 0) return null
  return Math.round(n * 60)
}

/** Acepta "52,5" y "52.5". Devuelve null si no es un numero valido. */
export function parseDecimalInput(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!text) return null
  const n = Number(text)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

/** Numero -> texto con coma decimal, sin ceros sobrantes: 52.5 -> "52,5"; 60 -> "60". */
export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Number(n.toFixed(decimals))
  return String(rounded).replace('.', ',')
}

/**
 * Ritmo en min/km a partir de distancia y tiempo.
 * Devuelve texto "10:25 min/km", o null si no se puede calcular.
 */
export function paceMinPerKm(distanceKm?: number, durationSec?: number): string | null {
  if (!distanceKm || !durationSec || distanceKm <= 0 || durationSec <= 0) return null
  const secPerKm = durationSec / distanceKm
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  // El redondeo puede dar 60 segundos: normalizamos.
  if (s === 60) return `${m + 1}:00 min/km`
  return `${m}:${pad(s)} min/km`
}

/** Velocidad media en km/h (util para bici). */
export function speedKmh(distanceKm?: number, durationSec?: number): number | null {
  if (!distanceKm || !durationSec || distanceKm <= 0 || durationSec <= 0) return null
  return (distanceKm / durationSec) * 3600
}

/**
 * 1RM estimado (formula de Epley). Con 1 repeticion devuelve el propio peso.
 * Se usa solo como referencia de progreso, no como verdad absoluta.
 */
export function estimated1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/** Volumen de una serie: peso x repeticiones. */
export function setVolume(weight: number, reps: number): number {
  return Math.max(0, weight) * Math.max(0, reps)
}

/** Suma de volumen de una lista de series (ignora aproximacion si se pide). */
export function totalVolume(
  sets: { weight: number; reps: number; isWarmup?: boolean }[],
  includeWarmup = false,
): number {
  return sets
    .filter((s) => includeWarmup || !s.isWarmup)
    .reduce((acc, s) => acc + setVolume(s.weight, s.reps), 0)
}

/** Redondea un peso al incremento disponible (por ejemplo discos de 2,5 kg). */
export function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return weight
  return Math.round(weight / increment) * increment
}

/**
 * Sugerencia de progresion: si en la ultima sesion se completaron todas las series
 * en el tope de repeticiones, propone subir un incremento.
 */
export function suggestNextWeight(
  lastSets: { weight: number; reps: number; isWarmup?: boolean }[],
  targetRepsMax: number,
  increment: number,
): { weight: number; reason: string } | null {
  const working = lastSets.filter((s) => !s.isWarmup)
  if (working.length === 0) return null
  const topWeight = Math.max(...working.map((s) => s.weight))
  const atTopWeight = working.filter((s) => s.weight === topWeight)
  const allAtMax = atTopWeight.every((s) => s.reps >= targetRepsMax)
  if (allAtMax) {
    return {
      weight: roundToIncrement(topWeight + increment, increment),
      reason: `Completaste ${atTopWeight.length} ${atTopWeight.length === 1 ? 'serie' : 'series'} a ${formatNumber(targetRepsMax)} reps con ${formatNumber(topWeight)} kg`,
    }
  }
  return {
    weight: topWeight,
    reason: `Aún no llegas al tope de reps con ${formatNumber(topWeight)} kg`,
  }
}

/** Agrupa series por ejercicio conservando el orden de aparicion. */
export function groupByExercise<T extends { exerciseId: string; exerciseName: string }>(
  items: T[],
): { exerciseId: string; exerciseName: string; items: T[] }[] {
  const map = new Map<string, { exerciseId: string; exerciseName: string; items: T[] }>()
  for (const item of items) {
    const found = map.get(item.exerciseId)
    if (found) found.items.push(item)
    else map.set(item.exerciseId, { exerciseId: item.exerciseId, exerciseName: item.exerciseName, items: [item] })
  }
  return [...map.values()]
}

/** Texto compacto de una serie: "4×10×45kg" o "3×12×PC". */
export function setLabel(weight: number, reps: number): string {
  if (weight <= 0) return `×${reps} (PC)`
  return `×${reps}×${formatNumber(weight)}kg`
}

/** Resumen de un ejercicio en una sesion: "4×12×45kg". */
export function exerciseSummary(sets: { weight: number; reps: number; isWarmup?: boolean }[]): string {
  const working = sets.filter((s) => !s.isWarmup)
  if (working.length === 0) return '—'
  const groups = new Map<string, number>()
  for (const s of working) {
    const key = setLabel(s.weight, s.reps)
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([label, count]) => `${count}${label}`).join(' + ')
}
