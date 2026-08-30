/*
 * Bundles scripts/verify.ts (which imports the app's domain modules through the
 * '@' alias) and runs it on Node. esbuild is already present as a Vite
 * dependency, so this adds no install step.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(mkdtempSync(path.join(tmpdir(), 'morpha-verify-')), 'verify.mjs')

await build({
  entryPoints: [path.join(root, 'scripts', 'verify.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: out,
  alias: { '@': path.join(root, 'src') },
  logLevel: 'warning',
})

try {
  await import(`file://${out.split(path.sep).join('/')}`)
} finally {
  rmSync(path.dirname(out), { recursive: true, force: true })
}
