import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const TILE_ROOT = path.join(root, 'data', 'dzi')

const MIME: Record<string, string> = {
  '.dzi': 'application/xml',
  '.xml': 'application/xml',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
}

/**
 * The Deep Zoom pyramid is 1.4 GB and lives outside the app in `data/dzi`.
 * Copying it into `public/` (or `dist/`) would be absurd, so it is streamed
 * straight off disk in both dev and preview.
 */
function deepZoomTiles(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0]
    if (!url.startsWith('/dzi/')) return next()

    const rel = decodeURIComponent(url.slice('/dzi/'.length))
    const file = path.join(TILE_ROOT, rel)
    if (!file.startsWith(TILE_ROOT)) {
      res.statusCode = 403
      return res.end('Forbidden')
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        // A missing tile is a real condition the viewer must survive, not a crash.
        res.statusCode = 404
        return res.end('Tile not found')
      }
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('Content-Length', String(stat.size))
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      fs.createReadStream(file).pipe(res)
    })
  }
  return {
    name: 'morpha-deepzoom-tiles',
    configureServer: (server) => { server.middlewares.use(middleware) },
    configurePreviewServer: (server) => { server.middlewares.use(middleware) },
  }
}

export default defineConfig({
  plugins: [react(), deepZoomTiles()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: {
    port: 5173,
    open: false,
    /**
     * Listen on every interface, not just 127.0.0.1. Windows resolves
     * `localhost` to ::1 first, and an IPv4-only bind leaves the browser
     * stalling on a dead IPv6 socket before it falls back — which looks
     * exactly like a dead server. This also exposes the demo on the LAN.
     */
    host: true,
    /**
     * The pyramid is 182,166 files. Letting the dev server's watcher crawl them
     * costs hundreds of megabytes and stalls request handling outright — the
     * server accepts connections and never answers. Tiles are served by the
     * middleware above and never need watching.
     */
    watch: { ignored: ['**/data/**', '**/dist/**', '**/docs/**'] },
  },
  // Keep the dependency scanner on the app entry for the same reason.
  optimizeDeps: { entries: ['index.html'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
})
