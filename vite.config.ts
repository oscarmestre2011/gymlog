import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Configuracion pensada para movil:
 * - `base` relativa por defecto, para poder servir la app desde cualquier ruta
 *   (localhost, red local o una carpeta cualquiera de un hosting estatico).
 * - En GitHub Pages la app vive en una subcarpeta (/gymlog/), asi que el flujo de
 *   publicacion pasa GYMLOG_BASE=/gymlog/ y las rutas se construyen con esa base.
 *   Sin esto la pagina se sirve pero se queda en blanco, porque no encuentra sus ficheros.
 * - `dev:lan` expone el servidor en la red local para probar desde el telefono.
 */
const base = process.env.GYMLOG_BASE ?? './'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: false,
  },
  preview: {
    port: 5273,
    strictPort: false,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Las pruebas que tocan la interfaz o la base de datos necesitan un navegador simulado.
    environmentMatchGlobs: [
      ['src/db/**/*.test.ts', 'jsdom'],
      ['src/components/**/*.test.tsx', 'jsdom'],
    ],
  },
} as never)
