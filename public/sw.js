/* eslint-env serviceworker */
/*
 * Service worker de GymLog.
 *
 * Objetivo: que la app abra SIEMPRE, tambien en el gimnasio sin cobertura.
 *
 * Reglas aprendidas de las pruebas:
 * - Los recursos con hash de Vite (index-XXXX.js, index-XXXX.css) van a CACHE PRIMERO:
 *   su nombre cambia en cada compilacion, asi que servir la copia nunca da codigo viejo.
 * - El HTML tambien va a CACHE PRIMERO, pero con ACTUALIZACION EN SEGUNDO PLANO: se sirve
 *   la copia al instante y se pide la nueva por detras. Con "red primero" el navegador
 *   revalidaba la copia contra el servidor, y sin conexion eso devolvia un error en vez
 *   de la pagina: la app se quedaba en blanco justo cuando mas falta hace.
 * - Si no hay copia, se intenta la red y, como ultimo recurso, el index cacheado.
 *
 * Los DATOS no pasan por aqui: viven en IndexedDB.
 *
 * Al cambiar este archivo, sube VERSION.
 */

const VERSION = 'v2'
const CACHE = `gymlog-${VERSION}`
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // addAll falla entero si un solo recurso falla: se piden uno a uno.
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch(() => {
            /* un icono ausente no debe impedir la instalacion */
          }),
        ),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

/** Guarda una respuesta valida en cache sin bloquear la respuesta al cliente. */
async function store(request, response) {
  try {
    const cache = await caches.open(CACHE)
    await cache.put(request, response)
  } catch {
    /* cuota llena o respuesta no cacheable: no es critico */
  }
}

/**
 * Sirve desde cache y, si hay red, actualiza la copia por detras.
 * La respuesta al cliente sale de inmediato: la app nunca espera al servidor.
 */
async function cacheFirst(request, options = {}) {
  const cached = await caches.match(request)
  const background = fetch(request)
    .then(async (response) => {
      if (response && response.ok && response.type !== 'opaque') {
        await store(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    if (!options.noRevalidate) background.catch(() => null)
    return cached
  }

  const fresh = await background
  if (fresh) return fresh

  const fallback = await caches.match('./index.html')
  return fallback ?? new Response('Sin conexión y sin copia en caché.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegaciones (abrir la app, recargar): cache primero para arrancar siempre.
  if (request.mode === 'navigate') {
    event.respondWith(
      cacheFirst(new Request('./index.html', { credentials: 'same-origin' }), { noRevalidate: false })
        .then(async (response) => {
          // Se guarda tambien bajo la ruta pedida (por ejemplo "/" o "/index.html").
          if (response.ok) await store(request, response.clone())
          return response
        }),
    )
    return
  }

  // Recursos estaticos: cache primero (llevan hash, o son iconos).
  event.respondWith(cacheFirst(request))
})
