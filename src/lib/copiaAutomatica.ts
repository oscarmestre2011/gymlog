import { exportBackup, getSettings, saveSettings } from '../db/repository'

/**
 * Copia de seguridad automatica en una carpeta del movil.
 *
 * COMO FUNCIONA
 * -------------
 * Se le pide al navegador una carpeta UNA sola vez (el usuario la elige). A partir de ahi, el
 * navegador recuerda el permiso concedido a esta app, y se puede escribir dentro cuando toque
 * sin volver a preguntar. La app guarda en esa carpeta un archivo JSON por dia.
 *
 * LIMITES, QUE CONVIENE TENER CLAROS
 * ----------------------------------
 * - En iPhone NO existe esta funcion: Safari no da acceso a carpetas. La app lo dice en Ajustes
 *   y no intenta nada, en lugar de fallar sin explicacion. Requiere `soportado === false`.
 * - El permiso puede caducar (al cerrar el navegador del todo, o si se borran los datos). Por
 *   eso se comprueba antes de cada copia y, si hace falta, se pide permiso: se hace en un
 *   momento en que el usuario esta usando la app, no en segundo plano.
 * - Una carpeta del MISMO movil no protege contra perder el movil. Protege contra borrar los
 *   datos del navegador o desinstalar la app, que es el riesgo mas frecuente. Para lo otro hay
 *   que sacar el archivo del telefono (compartirlo o subirlo a la nube).
 *
 * Los datos NO se cifran: es la misma copia que la descarga manual, para que se pueda volver a
 * importar desde la propia app.
 */

/** Nombre con el que se guarda el handle de la carpeta en la base de datos. */
const CLAVE_CARPETA = 'carpeta-copia'

/** Extructura minima del handle de carpeta, para no depender de los tipos del navegador. */
export interface CarpetaElegida {
  kind: 'directory'
  name: string
  queryPermission?: (opciones: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (opciones: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  getFileHandle: (nombre: string, opciones?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (datos: string) => Promise<void>; close: () => Promise<void> }>
  }>
}

type VentanaConCarpetas = Window & {
  showDirectoryPicker?: (opciones?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<CarpetaElegida>
}

/** Si este navegador puede escribir en una carpeta elegida por el usuario. */
export function soportado(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as VentanaConCarpetas).showDirectoryPicker === 'function'
}

/** Resultado de intentar una copia automatica. */
export type ResultadoCopia =
  | { estado: 'guardada'; archivo: string; carpeta: string }
  | { estado: 'sin-carpeta' }
  | { estado: 'sin-permiso' }
  | { estado: 'carpeta-perdida' }
  | { estado: 'no-soportado' }
  | { estado: 'error'; detalle: string }

/**
 * Nombre legible de un error, para poder decir QUE ha fallado.
 *
 * Antes cualquier fallo se anunciaba igual ("no se pudo guardar"), y en el movil el usuario solo
 * veia que no guardaba, sin saber por que. Distinguir el tipo de error es lo que permite
 * arreglarlo: si es de permiso, se pide; si es de carpeta, se elige otra.
 */
export function nombreDeError(error: unknown): string {
  const nombre = (error as { name?: string })?.name ?? ''
  if (nombre === 'NotAllowedError') return 'permiso denegado'
  if (nombre === 'NotFoundError') return 'la carpeta ya no está'
  if (nombre === 'InvalidStateError') return 'carpeta no válida'
  if (nombre === 'SecurityError') return 'el navegador ha bloqueado el acceso'
  if (nombre === 'QuotaExceededError') return 'no queda espacio'
  if (nombre === 'AbortError') return 'operación cancelada'
  return nombre || String(error).slice(0, 80)
}

/* -------------------- guardar y leer la carpeta elegida -------------------- */

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open('gymlog')
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

/**
 * Guarda el handle de la carpeta en IndexedDB.
 *
 * Va en IndexedDB (y no en el almacenamiento normal) porque un handle del sistema de archivos
 * es un objeto que hay que serializar estructuradamente; en el almacenamiento de texto se
 * perderia. Se hace en su propio almacen, con una transaccion propia: asi no depende de la
 * version del esquema de datos ni hay que migrar la base cuando se anada esta funcion.
 *
 * OJO con la clave, que aqui estuvo un fallo que solo se veia en el movil:
 * el almacen se declara con clave propia (`'carpeta-copia': 'clave'`), asi que la clave va DENTRO
 * del objeto que se guarda y NO se pasa como segundo argumento de `put`. Pasandola aparte, el
 * navegador del movil respondia `DataError: the object store uses in-line keys and the key
 * parameter was provided`, la carpeta no se guardaba y el usuario veia "no se ha podido recordar
 * la carpeta". En el navegador de escritorio colaba, y por eso las pruebas no lo detectaron:
 * hacian falta datos reales en un movil para que apareciera.
 */
export async function guardarCarpeta(carpeta: CarpetaElegida | null): Promise<void> {
  const db = await abrirBase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('carpeta-copia', 'readwrite')
      const almacen = tx.objectStore('carpeta-copia')
      if (carpeta) {
        // La clave va dentro del objeto: el almacen usa clave propia.
        almacen.put({ clave: CLAVE_CARPETA, carpeta })
      } else {
        almacen.delete(CLAVE_CARPETA)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('transacción cancelada'))
    })
  } finally {
    db.close()
  }
}

/** Lee la carpeta guardada, si la hay. */
export async function leerCarpeta(): Promise<CarpetaElegida | null> {
  try {
    const db = await abrirBase()
    try {
      return await new Promise<CarpetaElegida | null>((resolve) => {
        const tx = db.transaction('carpeta-copia', 'readonly')
        const peticion = tx.objectStore('carpeta-copia').get(CLAVE_CARPETA)
        peticion.onsuccess = () => {
          const guardado = peticion.result as { carpeta?: CarpetaElegida } | CarpetaElegida | undefined
          if (!guardado) return resolve(null)
          /*
           * Se aceptan los dos formatos: el actual (con la clave dentro) y uno antiguo por si
           * alguna version llego a guardarlo de otra forma. Asi nadie pierde su carpeta por un
           * cambio de formato.
           */
          resolve('carpeta' in guardado ? (guardado.carpeta ?? null) : (guardado as CarpetaElegida))
        }
        peticion.onerror = () => resolve(null)
      })
    } finally {
      db.close()
    }
  } catch {
    // Si la base no tiene ese almacen (version antigua), no hay carpeta configurada.
    return null
  }
}

/**
 * Pide al usuario que elija la carpeta.
 *
 * Distingue tres casos, porque se responden de forma distinta:
 * - 'elegida': todo bien.
 * - 'cancelada': el usuario ha cerrado el dialogo. No hay nada que anunciar.
 * - 'no-guardada': la carpeta se eligio pero NO se pudo recordar. Esto hay que decirlo: si no,
 *   el usuario creeria que ya esta configurada y las copias no se harian. Se descubrio con la
 *   prueba, simulando una carpeta que no se puede guardar.
 */
export type ResultadoElegir = 'elegida' | 'cancelada' | 'no-guardada'

export async function elegirCarpeta(): Promise<{
  estado: ResultadoElegir
  carpeta: CarpetaElegida | null
  /** Que ha fallado exactamente, si no se pudo recordar la carpeta. */
  detalle?: string
}> {
  const ventana = window as VentanaConCarpetas
  if (!ventana.showDirectoryPicker) return { estado: 'cancelada', carpeta: null }

  let carpeta: CarpetaElegida
  try {
    carpeta = await ventana.showDirectoryPicker({ mode: 'readwrite', id: 'kairos-copias' })
  } catch {
    // El usuario ha cerrado el dialogo: no es un error que haya que anunciar.
    return { estado: 'cancelada', carpeta: null }
  }

  try {
    await guardarCarpeta(carpeta)
    return { estado: 'elegida', carpeta }
  } catch (error) {
    /*
     * Se devuelve el motivo, no solo que ha fallado.
     *
     * Al usuario le salia "no se ha podido recordar la carpeta" y ni el ni yo podiamos saber por
     * que: el error se estaba tirando a la basura. Saber si es DataCloneError (el navegador no
     * sabe guardar la carpeta) o NotFoundError (falta el almacen) es la diferencia entre poder
     * arreglarlo y no poder.
     */
    return { estado: 'no-guardada', carpeta: null, detalle: nombreDeError(error) }
  }
}

/**
 * Comprueba que se puede escribir, y si no, pide permiso.
 *
 * `pedir` debe ser true solo cuando hay una interaccion del usuario de por medio (un boton): los
 * navegadores no conceden permisos sin que el usuario haya hecho algo.
 */
export async function permisoParaEscribir(carpeta: CarpetaElegida, pedir: boolean): Promise<boolean> {
  try {
    const consultar = carpeta.queryPermission?.({ mode: 'readwrite' })
    const estado = consultar ? await consultar : 'granted'
    if (estado === 'granted') return true
    if (!pedir || !carpeta.requestPermission) return false
    return (await carpeta.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

/* ------------------------------ nombre y copia ---------------------------- */

/** Nombre del archivo: uno por dia, y con hora y minutos para no pisar el anterior. */
export function nombreDeCopia(fecha = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const y = fecha.getFullYear()
  const m = dos(fecha.getMonth() + 1)
  const d = dos(fecha.getDate())
  return `kairos-copia-${y}-${m}-${d}.json`
}

/**
 * Guarda una copia en la carpeta configurada.
 *
 * `pedirPermiso` se pone a true cuando la llamada viene de un boton (el usuario esta delante).
 * Si la copia automatica falla por falta de permiso, se devuelve 'sin-permiso' y la app avisa:
 * es mejor decirlo que dejar creer que hay copias que en realidad no se estan haciendo.
 */
export async function copiarACarpeta(opciones: { pedirPermiso?: boolean } = {}): Promise<ResultadoCopia> {
  if (!soportado()) return { estado: 'no-soportado' }

  const carpeta = await leerCarpeta()
  if (!carpeta) return { estado: 'sin-carpeta' }

  /*
   * Si el usuario esta delante (ha pulsado un boton), NO se abandona por falta de permiso: se
   * PIDE. Este era el fallo que sufria el usuario en el movil: la carpeta se elegia bien, pero
   * al ir a guardar el permiso ya no estaba concedido y la app se retiraba sin intentarlo
   * siquiera, sin dejar forma de arreglarlo desde esa pantalla.
   */
  if (!(await permisoParaEscribir(carpeta, opciones.pedirPermiso ?? false))) {
    return { estado: 'sin-permiso' }
  }

  const copia = await exportBackup()
  const archivo = nombreDeCopia()
  const contenido = JSON.stringify(copia, null, 2)

  const escribir = async () => {
    const manejador = await carpeta.getFileHandle(archivo, { create: true })
    const escritor = await manejador.createWritable()
    try {
      await escritor.write(contenido)
    } finally {
      /*
       * Cerrar SIEMPRE. Si se cierra solo cuando la escritura va bien, un fallo deja el archivo
       * a medias y sin confirmar, y el error que se ve despues no tiene nada que ver con el
       * problema real.
       */
      await escritor.close().catch(() => undefined)
    }
  }

  try {
    await escribir()
  } catch (error) {
    const tipo = nombreDeError(error)

    /*
     * Si el navegador retiro el permiso justo ahora (pasa en el movil), se pide y se reintenta
     * una vez. El usuario esta delante y acaba de pulsar: es el momento correcto para pedirlo.
     */
    if ((error as { name?: string })?.name === 'NotAllowedError' && (opciones.pedirPermiso ?? false)) {
      if (await permisoParaEscribir(carpeta, true)) {
        try {
          await escribir()
          await saveSettings({ lastBackupAt: Date.now() })
          return { estado: 'guardada', archivo, carpeta: carpeta.name }
        } catch (segundo) {
          return { estado: 'error', detalle: nombreDeError(segundo) }
        }
      }
      return { estado: 'sin-permiso' }
    }

    if ((error as { name?: string })?.name === 'NotFoundError') {
      // La carpeta elegida ya no existe (se borro o se movio): hay que elegir otra.
      return { estado: 'carpeta-perdida' }
    }
    return { estado: 'error', detalle: tipo }
  }

  await saveSettings({ lastBackupAt: Date.now() })
  return { estado: 'guardada', archivo, carpeta: carpeta.name }
}

/**
 * Copia automatica, si esta activada y toca.
 *
 * Se llama al abrir la app. No pide permisos (no hay interaccion), asi que si el navegador los
 * ha caducado simplemente devuelve 'sin-permiso' y la app lo avisa para que se renueve con un
 * toque. Se evita repetir la copia el mismo dia.
 */
export async function copiaAutomaticaSiToca(): Promise<ResultadoCopia | null> {
  const ajustes = await getSettings()
  if (!ajustes.autoBackupWeeks) return null
  if (!soportado()) return null

  const carpeta = await leerCarpeta()
  if (!carpeta) return null
  if (!(await permisoParaEscribir(carpeta, false))) return { estado: 'sin-permiso' }

  const dias = ajustes.autoBackupWeeks * 7
  if (ajustes.lastBackupAt) {
    const diasDesde = (Date.now() - ajustes.lastBackupAt) / 86400000
    if (diasDesde < dias) return null
  }

  return copiarACarpeta({ pedirPermiso: false })
}
