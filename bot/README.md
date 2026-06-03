# Crazyland Discord Bot

This bot syncs Discord giveaway management with the website feed in `data/giveaways.json`.

## Current features

- Registers guild slash commands automatically on startup
- Creates giveaways with ids, status, timestamps, and optional prize text
- Lists current giveaways
- Ends giveaways and publishes winners
- Updates giveaway status
- Removes giveaways from the site feed

## Commands

- `/giveaway_create title:<text> duration_minutes:<number> prize:<text optional>`
- `/giveaway_list`
- `/giveaway_end id:<text> winner:<text>`
- `/giveaway_status id:<text> status:<choice>`
- `/giveaway_remove id:<text>`

## Setup

1. In `bot/`, copy `.env.example` to `.env`.
2. Fill in your Discord bot token, client id, and guild id.
3. Run `npm install` inside `bot/`.
4. Start the bot with `npm start`.

## How the site connection works

- The website reads `data/giveaways.json`.
- The bot writes updates into that same file.
- Any time the JSON changes, the site feed can show the latest giveaways and winners.

## Important next upgrades

- Add secure persistence with a database instead of JSON if the project grows.
- Add slash commands for entrant handling and random winner selection.
- Add a backend API if you want the website to support real Discord login and private user-specific data.
