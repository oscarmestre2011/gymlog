import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

/**
 * Avisa de que hay una version nueva ya descargada y lista para usar.
 *
 * Por que hace falta: medido con scripts/update-behavior.mjs, cuando se publica
 * una version nueva la app sigue mostrando la anterior durante la siguiente
 * apertura, y se actualiza sola en la de despues. Sin este aviso, parece que el
 * cambio "no ha llegado". Con el aviso, el usuario decide: recargar ahora o
 * seguir entrenando y actualizar luego.
 */
const UPDATE_EVENT = 'gymlog:update-ready'

function announceUpdate() {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
}

// La app es offline por diseno: los datos viven en el dispositivo.
// El service worker permite abrirla y registrar series sin cobertura.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        // Si ya hay una version nueva esperando, se avisa de inmediato.
        if (registration.waiting) announceUpdate()

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            // "installed" con un controlador activo significa: hay reemplazo listo.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              announceUpdate()
            }
          })
        })

        // Se comprueba si hay novedades cada vez que se vuelve a la app.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {
              /* sin conexion: se reintentara en la proxima apertura */
            })
          }
        })
      })
      .catch(() => {
        /* si falla, la app sigue funcionando; solo pierde el modo offline */
      })

    // Cuando el service worker nuevo toma el control, se recarga una sola vez.
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
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
