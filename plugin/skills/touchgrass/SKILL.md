---
name: touchgrass
description: Explain or check the touchgrass plugin, which tells the user's touchgrass Telegram bot when Claude Code starts and stops thinking. Use when the user asks about touchgrass, their nudges, or whether the bot hook is working.
---

touchgrass is a buddy bot in the user's own Telegram, running on their own Cloudflare account. This plugin's
hooks send two tiny requests to it: one when the user sends a prompt (Claude starts thinking) and one when
Claude finishes. If Claude is still busy after about a minute, the bot nudges the user to move or drink water.

Each hook pipes Claude Code's own hook JSON to the user's own bot over HTTPS, and nowhere else. That JSON
includes the prompt text (on start) and Claude's last reply (on stop); the bot reads only `session_id` and
stores nothing else. Users who want nothing but the session id to leave their machine can use the
`touchgrass` command instead (`curl -fsSL touchgrass.sh | sh`), which sends only the session id.

To check it's working, run this in the shell and expect `{"ok":true,...}`:

```
curl -s "${user_config.bot_url}/health"
```

If the user wants to change the bot address or key, tell them to open `/plugin`, pick touchgrass and update
its settings. Settings for the nudges themselves (hours, cooldown, personality) live in the bot: send it
/settings in Telegram. More help: https://touchgrass.sh
