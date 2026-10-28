// Runs before every deploy (npm "predeploy"). With a TOUCHGRASS_LICENSE build variable it fetches your paid pack
// (sudo or root) from touchgrass.sh and drops it into src/addons/ for this build only; nothing is committed to your
// repo. Without one it does nothing and you get the open-source bot. A licence that stops working (refund, typo)
// never breaks the build: you get the open-source bot and a warning in the build log.
// Set it in Cloudflare: your Worker → Settings → Build → Variables and secrets → TOUCHGRASS_LICENSE.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const key = process.env.TOUCHGRASS_LICENSE?.trim()
if (!key) {
  console.log('[touchgrass] no TOUCHGRASS_LICENSE: building the open-source bot.')
  process.exit(0)
}

const addons = join(import.meta.dirname, '..', 'src', 'addons')
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
