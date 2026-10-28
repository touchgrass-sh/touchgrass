# Get your bot token (2 minutes, phone is fine)

Your touchgrass bot is a Telegram bot that only you own. Telegram's official bot-maker, **@BotFather**,
creates it and gives you a token (a password for the bot).

1. Open Telegram and go to **[@BotFather](https://t.me/BotFather)**. Check for the blue tick: that's the real one.
2. Send `/newbot`.
3. **Name:** anything you like, e.g. `touchgrass`. This is what shows in your chats.
4. **Username:** must be unique and end in `bot`, e.g. `dave_touchgrass_bot`. If it's taken, try another.
5. BotFather replies with a token that looks like this:
   ```
   123456789:AAH4k-2xQm9...
   ```
   Tap it to copy.
6. Paste it into the setup page at touchgrass.sh/setup (it checks it), then into Cloudflare's Deploy form as `BOT_TOKEN`.

**You do not need your chat ID.** When you send `/start` to your new bot, it recognises you and locks
itself to your account automatically. Nobody else can use it.

### Keep the token private
- Anyone with the token can control your bot. Don't post it in chats, screenshots or GitHub.
- Leaked it? In @BotFather send `/revoke`, pick your bot, and paste the new token into your setup page.

### Optional polish (in @BotFather)
- `/setuserpic` to add the touchgrass profile picture (download it from touchgrass.sh/brand).
- Name, description and command menu are set for you automatically during setup.
