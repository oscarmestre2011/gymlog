/*
 * Ayudantes compartidos por los scripts de prueba.
 *
 * Motivo de existir: la app muestra una pantalla de bienvenida la PRIMERA vez que
 * se abre. Cualquier prueba que empiece de cero se la encuentra, y sin cerrarla no
 * llega a la app. En lugar de repetir esa logica en cada script (y olvidarla en
 * alguno, como paso al anadir la bienvenida), vive aqui una sola vez.
 */

/** Cuanto se espera a que arranque la app antes de mirar si hay bienvenida. */
const ESPERA_ARRANQUE_MS = 2500

/**
 * Deja la app lista para usar: si sale la bienvenida, la cierra.
 * Devuelve true si habia bienvenida (util para comprobarlo en las pruebas).
 */
export async function pasarBienvenida(page, { capturar } = {}) {
  await page.waitForTimeout(ESPERA_ARRANQUE_MS)

  const hayBienvenida = (await page.locator('text=Bienvenido a GymLog').count()) > 0
  if (!hayBienvenida) return false

  if (capturar) await capturar()
  await page.getByText('Ya lo veré luego').click()
  await page.waitForTimeout(900)
  return true
}

/**
 * Espera a que la app este montada, cerrando la bienvenida si aparece.
 * Se usa en lugar de esperar directamente a `.nav`.
 */
export async function esperarApp(page, timeout = 25000) {
  await pasarBienvenida(page)
  await page.waitForSelector('.nav', { timeout })
}
