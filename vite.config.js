import { defineConfig } from 'vite'

// Portal builds (see src/portal.js): VITE_PORTAL=crazygames | poki | itch.
// The SDK <script> goes in <head>, as both portals ask. The plain build
// (GitHub Pages) and itch.io get no SDK at all.
const SDK = {
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
}

function portalSdk() {
  const portal = process.env.VITE_PORTAL
  return {
    name: 'portal-sdk',
    transformIndexHtml(html) {
      if (!SDK[portal]) return html
      return html.replace('<head>', `<head>\n    <script src="${SDK[portal]}"></script>`)
    },
  }
}

// Honour the PORT env var so the preview harness can assign a free port.
export default defineConfig({
  base: './',
  plugins: [portalSdk()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: !!process.env.PORT,
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    strictPort: !!process.env.PORT,
  },
})
