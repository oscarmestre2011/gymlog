import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

/**
 * Avisa de que hay una version nueva ya publicada.
 *
 * Como se detecta, y por que asi:
 *
 * Lo natural seria escuchar el evento "updatefound" del service worker, pero ese evento
 * SOLO salta cuando cambia el fichero sw.js. Entre dos despliegues normales lo que
 * cambia es el codigo de la app (los ficheros index-XXXX.js), no el sw.js, asi que el
 * aviso no se disparaba nunca: la app se actualizaba sola, pero sin avisar, y parecia
 * que el cambio no habia llegado. Comprobado en scripts/test-update-real.mjs.
 *
 * Ahora se comprueba de forma directa: se pide el index.html actual y se mira que fichero
 * de la app referencia. Si es distinto del que esta en uso, hay version nueva. Es una
 * peticion pequena y solo se hace al abrir y al volver a la app.
 *
 * OJO, y esto costo descubrirlo: la peticion lleva un parametro distinto en cada
 * comprobacion (`?comprobacion=...`), y NO es un detalle cosmetico. Quien responde a esta
 * peticion es el service worker, y para las navegaciones y para index.html sirve SU COPIA
 * guardada (red primero, pero con la copia como respaldo). Con "cache: 'no-store'" a secas
 * la app recibia su propia copia, comparaba el index publicado consigo mismo, concluia que
 * no habia nada nuevo y el aviso no salia NUNCA. El parametro hace que la direccion no
 * coincida con ninguna entrada de la cache y la peticion llegue de verdad al servidor.
 */
const UPDATE_EVENT = 'gymlog:update-ready'

/**
 * Nombre del archivo de la app que esta en uso ahora mismo.
 *
 * Se busca por la etiqueta marcada con `data-app="raiz"` (ver index.html), y si no aparece se
 * miran todas las etiquetas de script. Hay que mirar tambien los `link`, porque la marca va en
 * un `link`: el compilador ELIMINA los `id` y los `data-` de la etiqueta del script al preparar
 * la version publicada, y en el `link` los conserva (comprobado en dist/index.html).
 *
 * Por que no vale "el primero que encaje": es fragil. Si en la pagina hubiera dos archivos con
 * ese nombre (una prueba, otra herramienta), se compararia el publicado contra el equivocado y
 * se concluiria que no hay nada nuevo. Se descubrio asi: la prueba de deteccion anadia una
 * segunda copia de este archivo y el aviso dejaba de salir.
 */
function ficheroEnUso(): string | null {
  const marcada = document.querySelector('[data-app="raiz"]')
  const etiquetas = [
    ...(marcada ? [marcada] : []),
    ...document.querySelectorAll('script[src], link[href]'),
  ]
  for (const etiqueta of etiquetas) {
    const src = etiqueta.getAttribute('src') ?? etiqueta.getAttribute('href') ?? ''
    const nombre = /index-[A-Za-z0-9_-]+\.js/.exec(src)
    if (nombre) return nombre[0]
  }
  return null
}

async function hayVersionNueva(): Promise<boolean> {
  const enUso = ficheroEnUso()
  if (!enUso) return false
  try {
    /*
     * `no-store` evita la cache del navegador, y el parametro evita la del service worker:
     * hacen falta los dos. Ver la explicacion de arriba.
     */
    const respuesta = await fetch(`./index.html?comprobacion=${Date.now()}`, { cache: 'no-store' })
    if (!respuesta.ok) return false
    const html = await respuesta.text()
    const publicado = /index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0]
    return Boolean(publicado) && publicado !== enUso
  } catch {
    // Sin conexion: no se puede saber, y no pasa nada por no avisar.
    return false
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let avisado = false
  const comprobar = async () => {
    if (avisado) return
    if (await hayVersionNueva()) {
      avisado = true
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
    }
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        // Se comprueba al arrancar y cada vez que la app vuelve a primer plano.
        void comprobar()
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            // Ademas de mirar la version, se pide al navegador que revise el sw.js.
            registration.update().catch(() => {
              /* sin conexion: se reintentara en la proxima apertura */
            })
            void comprobar()
          }
        })
      })
      .catch(() => {
        /* si falla el service worker, la app sigue funcionando; solo pierde el modo offline */
      })

    // Cuando el service worker nuevo toma el control, se recarga una sola vez.
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return
      recargando = true
      window.location.reload()
    })
  })
}

const root = document.getElementById('root')
if (!root) throw new Error('Falta el elemento #root')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App updateEvent={UPDATE_EVENT} />
  </React.StrictMode>,
)
