# Your command center

touchgrass is the body. **Your coding agent is the brain.**

Once the bot is installed, you don't configure it through menus. You open Claude Code or Codex in your
copy of the repo and just say what you want:

```
> make the nudges gentler after 9pm
> add a "stretch" exercise with 30-second holds
> only ping me on weekdays, and never during my 2pm standup
> switch my personality to zen and redeploy
```

Your agent edits *your* copy of the code, deploys it to *your* Cloudflare account, and your bot changes.
It's your bot, so you can make it yours. We never see any of it.

> Optional. The bot works fine without this. `/settings` in Telegram covers the basics
> (personality, hours, timezone, exercises). The command center is for everything beyond that.

---

## Before you start (prerequisites)

Your agent needs three things to change and redeploy the bot. Set them up once.

### 1. Your copy of the code
The **Deploy to Cloudflare** button already made a copy of the repo in your GitHub account. Clone it:

```
git clone https://github.com/<you>/touchgrass
cd touchgrass
```

### 2. Access to your Cloudflare account
Pick **one**:

- **Cloudflare connector (easiest, Claude):** add Cloudflare's official MCP connector in Claude and sign in
  with your Cloudflare account. Claude can then deploy and read logs for you.
- **Wrangler login (any agent):** run `npx wrangler login` once in the repo folder and approve in the browser.
- **API token (headless / CI):** in Cloudflare → My Profile → API Tokens → *Create token*, start from
  **Edit Cloudflare Workers**, then add **D1: Edit** and **Workers AI: Read**. Limit it to your one account.
  Save it as an environment variable `CLOUDFLARE_API_TOKEN`. Don't paste it into a chat.

### 3. Your bot's secrets stay where they are
Your Telegram token and hook key were saved as Worker secrets during setup. Your agent doesn't need to see
them to redeploy. If you ever rotate them, use `npx wrangler secret put <NAME>`; never commit them to git.

---

## Good habits

- **Least access.** Give the agent access to the one Cloudflare account the bot lives on, nothing more.
- **Review before deploy.** Ask your agent to show the change first. It's your account and your bill.
- **Watch your usage.** Changes that add AI calls (e.g. analysing more photos) can use more of Cloudflare's
  free daily AI allowance. Past it, Cloudflare bills **your** account, not us. Ask your agent:
  `> how much Workers AI did the bot use this week?`
- **Keep updates easy.** Put your changes in **`src/custom/index.ts`**, the one file meant for you:
  `custom.moves` (add exercises, or `replaceMoves` to swap the whole list), `custom.lines` (your own
  wording per personality and message type) and `custom.defaults` (starting settings; anything you set in
  `/settings` still wins). Leave core files alone and pulling new touchgrass releases stays a clean merge.
  All settings are defined in one place, `src/env.ts` (`Settings` + `DEFAULT_SETTINGS`), so your agent
  knows exactly what can be changed.
- **Undo is one command.** `npx wrangler rollback` puts the previous version back.

---

## FAQ

**Do I need Claude or Codex?** No. They're only for customising beyond `/settings`.

**Does it cost anything?** We charge nothing. Your agent subscription is your own, and any Cloudflare usage is
billed by Cloudflare to your account (normal personal use fits in the free tiers).

**Can my agent break it?** It can deploy anything you approve, so review changes and use rollback if needed.

**Is this the same as the `touchgrass:setup` skill?** That skill installs the bot. The command center is what
you do after: ongoing tweaks, new exercises, new rules.
