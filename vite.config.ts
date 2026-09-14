import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuracion pensada para movil:
// - base relativa para poder servirla desde cualquier ruta (localhost, LAN o estatica)
// - dev:lan expone el servidor en la red local para probar desde el telefono
export default defineConfig({
  base: './',
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
    environmentMatchGlobs: [['src/db/**/*.test.ts', 'jsdom']],
  },
} as never)
