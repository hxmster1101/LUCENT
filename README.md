# LUCENT BOT - Fixed Complete

## Railway
1. Push every file in this folder to GitHub. Do not upload only index.js.
2. Railway -> Deploy from GitHub.
3. Variables: `DISCORD_TOKEN` = your Discord bot token.
4. Start Command: `node index.js` (or leave package.json start script).
5. Discord Developer Portal -> Bot -> enable **Message Content Intent** if you want `!setup`, `!bagpack`, `!addgift`.
6. Invite the bot with `bot` + `applications.commands` scopes and permissions to send messages, embeds, attach files, manage roles, and read message history.

## Commands
- `/pymentsetting` or `/paymentsetting` - payment setup
- `/startstore` - payment panel
- `/storesetup` or `/shopsetup` - store setup
- `/storeadd` - add product; public shop updates immediately
- `/gift` - set gift button name
- `/gachasetup` - gacha setup (2 steps because Discord modals allow max 5 fields)
- `/gachastart` - publish gacha panel
- `/gachareward` - admin reward panel
- `/balance` - balance
- `/setup` - command help
- `/bagpack` - backpack
- `/addgift` - add salt-exchange reward
- `!setup`, `!bagpack`, `!addgift` - prefix versions

## Payment review
After `/pymentsetting`, the bot automatically creates or uses:
- top-up channel
- slip channel
- `ตรวจสอบการเงิน` review channel

After a member chooses a package and uploads a slip in the configured slip channel, the bot posts the slip to the review channel with **Approve** and **Cancel** buttons. Approve adds Coins and DMs the member; Cancel DMs the member.

## Important
Discord cannot display 8 inputs in one modal. `/gachasetup` therefore opens step 1 (5 fields), then a **ต่อไป** button opens step 2 (3 fields). This is the only way to implement all 8 requested fields using Discord's UI limits.
