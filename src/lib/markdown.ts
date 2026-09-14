import type { CardioEntry, ExerciseSet, Session } from '../types'
import { formatDuration, formatNumber, weekdayName } from './format'

/**
 * Exportacion a Markdown con el mismo formato que el usuario ya usa en su vault
 * de Obsidian (tablas, fecha YYYY-MM-DD, kilos con coma decimal).
 *
 * Es una salida de solo lectura: la app no escribe en el vault por su cuenta.
 */
export function sessionsToMarkdown(
  sessions: Session[],
  sets: ExerciseSet[],
  cardio: CardioEntry[],
): string {
  const setsBySession = new Map<string, ExerciseSet[]>()
  for (const set of sets) {
    const list = setsBySession.get(set.sessionId) ?? []
    list.push(set)
    setsBySession.set(set.sessionId, list)
  }

  const ordered = sessions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)

  const lines: string[] = []
  lines.push('# Registro de entrenamiento')
  lines.push('')
  lines.push(`> Exportado desde GymLog el ${new Date().toLocaleString('es-ES')}`)
  lines.push(`> ${ordered.length} sesiones`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const session of ordered) {
    const own = (setsBySession.get(session.id) ?? []).slice().sort((a, b) => a.order - b.order || a.setNumber - b.setNumber)
    const duration = session.endedAt ? Math.round((session.endedAt - session.startedAt) / 1000) : null

    lines.push(`## ${session.date} — ${session.routineName}`)
    lines.push('')
    lines.push(`- **Día:** ${weekdayName(session.date)}`)
    if (duration) lines.push(`- **Duración:** ${formatDuration(duration)}`)
    if (session.metrics.bodyweightKg) lines.push(`- **Peso corporal:** ${formatNumber(session.metrics.bodyweightKg)} kg`)
    if (session.metrics.energy) lines.push(`- **Energía:** ${session.metrics.energy}/5`)
    lines.push('')

    // Agrupar series por ejercicio conservando el orden.
    const byExercise = new Map<string, ExerciseSet[]>()
    for (const set of own) {
      const list = byExercise.get(set.exerciseName) ?? []
      list.push(set)
      byExercise.set(set.exerciseName, list)
    }

    if (byExercise.size > 0) {
      lines.push('| Ejercicio | Series | Reps | Peso | RIR |')
      lines.push('|---|---|---|---|---|')
      for (const [name, list] of byExercise) {
        const working = list.filter((s) => !s.isWarmup)
        const pool = working.length > 0 ? working : list
        const reps = pool.map((s) => s.reps).join('/')
        const weights = [...new Set(pool.map((s) => s.weight))]
        const weightText =
          weights.length === 1
            ? weights[0] <= 0
              ? 'PC'
              : `${formatNumber(weights[0])} kg`
            : pool.map((s) => (s.weight <= 0 ? 'PC' : formatNumber(s.weight))).join('/') + ' kg'
        const rir = pool.filter((s) => s.rir !== undefined).map((s) => s.rir).join('/')
        lines.push(`| ${name} | ${pool.length} | ${reps} | ${weightText} | ${rir || '—'} |`)
      }
      lines.push('')
    }

    const sessionCardio = cardio.filter((c) => c.sessionId === session.id)
    if (sessionCardio.length > 0) {
      for (const entry of sessionCardio) {
        lines.push(
          `- **Cardio:** ${entry.activity} · ${formatDuration(entry.durationMin * 60)}${
            entry.distanceKm ? ` · ${formatNumber(entry.distanceKm)} km` : ''
          }${entry.elevationM ? ` · +${entry.elevationM} m` : ''}`,
        )
      }
      lines.push('')
    }

    if (session.metrics.notes) {
      lines.push(`**Sensaciones:** ${session.metrics.notes}`)
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  const cardioSolo = cardio.filter((c) => !c.sessionId)
  if (cardioSolo.length > 0) {
    lines.push('## Cardio (sin sesión de fuerza)')
    lines.push('')
    lines.push('| Fecha | Actividad | Duración | Distancia | Desnivel | FC media |')
    lines.push('|---|---|---|---|---|---|')
    for (const entry of cardioSolo.slice().sort((a, b) => b.date.localeCompare(a.date))) {
      lines.push(
        `| ${entry.date} | ${entry.activity} | ${formatDuration(entry.durationMin * 60)} | ${
          entry.distanceKm ? `${formatNumber(entry.distanceKm)} km` : '—'
        } | ${entry.elevationM ? `+${entry.elevationM} m` : '—'} | ${entry.avgHr ? `${entry.avgHr} bpm` : '—'} |`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** Progresion por ejercicio en Markdown, al estilo de la tabla del vault. */
export function progressionToMarkdown(
  rows: {
    exerciseName: string
    entries: { date: string; summary: string; topWeight: number; volume: number }[]
  }[],
): string {
  const lines: string[] = []
  lines.push('# Progresión de ejercicios')
  lines.push('')
  lines.push(`> Exportado desde GymLog el ${new Date().toLocaleString('es-ES')}`)
  lines.push('')

  for (const row of rows) {
    lines.push(`## ${row.exerciseName}`)
    lines.push('')
    lines.push('| Fecha | Series | Mejor peso | Volumen |')
    lines.push('|---|---|---|---|')
    for (const entry of row.entries.slice().reverse()) {
      lines.push(
        `| ${entry.date} | ${entry.summary} | ${formatNumber(entry.topWeight)} kg | ${formatNumber(Math.round(entry.volume))} kg |`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
