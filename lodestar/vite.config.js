import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import fs from 'node:fs'

// the map editor saves its edits through the dev server (npm run dev) into public/data/edits.json;
// the built site has no such endpoint
function saveEdits() {
  const file = resolve(import.meta.dirname, 'public/data/edits.json')
  return {
    name: 'lodestar-save-edits',
    configureServer(server) {
      server.middlewares.use('/__lodestar/edits', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try {
            const edits = JSON.parse(body)
            if (!edits || typeof edits !== 'object' || !edits.chunks || !edits.roads) throw new Error('not an edits file')
            // the generator's removals live in auto-edits.json (a tab opened before that may still send them)
            for (const ch of Object.values(edits.chunks)) for (const [i, e] of Object.entries(ch.b || {})) if (e && e.auto) delete ch.b[i]
            fs.writeFileSync(file + '.tmp', JSON.stringify(edits))
            fs.renameSync(file + '.tmp', file)
            res.setHeader('content-type', 'application/json')
            res.end('{"ok":true}')
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }))
          }
        })
      })
    },
  }
}

// relative base so the built site works from any folder
export default defineConfig({
  base: './',
  plugins: [svelte(), saveEdits()],
  server: { watch: { ignored: ['**/public/data/edits.json'] } }, // a save must not reload the page
  optimizeDeps: { exclude: ['maplibre-gl'] }, // (it finds its worker next to itself)
})
