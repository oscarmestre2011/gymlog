/**
 * Pruebas del aviso de copia de seguridad.
 *
 * Es la unica proteccion real de los datos: viven solo en el movil. Aqui se comprueba
 * que el aviso sale cuando toca y, sobre todo, que NO sale cuando no toca (una app que
 * avisa de mas acaba ignorandose).
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { estadoDeCopia, mensajeDeCopia } from './backup'

const dias = (n: number) => n * 86400000

describe('aviso de copia de seguridad', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('avisa si nunca se ha hecho copia y hay datos', () => {
    const estado = estadoDeCopia({ backupReminderDays: 7 }, true)
    expect(estado.tipo).toBe('nunca')
    expect(mensajeDeCopia(estado).titulo).toMatch(/Todavía no has hecho ninguna copia/)
  })

  it('no avisa si no hay entrenamientos guardados', () => {
    // Recien instalada: no hay nada que perder, no se molesta al usuario.
    expect(estadoDeCopia({ backupReminderDays: 7 }, false).tipo).toBe('oculto')
  })

  it('no avisa si la copia esta al dia', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T10:00:00'))
    const hace3 = { backupReminderDays: 7, lastBackupAt: Date.now() - dias(3) }
    expect(estadoDeCopia(hace3, true).tipo).toBe('oculto')
  })

  it('avisa pasados los dias del limite', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T10:00:00'))
    const hace10 = { backupReminderDays: 7, lastBackupAt: Date.now() - dias(10) }
    const estado = estadoDeCopia(hace10, true)
    expect(estado.tipo).toBe('vencida')
    if (estado.tipo === 'vencida') {
      expect(estado.dias).toBe(10)
      expect(mensajeDeCopia(estado).titulo).toBe('Hace 10 días que no haces copia')
    }
  })

  it('justo en el limite ya avisa', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T10:00:00'))
    const hace7 = { backupReminderDays: 7, lastBackupAt: Date.now() - dias(7) }
    expect(estadoDeCopia(hace7, true).tipo).toBe('vencida')
  })

  it('un dia antes del limite todavia no avisa', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T10:00:00'))
    const hace6 = { backupReminderDays: 7, lastBackupAt: Date.now() - dias(6) }
    expect(estadoDeCopia(hace6, true).tipo).toBe('oculto')
  })

  it('respeta el intervalo elegido', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T10:00:00'))
    const hace10 = { backupReminderDays: 30, lastBackupAt: Date.now() - dias(10) }
    expect(estadoDeCopia(hace10, true).tipo).toBe('oculto')
  })

  it('se puede desactivar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T10:00:00'))
    const hace60 = { backupReminderDays: 0, lastBackupAt: Date.now() - dias(60) }
    const estado = estadoDeCopia(hace60, true)
    expect(estado.tipo).toBe('oculto')
    if (estado.tipo === 'oculto') expect(estado.motivo).toBe('desactivado')
  })

  it('sin ajuste guardado usa 7 dias por defecto', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T10:00:00'))
    const sinAjuste: Parameters<typeof estadoDeCopia>[0] = {
      lastBackupAt: Date.now() - dias(8),
    } as Parameters<typeof estadoDeCopia>[0]
    expect(estadoDeCopia(sinAjuste, true).tipo).toBe('vencida')
  })

  it('habla en singular con un dia', () => {
    const mensaje = mensajeDeCopia({ tipo: 'vencida', dias: 1, limite: 7 })
    expect(mensaje.titulo).toBe('Hace 1 día que no haces copia')
  })
})
