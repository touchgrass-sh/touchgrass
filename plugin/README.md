# touchgrass Claude Code plugin

The zero-download way to connect Claude Code to a touchgrass bot (built 2026-10-25). The `touchgrass`
command in `../cli/` is the other way; both talk to the same bot.

## How it works

- `hooks/hooks.json`: on `UserPromptSubmit` and `Stop`, an **exec-form** `curl` (no shell, so no PowerShell
  `curl` alias trouble on Windows) pipes Claude's hook JSON to `POST <bot_url>/hook/claude/start|stop`.
- The bot (`../bot/src/index.ts`) reads only `session_id` and answers **204 with no body**, so nothing reaches
  Claude's context (UserPromptSubmit stdout is shown to the model).
- `userConfig` asks for `bot_url` and `hook_key` (sensitive, kept in the OS secure store) when the plugin is
  enabled. Both come from sending `/hook` to the bot.
- Needs only `curl` (macOS, Linux, Windows 10+). No Node.
- Privacy note: the hook JSON includes the prompt (start) and Claude's last reply (stop). It goes only to the
  user's own bot over HTTPS and the bot discards it. The CLI sends only the session id, for anyone who prefers that.

## Install (once the repo is public)

```
/plugin marketplace add touchgrass-sh/touchgrass
/plugin install touchgrass@touchgrass
```

`../.claude-plugin/marketplace.json` makes the repo root a marketplace pointing at `./plugin`.
Both pass `claude plugin validate` (2026-10-25).

## Tested

Endpoint with the exact curl args against a local bot: 204 + empty body, event stored with Claude's
session id, wrong key → 401. Live bot rejects a wrong key. Not yet installed end to end inside Claude Code
(needs the repo public, or `claude --plugin-dir ./plugin` with the user's real key).
