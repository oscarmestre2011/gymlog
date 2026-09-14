import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

// La app es offline por diseno: los datos viven en el dispositivo.
// El service worker solo evita que se quede en blanco sin cobertura.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* si falla, la app sigue funcionando; solo pierde el modo offline */
    })
  })
}

const root = document.getElementById('root')
if (!root) throw new Error('Falta el elemento #root')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
