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
 * Ahora se comprueba de forma directa: se pide el index.html actual SIN usar la cache y
 * se mira que fichero de la app referencia. Si es distinto del que esta en uso, hay
 * version nueva. Es una peticion pequena y solo se hace al abrir y al volver a la app.
 */
const UPDATE_EVENT = 'gymlog:update-ready'

function ficheroEnUso(): string | null {
  for (const script of [...document.querySelectorAll('script[src]')]) {
    const src = script.getAttribute('src') ?? ''
    const nombre = /index-[A-Za-z0-9_-]+\.js/.exec(src)
    if (nombre) return nombre[0]
  }
  return null
}

async function hayVersionNueva(): Promise<boolean> {
  const enUso = ficheroEnUso()
  if (!enUso) return false
  try {
    // cache: 'no-store' para que no lo sirva la copia guardada: aqui interesa la verdad.
    const respuesta = await fetch('./index.html', { cache: 'no-store' })
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
