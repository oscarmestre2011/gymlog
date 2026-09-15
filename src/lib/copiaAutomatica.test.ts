/**
 * Pruebas de la copia automatica en carpeta.
 *
 * Se comprueba lo que decide si la funcion sirve o no: cuando esta disponible, cuando no, el
 * nombre del archivo y que un permiso caducado NO se confunda con una copia hecha. Eso ultimo
 * importa mucho: si la app creyera que copia cuando en realidad no puede, el usuario se
 * quedaria sin copias y sin saberlo.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { nombreDeCopia, nombreDeError, permisoParaEscribir, soportado, type CarpetaElegida } from './copiaAutomatica'

/** Carpeta de mentira, con el permiso que se le indique. */
function carpetaFalsa(estado: PermissionState, concederaAlPedir = false): CarpetaElegida {
  return {
    kind: 'directory',
    name: 'Documentos',
    queryPermission: async () => estado,
    requestPermission: async () => {
      estado = concederaAlPedir ? 'granted' : 'denied'
      return estado
    },
    getFileHandle: async () => ({
      createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
    }),
  }
}

describe('nombre del archivo de copia', () => {
  it('lleva la fecha, para que se ordenen solos', () => {
    const nombre = nombreDeCopia(new Date(2026, 8, 16))
    expect(nombre).toBe('kairos-copia-2026-09-16.json')
  })

  it('un solo digito no pierde el cero', () => {
    expect(nombreDeCopia(new Date(2026, 0, 5))).toBe('kairos-copia-2026-01-05.json')
  })

  it('lleva la palabra kairos, para reconocerlo entre otros archivos', () => {
    expect(nombreDeCopia()).toMatch(/^kairos-copia-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

describe('disponibilidad segun el navegador', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('en un navegador sin la funcion, no esta soportado', () => {
    // Es el caso de Safari en iPhone: no existe, y la app debe decirlo en lugar de fallar.
    vi.stubGlobal('window', {})
    expect(soportado()).toBe(false)
  })

  it('con la funcion disponible, si esta soportado', () => {
    vi.stubGlobal('window', { showDirectoryPicker: () => Promise.resolve(null) })
    expect(soportado()).toBe(true)
  })
})

describe('permisos de escritura', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('con permiso concedido, escribe sin preguntar', async () => {
    const carpeta = carpetaFalsa('granted')
    expect(await permisoParaEscribir(carpeta, false)).toBe(true)
  })

  it('sin permiso y sin poder pedirlo (copia automatica), no escribe', async () => {
    // Al abrir la app no hay interaccion del usuario: no se puede pedir permiso.
    const carpeta = carpetaFalsa('prompt')
    expect(await permisoParaEscribir(carpeta, false)).toBe(false)
  })

  it('sin permiso pero desde un boton, lo pide y lo consigue', async () => {
    const carpeta = carpetaFalsa('prompt', true)
    expect(await permisoParaEscribir(carpeta, true)).toBe(true)
  })

  it('si el usuario deniega, no se escribe', async () => {
    const carpeta = carpetaFalsa('prompt', false)
    expect(await permisoParaEscribir(carpeta, true)).toBe(false)
  })

  it('si el navegador da error al consultar, no se escribe (no se da por hecho)', async () => {
    const carpeta: CarpetaElegida = {
      ...carpetaFalsa('granted'),
      queryPermission: async () => {
        throw new Error('no se puede consultar')
      },
    }
    expect(await permisoParaEscribir(carpeta, true)).toBe(false)
  })

  it('si el permiso está pendiente y el usuario está delante, se PIDE (no se abandona)', async () => {
    /*
     * Este era el fallo del movil: la carpeta se elegia bien, pero al guardar el permiso ya no
     * estaba y la app se retiraba sin pedirlo. El usuario solo veia que no guardaba.
     */
    let pedido = 0
    const carpeta: CarpetaElegida = {
      ...carpetaFalsa('prompt', true),
      requestPermission: async () => {
        pedido += 1
        return 'granted'
      },
    }
    expect(await permisoParaEscribir(carpeta, true)).toBe(true)
    expect(pedido).toBe(1)
  })

  it('si no hay nadie delante (copia automática), no se pide permiso', async () => {
    // Sin interaccion del usuario los navegadores no lo conceden: pedirlo seria inutil y ademas
    // molesto. Se informa y el usuario lo renueva cuando quiera.
    let pedido = 0
    const carpeta: CarpetaElegida = {
      ...carpetaFalsa('prompt', true),
      requestPermission: async () => {
        pedido += 1
        return 'granted'
      },
    }
    expect(await permisoParaEscribir(carpeta, false)).toBe(false)
    expect(pedido).toBe(0)
  })

  it('si el navegador no sabe consultar permisos, se asume que si (caso raro)', async () => {
    const carpeta: CarpetaElegida = {
      kind: 'directory',
      name: 'Documentos',
      getFileHandle: async () => ({
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
      }),
    }
    expect(await permisoParaEscribir(carpeta, false)).toBe(true)
  })
})

describe('mensajes de error comprensibles', () => {
  /*
   * Antes cualquier fallo se anunciaba igual ("no se pudo guardar") y en el movil el usuario no
   * podia saber que pasaba. Distinguir el tipo de error es lo que permite arreglarlo.
   */
  it('traduce los errores del navegador a algo que se entiende', () => {
    expect(nombreDeError({ name: 'NotAllowedError' })).toBe('permiso denegado')
    expect(nombreDeError({ name: 'NotFoundError' })).toBe('la carpeta ya no está')
    expect(nombreDeError({ name: 'QuotaExceededError' })).toBe('no queda espacio')
    expect(nombreDeError({ name: 'SecurityError' })).toBe('el navegador ha bloqueado el acceso')
    expect(nombreDeError({ name: 'AbortError' })).toBe('operación cancelada')
    expect(nombreDeError({ name: 'InvalidStateError' })).toBe('carpeta no válida')
  })

  it('con un error desconocido, al menos dice su nombre', () => {
    expect(nombreDeError({ name: 'ErrorRaro' })).toBe('ErrorRaro')
    expect(nombreDeError('algo ha pasado')).toContain('algo ha pasado')
  })
})
