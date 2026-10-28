# Contributing

Thanks for helping. touchgrass is small on purpose, so a short issue first saves us both time on bigger changes.

## Good first things
- Bugs, with what you sent the bot and what it replied (a screenshot is perfect).
- New moves for the nudge list (`bot/src/nudge.ts`), new caffeine drinks (`bot/src/caffeine.ts`), new canned lines (`bot/src/voice.ts`).
- Fixes to the docs and the guide.

## Running it locally
```sh
cd bot
npm install
cp .dev.vars.example .dev.vars        # fill in a test bot token
npx wrangler d1 migrations apply touchgrass --local
npx wrangler dev
```
Send it updates with curl to `/tg` (header `x-telegram-bot-api-secret-token` = your WEBHOOK_SECRET), or point a test bot's webhook at a tunnel.

## Rules for the bot's words
- Friendly, a bit cheeky, never mean. A joke about sitting, never a health or weight-loss claim.
- Weight is a log, never praised or scolded.
- No medical advice.

## Pull requests
- One change per PR, typechecked (`npx tsc --noEmit` in `bot/`).
- The free core never imports paid code: paid features plug in through `bot/src/hooks.ts`.
