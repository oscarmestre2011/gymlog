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

const VERSION = 'v8'
const CACHE = `gymlog-${VERSION}`
/** Tiempo maximo que se espera a la red al abrir la app, antes de usar la copia. */
const LIMITE_NAVEGACION_MS = 2500

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  // El emblema que se ve dentro de la app: sin el, la cabecera y la bienvenida
  // saldrian sin logo cuando no hay conexion.
  './logo-mark.png',
  './logo-mark-grande.png',
]

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

/**
 * Clave con la que se guarda y se busca en la cache.
 *
 * IMPORTANTE: siempre la misma para una misma direccion. Antes se guardaba el HTML con
 * un objeto Request y se buscaba con otro de configuracion distinta, y la busqueda
 * acababa devolviendo una copia vieja: la app servia el HTML anterior aunque el nuevo
 * estuviera ya en la cache (se veian incluso tres entradas "/gymlog/index.html"
 * distintas en la misma cache). Se normalizan a una unica clave por direccion.
 *
 * La clave INCLUYE lo que va despues de la interrogacion (`?`). Esto no es un detalle: la
 * app pide `index.html?comprobacion=123` para saber si hay una version nueva, y si aqui se
 * borrara el parametro esa peticion acabaria devolviendo la copia guardada en lugar de ir al
 * servidor. Resultado: la app comparaba la copia consigo misma y el aviso de "version nueva"
 * no salia NUNCA. Se descubrio con scripts/test-deteccion-version.mjs, que levanta la version
 * anterior de verdad y comprueba que la app se entera del cambio.
 */
function claveDe(request) {
  const url = new URL(request.url)
  return new Request(url.origin + url.pathname + url.search, { method: 'GET' })
}

/** Guarda una respuesta valida en cache sin bloquear la respuesta al cliente. */
async function store(request, response) {
  try {
    const url = new URL(request.url)

    /*
     * Las comprobaciones de version NO se guardan.
     *
     * La app pide `index.html?comprobacion=123` para saber si hay version nueva. Si esa
     * respuesta se guardara, la cache se llenaria de copias del mismo index (una por
     * comprobacion) y ademas quedaria una copia mas que podria devolverse por error. Para
     * servir la app ya esta la copia canonica, sin parametros.
     */
    if (url.pathname.endsWith('/index.html') && url.search) return

    const cache = await caches.open(CACHE)
    await cache.put(claveDe(request), response)
  } catch {
    /* cuota llena o respuesta no cacheable: no es critico */
  }
}

/** Busca en cache usando siempre la misma clave. */
async function buscar(request) {
  try {
    const cache = await caches.open(CACHE)
    return (await cache.match(claveDe(request))) ?? null
  } catch {
    return null
  }
}

/**
 * Espera una promesa como maximo `ms` milisegundos. Si tarda mas, devuelve null y se
 * sigue por otro camino (la copia guardada), en lugar de dejar al usuario esperando.
 */
function conLimite(promesa, ms) {
  return new Promise((resolve) => {
    const temporizador = setTimeout(() => resolve(null), ms)
    promesa
      .then((valor) => {
        clearTimeout(temporizador)
        resolve(valor)
      })
      .catch(() => {
        clearTimeout(temporizador)
        resolve(null)
      })
  })
}

/**
 * Sirve desde cache y, si hay red, actualiza la copia por detras.
 * La respuesta al cliente sale de inmediato: la app nunca espera al servidor.
 */
async function cacheFirst(request, options = {}) {
  const cached = await buscar(request)
  const background = fetch(claveDe(request))
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

  const fallback = await buscar(new Request('./index.html', { credentials: 'same-origin' }))
  return (
    fallback ??
    new Response('Sin conexión y sin copia en caché.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegaciones (abrir la app, recargar): RED PRIMERO, con la copia como respaldo.
  //
  // Antes era "cache primero" para arrancar siempre rapido, pero eso hacia que al abrir
  // la app siguiera saliendo la version anterior aunque hubiera una nueva publicada:
  // parecia que el cambio no habia llegado. Ahora se pide a la red con un tiempo limite
  // corto (2,5 s): si responde, se ve la version nueva al momento; si no hay conexion o
  // va muy lenta, se usa la copia guardada y la app arranca igual sin cobertura.
  if (request.mode === 'navigate') {
    const indice = new Request('./index.html', { credentials: 'same-origin' })
    event.respondWith(
      (async () => {
        const copia = await buscar(indice)
        const respuestaRed = await conLimite(fetch(claveDe(indice)), LIMITE_NAVEGACION_MS)
        if (respuestaRed && respuestaRed.ok) {
          /*
           * Se guarda SIEMPRE bajo la clave canonica de index.html, nunca bajo la direccion
           * concreta de la navegacion. Si no, abrir la app por "/" y por "/index.html" dejaria
           * dos copias de la misma pagina, que es justo el fallo que hacia que se sirviera una
           * version antigua (lo comprueba scripts/update-banner.mjs).
           */
          await store(indice, respuestaRed.clone())
          return respuestaRed
        }
        if (copia) return copia
        return (
          respuestaRed ??
          new Response('Sin conexión y sin copia en caché.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        )
      })(),
    )
    return
  }

  // El manifiesto (nombre e iconos) va a RED PRIMERO, con la copia como respaldo.
  //
  // Motivo: al renombrar la app (GymLog -> Kairós) el service worker seguia sirviendo
  // el manifiesto precargado, asi que la app ya se llamaba Kairós en pantalla pero el
  // nombre del icono instalado seguia siendo el antiguo. El manifiesto pesa menos de
  // 1 KB: pedirlo a la red no cuesta nada y evita esa incoherencia. Sin conexion se
  // usa la copia guardada, asi que la instalacion sigue funcionando offline.
  if (url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      fetch(claveDe(request))
        .then(async (response) => {
          if (response && response.ok && response.type !== 'opaque') {
            await store(request, response.clone())
          }
          return response
        })
        .catch(async () => {
          const cached = await buscar(request)
          return cached ?? buscar(new Request('./manifest.webmanifest'))
        }),
    )
    return
  }

  // Recursos estaticos: cache primero (llevan hash, o son iconos).
  event.respondWith(cacheFirst(request))
})
