import { defineConfig } from 'vite'

// Honour the PORT env var so the preview harness can assign a free port.
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: !!process.env.PORT,
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    strictPort: !!process.env.PORT,
  },
})
