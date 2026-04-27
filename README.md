# Imperial Library

A card-fetching Discord bot for [Legend of the Five Rings — Emerald Legacy](https://emeralddb.org/), the community-maintained continuation of the L5R LCG.

> **Migration status:** This repository is a fork of [Sahasrara](https://github.com/distributive/Sahasrara2) by [@distributive](https://github.com/distributive), a Netrunner card-fetching bot, being adapted to Emerald Legacy. The running bot still serves Netrunner cards while the migration is in progress. See `CLAUDE.md` for the migration plan.

## Adding the bot to your server

A public hosted instance will be available once the migration is complete. Until then, the bot can be self-hosted (see below).

## Client use

The bot supports a number of slash commands and a few inline triggers.

### Searching for cards

Include any of the following in a Discord message to fetch a card:

- `[[card]]` — view the card (includes its current legality).
- `{{card}}` — view its art.
- `<<card>>` — view its flavour text.

Each Discord message is limited to 5 inline triggers (configurable via `RESULT_LIMIT`). Any extra triggers are ignored.

## Self-hosting

```bash
cp .env.example .env # add your application token and bot ID
npm install
node index.js
```

### Resources

The `resources/` directory holds instance-specific data read at startup:

- `resources/aliases.yml` — manual redirects from a query string to a specific card (e.g. a nickname). Rewritten when superuser commands edit it.
- `resources/serverWhitelist.yml` — if `WHITELIST_SERVERS` is truthy, the bot only responds in servers listed here. Rewritten when superuser commands edit it.
- `resources/CardData/` — local card data overrides, following the upstream API schema. If local data conflicts with data from the API, local data wins.

## Acknowledgements

- Forked from [Sahasrara](https://github.com/distributive/Sahasrara2) by [@distributive](https://github.com/distributive), a Netrunner card-fetching bot.
- Sahasrara was based on [Slash Bot Template](https://github.com/GuriZenit/slash-bot-template) by GuriZenit.
