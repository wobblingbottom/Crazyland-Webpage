# Crazyland Discord Bot

This bot syncs Discord giveaway management with the website feed in `data/giveaways.json`.

## Current features

- Registers guild slash commands automatically on startup
- Creates giveaway messages with Discord entry buttons
- Lists current giveaways
- Ends giveaways and automatically picks winners from entrants
- Updates giveaway status
- Removes giveaways from the site feed
- Supports rerolling winners
- Stores giveaway message ids, host ids, entrants, and winner ids
- Includes a `/panel` setup flow for the giveaway announcement channel

## Commands

- `/giveaway_create title:<text> description:<text> duration_minutes:<number> prize:<text optional> winner_count:<number optional> image_url:<text optional>`
- `/giveaway_list`
- `/giveaway_end id:<text>`
- `/giveaway_status id:<text> status:<choice>`
- `/giveaway_remove id:<text>`
- `/giveaway_reroll id:<text>`
- `/panel`

## Setup

1. In `bot/`, copy `.env.example` to `.env`.
2. Fill in your Discord bot token, client id, and guild id.
3. Run `npm install` inside `bot/`.
4. Start the bot with `npm start`.
5. Optionally set `DEFAULT_BANNER_URL` if you want a default giveaway banner.
6. Use `/panel` in Discord and click `Use This Channel` where giveaways should be posted.

## How the site connection works

- The website reads `data/giveaways.json`.
- The bot writes updates into that same file.
- The bot stores the configured giveaway channel in `data/bot-config.json`.
- Any time the JSON changes, the site feed can show the latest giveaways and winners.

## Important next upgrades

- Add secure persistence with a database instead of JSON if the project grows.
- Add scheduled automatic ending when a giveaway reaches its end time.
- Add a backend API if you want the website to support real Discord login and private user-specific data.
