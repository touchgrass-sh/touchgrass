// Runs before every deploy (npm "predeploy"). With a licence key it fetches your paid pack (sudo or root) from
// touchgrass.sh and drops it into src/addons/ for this build only; the pack is never committed to your repo. Without
// one it does nothing and you get the open-source bot. A licence that stops working (refund, typo) never breaks the
// build: you get the open-source bot and a warning in the build log.
// The key comes from either:
//   - a `touchgrass.license` file at the top of your repo (touchgrass.sh/upgrade adds it; keep the repo PRIVATE), or
//   - a TOUCHGRASS_LICENSE build variable: your Worker → Settings → Build → Variables and secrets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const here = join(import.meta.dirname, '..')
const file = [join(here, 'touchgrass.license'), join(here, '..', 'touchgrass.license')].find(f => existsSync(f))
const key = process.env.TOUCHGRASS_LICENSE?.trim() || (file && readFileSync(file, 'utf8').trim())
if (!key) {
  console.log('[touchgrass] no licence key: building the open-source bot.')
  process.exit(0)
}

const addons = join(here, 'src', 'addons')
try {
  const r = await fetch(process.env.TOUCHGRASS_PACK_URL || 'https://touchgrass.sh/api/pack', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ license_key: key })
  })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) throw new Error(j.line || `touchgrass.sh answered ${r.status}`)
  for (const [path, b64] of Object.entries(j.files)) {
    const out = join(addons, path)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, Buffer.from(b64, 'base64'))
  }
  writeFileSync(join(addons, 'index.ts'), j.index)
  console.log(`[touchgrass] ${j.line} Added ${Object.keys(j.files).length} files.`)
} catch (err) {
  console.warn(`[touchgrass] WARNING: couldn't add your paid pack, building the open-source bot instead. ${err.message}`)
}
