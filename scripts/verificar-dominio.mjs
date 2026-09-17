/**
 * Comprueba que el dominio propio esta bien apuntado a GitHub Pages.
 *
 * Por que existe: poner un dominio nuevo tiene tres partes que fallan por separado y de forma
 * silenciosa (el DNS, el certificado HTTPS y que GitHub tenga el dominio apuntado en el
 * repositorio). Mirando la web "y si abre, bien" no se sabe cual de las tres esta mal, y cuando
 * algo no va se pierde mucho tiempo probando a ciegas.
 *
 * Uso:  node scripts/verificar-dominio.mjs [dominio]
 *       node scripts/verificar-dominio.mjs kairosentrena.com --esperar
 *
 * `--esperar` reintenta hasta 10 minutos, para dejarlo corriendo mientras se propaga el DNS.
 */

const dominio = (process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'kairosentrena.com').toLowerCase()
const esperar = process.argv.includes('--esperar')

import { resolveNs, resolveTxt } from 'node:dns/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

/** Las cuatro direcciones que publica GitHub para los dominios propios de Pages. */
const IPS_GITHUB = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153']
/** IPv6, opcionales. */
const IPS_GITHUB_V6 = [
  '2606:50c0:8000::153',
  '2606:50c0:8001::153',
  '2606:50c0:8002::153',
  '2606:50c0:8003::153',
]

let fallos = 0
let comprobaciones = 0

function comprobar(ok, descripcion, detalle = '') {
  comprobaciones++
  if (ok) {
    console.log(`  OK    ${descripcion}${detalle ? ` — ${detalle}` : ''}`)
  } else {
    console.log(`  FALLO ${descripcion}${detalle ? ` — ${detalle}` : ''}`)
    fallos++
  }
}

/** Resuelve sin petar: si no hay registro, devuelve lista vacia. */
async function intentar(fn) {
  try {
    return await fn()
  } catch {
    return []
  }
}

/**
 * Servidores DNS publicos a los que preguntar.
 *
 * Hace falta preguntarles a ellos y no solo al del ordenador: el DNS del sistema se queda con la
 * respuesta vieja en la cache (o el proveedor de internet tarda en refrescar), y entonces la
 * herramienta dice que el dominio esta mal cuando en realidad lleva horas funcionando. Paso de
 * verdad: dio dos fallos falsos con el dominio ya perfecto.
 *
 * Se usa `nslookup` porque en Node el parametro `resolver` de dns/promises no siempre respeta el
 * servidor que se le indica, y volvia a preguntar al del sistema.
 */
const DNS_PUBLICOS = ['8.8.8.8', '1.1.1.1']

/** Pregunta a un servidor DNS concreto y devuelve los valores (IPs o CNAMEs). */
async function consultar(dominio, tipo, servidor) {
  try {
    const { stdout } = await ejecutar('nslookup', ['-type=' + tipo, dominio, servidor], {
      timeout: 15000,
      windowsHide: true,
    })

    /*
     * El formato cambia segun el idioma de Windows ("Nombre:" / "Name:") y las direcciones pueden
     * venir en varias lineas debajo de "Addresses:". Por eso no se busca etiqueta por etiqueta:
     * se coge TODO lo que parece una direccion en la respuesta y se quita la del propio servidor
     * DNS, que es el unico que no nos interesa.
     */
    const direcciones = stdout.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b|\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{1,4}\b/gi) ?? []
    const sinServidor = direcciones.filter((ip) => ip !== servidor)

    // Los CNAME no son direcciones: vienen como "www.x.com canonical name = destino".
    const cnames = [...stdout.matchAll(/canonical name\s*=\s*([^\s]+)/gi)].map((m) => m[1])

    // Los TXT vienen entre comillas.
    const textos = [...stdout.matchAll(/"([^"]{6,})"/g)].map((m) => m[1])

    return [...new Set([...cnames, ...textos, ...sinServidor])]
  } catch {
    return []
  }
}

/**
 * Los servidores de nombres del dominio.
 *
 * Se pregunta al servidor .com (el "padre" del dominio), que es quien guarda de verdad quien
 * gestiona el DNS de kairosentrena.com. Es la unica via que funciona de forma fiable: el
 * `nslookup -type=NS` normal falla con frecuencia aunque el dominio este perfecto.
 */
async function servidoresDeNombres(dominio) {
  const sufijo = dominio.split('.').pop()
  const candidatos = [`a.gtld-servers.net`, `b.gtld-servers.net`]
  if (sufijo !== 'com') candidatos.length = 0

  for (const servidor of candidatos) {
    try {
      const { stdout } = await ejecutar('nslookup', ['-type=NS', dominio, servidor], {
        timeout: 15000,
        windowsHide: true,
      })
      const nombres = [...stdout.matchAll(/(?:nameserver|servidor de nombres)\s*=\s*([^\s]+)/gi)].map(
        (m) => m[1],
      )
      if (nombres.length) return [...new Set(nombres)]
    } catch {
      // Se prueba con el siguiente.
    }
  }
  return []
}

/** Lo que responde el primer servidor publico que sepa algo. */
async function consultarPublico(dominio, tipo) {
  for (const servidor of DNS_PUBLICOS) {
    const valores = await consultar(dominio, tipo, servidor)
    if (valores.length) return { valores, servidor }
  }
  return { valores: [], servidor: null }
}

async function revisar() {
  console.log(`\n=== ${dominio} ===\n`)

  /* ------------------------------ 1. El DNS ------------------------------- */
  console.log('1. DNS (preguntando a DNS publicos, que es lo que ven los visitantes)')

  const { valores: ips, servidor } = await consultarPublico(dominio, 'A')
  const faltan = IPS_GITHUB.filter((ip) => !ips.includes(ip))
  comprobar(
    faltan.length === 0,
    'Los 4 registros A apuntan a GitHub Pages',
    faltan.length
      ? `faltan: ${faltan.join(', ')} — lo que responde: ${ips.join(', ') || 'nada'}`
      : `${ips.join(', ')} (via ${servidor})`,
  )
  if (ips.length && faltan.length) {
    comprobar(false, 'Y ninguno apunta a otro sitio', ips.join(', '))
  }

  /*
   * Los servidores de nombres. Ojo, que esto tiene truco y costo un rato: el `nslookup -type=NS`
   * falla casi siempre (contra un servidor publico responde "servidor desconocido" y el resolver
   * del sistema de este portatil ni contesta), aunque el dominio este perfecto. La comprobacion
   * buena es preguntar a un servidor AUTORITATIVO del propio registrador.
   */
  const ns = await servidoresDeNombres(dominio)
  comprobar(ns.length > 0, 'El dominio tiene servidores de nombres', ns.join(', ') || 'ninguno')

  const { valores: ips6 } = await consultarPublico(dominio, 'AAAA')
  if (ips6.length) {
    const faltan6 = ips6.filter((ip) => !IPS_GITHUB_V6.includes(ip))
    comprobar(
      faltan6.length === 0,
      'Los registros AAAA (IPv6) tambien son de GitHub',
      faltan6.length ? `ajenos: ${faltan6.join(', ')}` : ips6.join(', '),
    )
  } else {
    console.log('  --    Sin registros AAAA (IPv6): es opcional, no pasa nada')
  }

  // Lo que NO debe existir: un CNAME en la raiz mezclado con los A (los rompe).
  const { valores: cnameRaiz } = await consultarPublico(dominio, 'CNAME')
  comprobar(
    cnameRaiz.length === 0,
    'No hay un CNAME en la raiz (romperia los registros A)',
    cnameRaiz.join(', '),
  )

  // El www: o apunta a GitHub, o no existe. Las dos cosas valen.
  const { valores: www } = await consultarPublico(`www.${dominio}`, 'CNAME')
  const { valores: wwwA } = await consultarPublico(`www.${dominio}`, 'A')
  if (www.length || wwwA.length) {
    comprobar(
      www.some((c) => /oscarmestre2011\.github\.io$/i.test(c.replace(/\.$/, ''))) ||
        wwwA.some((ip) => IPS_GITHUB.includes(ip)),
      'El www apunta a GitHub',
      [...www, ...wwwA].join(', '),
    )
  } else {
    console.log('  --    Sin www: opcional. GitHub redirige si lo pones')
  }

  // El TXT de verificacion de GitHub (empieza por _github-pages-challenge).
  const { valores: txt } = await consultarPublico('_github-pages-challenge-oscarmestre2011.' + dominio, 'TXT')
  // Solo cuenta si es un codigo de verdad (hexadecimal). Si no, es la respuesta del CNAME del www
  // colandose por el mismo canal, y decir "esta puesto" seria mentir.
  const codigo = txt.find((v) => /^[0-9a-f]{20,}$/i.test(v.trim()))
  if (codigo) {
    comprobar(true, 'Esta el registro TXT de verificacion de GitHub', `${codigo.slice(0, 10)}…`)
  } else {
    console.log(
      '  --    Sin TXT de verificacion: es opcional (solo evita que otro use el dominio).\n' +
        '        Si el panel del registrador no admite nombres con guion bajo, se puede dejar asi.',
    )
  }

  /* --------------------------- 2. HTTPS y contenido ------------------------ */
  console.log('\n2. La web responde')
  for (const protocolo of ['https', 'http']) {
    for (const host of [dominio, `www.${dominio}`]) {
      const url = `${protocolo}://${host}/`
      try {
        const respuesta = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
        const texto = await respuesta.text()
        const esNuestra = /Kair[oó]s/i.test(texto)
        comprobar(
          esNuestra,
          `${url} sirve la web de Kairos`,
          `codigo ${respuesta.status}${respuesta.redirected ? `, redirige a ${respuesta.url}` : ''}`,
        )
      } catch (error) {
        comprobar(false, `${url} responde`, String(error).split('\n')[0].slice(0, 90))
      }
    }
  }

  /* ----------------------- 3. El certificado y los archivos ---------------- */
  console.log('\n3. Detalles que se olvidan')
  try {
    const r = await fetch(`https://${dominio}/publicar/apoyo.json`, { signal: AbortSignal.timeout(20000) })
    const datos = await r.json()
    comprobar(
      r.ok && datos.enlace?.includes('paypal.me'),
      'Los archivos de dentro siguen sirviendose (rutas relativas bien)',
      `${datos.cantidades?.length ?? 0} cantidades`,
    )
  } catch (error) {
    comprobar(false, 'Los archivos de dentro se sirven', String(error).split('\n')[0].slice(0, 90))
  }

  /*
   * La app vive en /app/ (subcarpeta del mismo dominio). Es la comprobacion que de verdad dice si
   * la mudanza ha salido bien: que la app arranque, que su service worker tenga el ambito /app/ y
   * que el aviso de version nueva siga funcionando.
   */
  console.log('\n4. La app en ' + `https://${dominio}/app/`)
  try {
    const respuesta = await fetch(`https://${dominio}/app/`, { signal: AbortSignal.timeout(25000) })
    const html = await respuesta.text()
    comprobar(respuesta.ok, 'La app responde', `codigo ${respuesta.status}`)

    const script = html.match(/src="([^"]*index-[^"]*\.js)"/)?.[1]
    comprobar(Boolean(script), 'El HTML carga su archivo con la ruta correcta', script ?? 'no encontrado')
    if (script) {
      const rutaJs = await fetch(new URL(script, `https://${dominio}/app/`), {
        signal: AbortSignal.timeout(25000),
      })
      comprobar(rutaJs.ok, 'Y ese archivo existe de verdad (no da 404)', `codigo ${rutaJs.status}`)
    }

    const sw = await fetch(`https://${dominio}/app/sw.js`, { signal: AbortSignal.timeout(20000) })
    comprobar(sw.ok, 'El service worker esta donde toca (sin conexion funciona)', `codigo ${sw.status}`)

    const manifiesto = await fetch(`https://${dominio}/app/manifest.webmanifest`, {
      signal: AbortSignal.timeout(20000),
    })
    const manifiestoJson = manifiesto.ok ? await manifiesto.json() : null
    comprobar(
      Boolean(manifiestoJson?.name),
      'El manifiesto se sirve (la app se puede instalar)',
      manifiestoJson?.name ?? `codigo ${manifiesto.status}`,
    )
    // El id y el start_url tienen que seguir siendo relativos: si se cambian, la app instalada
    // se queda huerfana y la gente tendria que reinstalar.
    comprobar(
      manifiestoJson?.id === './' && manifiestoJson?.start_url === './',
      'El manifiesto sigue usando rutas relativas (no rompe las instalaciones)',
      `id=${manifiestoJson?.id} start_url=${manifiestoJson?.start_url}`,
    )
  } catch (error) {
    comprobar(false, 'La app responde en /app/', String(error).split('\n')[0].slice(0, 90))
  }

  console.log(`\n${comprobaciones - fallos}/${comprobaciones} comprobaciones correctas`)
  return fallos === 0
}

let bien = await revisar()

if (!bien && esperar) {
  for (let intento = 1; intento <= 10; intento++) {
    console.log(`\nReintento ${intento}/10 en 60 s (el DNS tarda en propagarse)…`)
    await new Promise((r) => setTimeout(r, 60000))
    fallos = 0
    comprobaciones = 0
    bien = await revisar()
    if (bien) break
  }
}

if (!bien) {
  console.log(
    '\nTodavia no esta. Lo mas habitual: el DNS aun no se ha propagado (hasta 24 h) o falta\n' +
      'apuntar el dominio en GitHub: repositorio -> Settings -> Pages -> Custom domain.',
  )
  process.exit(1)
}
console.log('\nDominio funcionando.')
