# touchgrass CLI

One file (`touchgrass.mjs`), no dependencies, Node 18+. It tells your touchgrass bot when your coding agent
starts and stops thinking, so the bot can nudge you while you wait. Built 2026-10-25 (bot step 3).

## Install

- macOS / Linux / Git Bash: `curl -fsSL touchgrass.sh | sh` → `~/.touchgrass/touchgrass.mjs` + `~/.local/bin/touchgrass`
- Windows PowerShell: `irm touchgrass.sh/install.ps1 | iex` → `%USERPROFILE%\.touchgrass\` + `touchgrass.cmd`, folder added to user PATH

Both installers live in `../site-zolt/public/`. The site build copies this file to `public/touchgrass.mjs`,
so **edit it here, then build + deploy the site** to publish a new version.

## Commands

| Command | Does |
|---|---|
| `touchgrass connect <bot-url> <hook-key>` | checks the key against `POST /hook`, saves `~/.touchgrass/config.json` |
| `touchgrass hook claude` | adds `UserPromptSubmit` → start and `Stop` → stop to `~/.claude/settings.json` (backup at `.touchgrass-backup`, idempotent, leaves other hooks alone) |
| `touchgrass unhook claude` | removes only our entries |
| `touchgrass status` | bot `/health` + whether the hooks are in |
| `touchgrass test` | sends a fake `start`; a nudge lands in ~1–2 min inside nudge hours |
| `touchgrass event <start\|stop>` | what the hooks run: reads Claude's hook JSON on stdin for `session_id`, posts it, **prints nothing and always exits 0** (UserPromptSubmit stdout goes to the model) |

Our hook entries are recognised by `touchgrass.mjs` in the command string.

## Not done yet

- Codex (only has an end-of-turn notify, so start needs a wrapper).
- The `touch grass` easter egg (shell function that triggers a workout).

## Tested (2026-10-25)

Fake home dir against a local bot: bad key rejected, connect, hook (other hooks kept), re-hook (no duplicates),
event via stdin (rows in `hook_events` with Claude's session id, empty stdout), status, unhook. Live installer
run in a throwaway home; live bot rejects a wrong key. PowerShell installer parse-checked only.
