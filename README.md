# LUCENT Discord Bot

## Railway
1. Upload all files in this folder to GitHub.
2. Railway -> Deploy from GitHub.
3. Variables: `DISCORD_TOKEN` = your Discord bot token.
4. Start command: `node index.js` (already in package.json).
5. Invite the bot with the `bot` and `applications.commands` scopes and permissions for Manage Roles, Send Messages, Embed Links, Attach Files, Read Message History, Use Application Commands.

The bot creates its JSON data files automatically in `data/`.

## Commands
- `/pymentsetting` payment setup
- `/startstore` payment panel
- `/storesetup` store setup
- `/storeadd` add store product; store panel updates immediately
- `/gift` configure redeem button
- `/gachasetup` gacha setup (2 modals because Discord allows max 5 modal inputs)
- `/gachastart` gacha panel
- `/gachareward` add/remove gacha rewards
- `/balance` balance
- `!bagpack` backpack
- `!addgift` sends a button that opens the add-gift form (prefix commands cannot directly open a Discord modal)
- `!setup` command list

Coins rate: 1 Coin = 0.86 THB. Gacha ticket = 5 Coins.
