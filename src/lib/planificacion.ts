/**
 * Planificacion semanal: que rutina toca cada dia.
 *
 * QUE HABIA ANTES: los dias estaban ESCRITOS A MANO en el codigo (A = lunes, B = miercoles,
 * C = viernes). Si el usuario cambiaba de rutina o de dias, no habia forma de ajustarlo sin tocar
 * el programa. Ahora cada rutina lleva su propio dia, se elige al editarla, y la app mira ese dato.
 *
 * Todo son funciones puras: se pueden probar sin navegador.
 */

import type { Routine } from '../types'

/** Nombres de los dias, con el indice que usa JavaScript (0 = domingo). */
export const DIAS = [
  { indice: 0, nombre: 'domingo', corto: 'Dom', laborable: false },
  { indice: 1, nombre: 'lunes', corto: 'Lun', laborable: true },
  { indice: 2, nombre: 'martes', corto: 'Mar', laborable: true },
  { indice: 3, nombre: 'miércoles', corto: 'Mié', laborable: true },
  { indice: 4, nombre: 'jueves', corto: 'Jue', laborable: true },
  { indice: 5, nombre: 'viernes', corto: 'Vie', laborable: true },
  { indice: 6, nombre: 'sábado', corto: 'Sáb', laborable: false },
] as const

/** Nombre del dia de la semana, en texto. */
export function nombreDelDia(indice: number): string {
  return DIAS.find((d) => d.indice === indice)?.nombre ?? ''
}

/** Nombre corto, para botones y etiquetas. */
export function nombreCortoDelDia(indice: number): string {
  return DIAS.find((d) => d.indice === indice)?.corto ?? ''
}

/** Dia de la semana (0-6) de una fecha ISO. */
export function diaDeLaFecha(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number)
  // Se usa el constructor con los tres numeros: con `new Date('2026-09-16')` la zona horaria
  // puede desplazar el dia, y entonces "hoy" no coincidiria con el dia real.
  return new Date(y, m - 1, d).getDay()
}

/**
 * Rutinas programadas para un dia concreto.
 *
 * Puede haber mas de una (por ejemplo fuerza y cardio), de ahi que devuelva una lista. Si una
 * rutina no tiene dia asignado NO se propone nunca: es lo que se espera de "no planificada".
 */
export function rutinasDelDia(rutinas: Routine[], dia: number): Routine[] {
  return rutinas
    .filter((r) => diasDeRutina(r).includes(dia))
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '') || a.name.localeCompare(b.name))
}

/** Rutinas que no tienen ningun dia asignado. */
export function rutinasSinDia(rutinas: Routine[]): Routine[] {
  return rutinas.filter((r) => diasDeRutina(r).length === 0)
}

/**
 * Resumen de la semana: que toca cada dia.
 *
 * Se usa en la pantalla de rutinas, para ver el plan completo de un vistazo y darse cuenta de los
 * huecos (dos rutinas el mismo dia, o dias sin nada).
 */
export interface DiaPlanificado {
  dia: number
  nombre: string
  corto: string
  rutinas: Routine[]
}

export function planSemanal(rutinas: Routine[]): DiaPlanificado[] {
  // Se empieza el LUNES, que es como se lee un plan de entrenamiento en España.
  const orden = [1, 2, 3, 4, 5, 6, 0]
  return orden.map((dia) => ({
    dia,
    nombre: nombreDelDia(dia),
    corto: nombreCortoDelDia(dia),
    rutinas: rutinasDelDia(rutinas, dia),
  }))
}

/**
 * Avisos sobre el plan: dias repetidos o dias vacios.
 *
 * Se informa, no se prohibe: puede querer dos rutinas el mismo dia (fuerza y cardio), asi que se
 * avisa sin bloquear. Lo que si conviene señalar es un dia con dos rutinas de fuerza, que suele ser
 * un descuido al programar.
 */
export function avisosDelPlan(rutinas: Routine[]): string[] {
  const avisos: string[] = []
  const plan = planSemanal(rutinas)

  for (const dia of plan) {
    if (dia.rutinas.length > 1) {
      const nombres = dia.rutinas.map((r) => r.code ?? r.name).join(' y ')
      avisos.push(`El ${dia.nombre} tienes ${dia.rutinas.length} rutinas: ${nombres}.`)
    }
  }

  const conDia = rutinas.filter((r) => diasDeRutina(r).length > 0)
  if (conDia.length > 0 && plan.every((d) => d.rutinas.length === 0)) {
    avisos.push('Ninguna rutina está asignada a un día.')
  }

  const sinDia = rutinasSinDia(rutinas)
  if (sinDia.length > 0 && conDia.length > 0) {
    avisos.push(
      sinDia.length === 1
        ? `«${sinDia[0].name}» no está programada en ningún día: no se propondrá sola.`
        : `${sinDia.length} rutinas no están programadas: no se propondrán solas.`,
    )
  }

  return avisos
}

/**
 * Texto corto del estado de una rutina respecto al plan.
 * Ej: "Lunes y miércoles" o "Sin día asignado".
 */
export function textoDeDias(rutina: Routine): string {
  const dias = diasDeRutina(rutina)
  if (dias.length === 0) return 'Sin día asignado'
  if (dias.length === 7) return 'Todos los días'
  const nombres = dias.map((d) => nombreDelDia(d))
  if (nombres.length === 1) return nombres[0].charAt(0).toUpperCase() + nombres[0].slice(1)
  return nombres.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join(', ')
}

/** Dias asignados a una rutina, en orden de semana y sin repetidos. */
export function diasDeRutina(rutina: Routine): number[] {
  const crudos = rutina.weekdays ?? []
  const orden = [1, 2, 3, 4, 5, 6, 0]
  return [...new Set(crudos)].sort((a, b) => orden.indexOf(a) - orden.indexOf(b))
}

/** Si esa rutina toca hoy. */
export function tocaHoy(rutina: Routine, hoy: number): boolean {
  return diasDeRutina(rutina).includes(hoy)
}
