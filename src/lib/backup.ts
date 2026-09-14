/**
 * Estado de la copia de seguridad, para poder avisar cuando toca.
 *
 * Los datos viven SOLO en el movil: si se borran los datos del navegador o se cambia de
 * telefono, sin copia no hay nada que hacer. Por eso la app avisa cuando lleva tiempo
 * sin hacerse copia.
 *
 * Esta funcion es pura a proposito: recibe los ajustes y si hay datos, y devuelve el
 * estado. Asi se puede probar sin navegador y la interfaz solo se encarga de mostrarlo.
 */

export type EstadoCopia =
  | { tipo: 'oculto'; motivo: 'sin-datos' | 'desactivado' | 'al-dia' }
  | { tipo: 'nunca' }
  | { tipo: 'vencida'; dias: number; limite: number }

export function estadoDeCopia(
  settings: { lastBackupAt?: number; backupReminderDays?: number },
  hayDatos: boolean,
): EstadoCopia {
  const limite = settings.backupReminderDays ?? 7
  if (limite <= 0) return { tipo: 'oculto', motivo: 'desactivado' }
  // Sin entrenamientos guardados no hay nada que perder: no se molesta.
  if (!hayDatos) return { tipo: 'oculto', motivo: 'sin-datos' }
  if (!settings.lastBackupAt) return { tipo: 'nunca' }

  const dias = Math.floor((Date.now() - settings.lastBackupAt) / 86400000)
  if (dias < limite) return { tipo: 'oculto', motivo: 'al-dia' }
  return { tipo: 'vencida', dias, limite }
}

/** Texto que se le muestra al usuario. */
export function mensajeDeCopia(estado: EstadoCopia): { titulo: string; detalle: string } {
  if (estado.tipo === 'nunca') {
    return {
      titulo: 'Todavía no has hecho ninguna copia',
      detalle:
        'Tus entrenamientos solo están en este móvil. Si se borran los datos del navegador, se pierden.',
    }
  }
  if (estado.tipo === 'vencida') {
    const dias = estado.dias
    return {
      titulo: dias === 1 ? 'Hace 1 día que no haces copia' : `Hace ${dias} días que no haces copia`,
      detalle:
        'Tus entrenamientos solo están en este móvil. Descarga una copia para no perderlos.',
    }
  }
  return { titulo: '', detalle: '' }
}
