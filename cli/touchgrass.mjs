#!/usr/bin/env node
// touchgrass CLI: tells your touchgrass bot when your coding agent starts and stops thinking, so it can
// nudge you while you wait. One file, no dependencies, Node 18+ (Claude Code already needs Node).
//
//   touchgrass connect <bot-url> <hook-key>   save your bot (the bot's /hook message gives you both)
//   touchgrass hook claude                    add the start/stop hooks to ~/.claude/settings.json
//   touchgrass unhook claude                  remove them again
//   touchgrass status                         is the bot reachable, is the hook installed?
//   touchgrass test                           fake a long agent run: a nudge arrives in ~1 min
//   touchgrass event <start|stop>             what the hooks call (reads Claude's hook JSON on stdin)

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '0.1.0'
const HOME = homedir()
const DIR = join(HOME, '.touchgrass')
const CONFIG = join(DIR, 'config.json')
const CLAUDE_SETTINGS = join(HOME, '.claude', 'settings.json')
const SELF = fileURLToPath(import.meta.url)
// Marks the hook entries we own, so hook/unhook never touch anyone else's hooks.
const TAG = 'touchgrass.mjs'

const tty = process.stdout.isTTY
const g = (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s)
const d = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s)
const r = (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s)

const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n')
const config = () => readJson(CONFIG, null)

async function post(cfg, body, ms = 4000) {
  const res = await fetch(new URL('/hook', cfg.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms)
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function connect(url, key) {
  if (!url || !key) return fail('usage: touchgrass connect <bot-url> <hook-key>\n(send /hook to your bot to get both)')
  let u
  try {
    u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`)
  } catch {
    return fail(`that doesn't look like a URL: ${url}`)
  }
  const cfg = { url: u.origin, key: key.trim() }
  // Check the key with a harmless stop event for a throwaway session.
  try {
    const { status } = await post(cfg, { event: 'stop', agent: 'test', session: 'connect-check' })
    if (status === 401) return fail('[x_x] the bot rejected that key. copy it again from /hook')
    if (status !== 200) return fail(`[x_x] the bot answered ${status}. is the URL right?`)
  } catch (e) {
    return fail(`[x_x] couldn't reach ${cfg.url} (${e.name === 'TimeoutError' ? 'timed out' : e.message})`)
  }
  mkdirSync(DIR, { recursive: true })
  writeJson(CONFIG, cfg)
  console.log(`${g('[▮‿▮] ✓')} connected to ${cfg.url}`)
  console.log(d('next: touchgrass hook claude'))
}

function hookCommand(event) {
  // Absolute node + script paths: hooks run without your shell's PATH tweaks.
  return `"${process.execPath}" "${SELF}" event ${event} --agent claude`
}

function hook(agent) {
  if (agent !== 'claude') return fail('only `touchgrass hook claude` exists so far. codex is next.')
  if (!config()) return fail('connect first: touchgrass connect <bot-url> <hook-key>')
  const settings = readJson(CLAUDE_SETTINGS, {})
  if (existsSync(CLAUDE_SETTINGS)) copyFileSync(CLAUDE_SETTINGS, CLAUDE_SETTINGS + '.touchgrass-backup')
  settings.hooks ??= {}
  for (const [name, event] of [['UserPromptSubmit', 'start'], ['Stop', 'stop']]) {
    const list = (settings.hooks[name] ??= [])
    // Drop our old entry (path may have moved), keep everyone else's.
    for (const group of list) group.hooks = (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes(TAG))
    settings.hooks[name] = list.filter((group) => group.hooks.length)
    settings.hooks[name].push({ hooks: [{ type: 'command', command: hookCommand(event), timeout: 5 }] })
  }
  mkdirSync(join(HOME, '.claude'), { recursive: true })
  writeJson(CLAUDE_SETTINGS, settings)
  console.log(`${g('ᕦ[▮_▮]ᕤ')} hooked into Claude Code (${CLAUDE_SETTINGS})`)
  console.log(d('new Claude Code sessions will ping your bot. try: touchgrass test'))
}

function unhook(agent) {
  if (agent !== 'claude') return fail('usage: touchgrass unhook claude')
  const settings = readJson(CLAUDE_SETTINGS, null)
  if (!settings?.hooks) return console.log(d('nothing to remove'))
  for (const name of Object.keys(settings.hooks)) {
    for (const group of settings.hooks[name]) group.hooks = (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes(TAG))
    settings.hooks[name] = settings.hooks[name].filter((group) => group.hooks.length)
    if (!settings.hooks[name].length) delete settings.hooks[name]
  }
  writeJson(CLAUDE_SETTINGS, settings)
  console.log(`${g('[▮_▮]')} unhooked. Claude Code won't ping your bot any more.`)
}

function hookedClaude() {
  const settings = readJson(CLAUDE_SETTINGS, {})
  const has = (name) => (settings.hooks?.[name] ?? []).some((gr) => (gr.hooks ?? []).some((h) => String(h.command ?? '').includes(TAG)))
  return has('UserPromptSubmit') && has('Stop')
}

async function status() {
  const cfg = config()
  console.log(`touchgrass ${VERSION}`)
  if (!cfg) return console.log(`${r('[x_x]')} not connected. touchgrass connect <bot-url> <hook-key>`)
  let health = null
  try {
    const res = await fetch(new URL('/health', cfg.url), { signal: AbortSignal.timeout(4000) })
    health = await res.json()
  } catch {}
  console.log(`bot:    ${cfg.url} ${health?.ok ? g('✓ up') : r('✗ unreachable')}${health && !health.claimed ? d(' (send /start to it)') : ''}`)
  console.log(`claude: ${hookedClaude() ? g('✓ hooked') : d('not hooked (touchgrass hook claude)')}`)
}

async function test() {
  const cfg = config()
  if (!cfg) return fail('connect first: touchgrass connect <bot-url> <hook-key>')
  const session = `test-${Date.now()}`
  try {
    const { status } = await post(cfg, { event: 'start', agent: 'test', session })
    if (status !== 200) return fail(`[x_x] the bot answered ${status}`)
  } catch (e) {
    return fail(`[x_x] couldn't reach the bot (${e.message})`)
  }
  console.log(`${g('[▮_▮]')} told the bot an agent started thinking.`)
  console.log(d("a nudge should land in Telegram in ~1-2 min, if you're inside your nudge hours and not snoozed."))
}

// Called by Claude Code hooks. Must be silent and never fail: UserPromptSubmit stdout is shown to the model,
// and a slow or failing hook would get in the way of the user's actual work.
async function event(kind, agent) {
  try {
    const cfg = config()
    if (!cfg || (kind !== 'start' && kind !== 'stop')) return
    let session = 'default'
    if (!process.stdin.isTTY) {
      const raw = await new Promise((resolve) => {
        let s = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (c) => (s += c))
        process.stdin.on('end', () => resolve(s))
        setTimeout(() => resolve(s), 1000)
      })
      session = readJsonString(raw)?.session_id ?? session
    }
    await post(cfg, { event: kind, agent: agent || 'claude', session: String(session) }, 3000)
  } catch {}
}

function readJsonString(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function fail(msg) {
  console.error(msg)
  process.exitCode = 1
}

function help() {
  console.log(`${g('ᕦ[▮_▮]ᕤ')} touchgrass ${VERSION}

  touchgrass connect <bot-url> <hook-key>   save your bot (send /hook to it for both)
  touchgrass hook claude                    nudge me while Claude Code thinks
  touchgrass unhook claude                  stop that
  touchgrass status                         check everything's wired up
  touchgrass test                           fake a long agent run

${d('sudo touch grass. https://touchgrass.sh')}`)
}

const [cmd, ...args] = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

switch (cmd) {
  case 'connect':
    await connect(args[0], args[1])
    break
  case 'hook':
    hook(args[0] ?? 'claude')
    break
  case 'unhook':
    unhook(args[0] ?? 'claude')
    break
  case 'status':
    await status()
    break
  case 'test':
    await test()
    break
  case 'event':
    await event(args[0], flag('agent'))
    break
  case '--version':
  case '-v':
    console.log(VERSION)
    break
  default:
    help()
}
