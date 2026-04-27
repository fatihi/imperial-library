# Imperial Library

A card-fetching Discord bot for **Legend of the Five Rings — Emerald Legacy** (the community-maintained continuation of the FFG L5R LCG).

This repo is a fork of [Sahasrara](https://github.com/distributive/Sahasrara2) by [@distributive](https://github.com/distributive), a Netrunner card-fetching bot, being adapted to a different game. The plumbing (Discord client, fuzzy search, embed builders, slash command framework, server whitelist, superuser tooling) is being kept; everything game-specific is being replaced.

The hosted public instance + optional self-host model from Sahasrara is preserved.

## Migration status (transient — delete this section once the migration is done)

The repo is mid-migration from Netrunner to Emerald Legacy. The plan is **strip-then-build**:

1. Tag/branch the last fully-working Netrunner state so it stays reachable from `git log` without checking out old commits.
2. Remove `src/Netrunner/`, `src/ONR/`, Netrunner-specific commands (`/mark`, `/side`), Netrunner content from `/about`, `/help`, `/basicActions`, `/glossary`, `resources/CardData/`, the Netrunner aliases file, and all Netrunner-flavoured env vars (faction colors/emojis, NRDB/ONR URLs).
3. Build the Emerald Legacy module greenfield against EmeraldDB on the leftover scaffolding.

Until step 3 lands, the bot still serves Netrunner cards. Don't claim "EL is working" until the EL module is wired into `src/Structures/client.js` in place of `initNetrunner` / `initONR` and slash commands have been re-registered with Discord.

The README and `.env.example` still describe Sahasrara/Netrunner — they get rewritten as part of the migration, not before.

## What the bot does (target state)

**Inline triggers** (preserved from Sahasrara, retargeted at L5R cards):

- `[[card]]` — full card view. **Current legality** (Legal / Restricted / Banned) is shown as a field inside this embed; there is no separate legality trigger because EL has no legality *history* to display.
- `{{card}}` — card art only.
- `<<card>>` — flavour text only.
- `((card))` — **dropped.** Reserved for a future richer feature (rulings, errata, printings) if needed.

Per-message inline command count is capped by `RESULT_LIMIT` (default 5).

**Slash commands** (kept and adapted):

- `/about` — about Imperial Library.
- `/help` — help text.
- `/basicActions` — adapt to L5R's basic actions (Dynasty/Conflict phase actions, etc.).
- `/glossary` — L5R/EL keyword and term lookup.
- `/superuser/*` — admin tooling (alias management, server whitelist).

**Slash commands dropped:** `/mark` (Netrunner-only mechanic), `/side` (Netrunner Runner/Corp coin-flip; L5R first-player choice is decided by honor bid, not coin flip).

**Out of scope for now:** clan/ring lookup, honor-bid simulator, conflict-type primer, lore quotes, deckbuilding helpers. Goal is **feature parity with Sahasrara**, not a wider L5R toolbelt.

## Data sources

- **Cards & rules/glossary:** [EmeraldDB](https://emeralddb.org/). The exact endpoints (cards API, rules section structure, glossary location) are a discovery task during implementation. Replaces Sahasrara's `API_URL` (NRDB v3), `NRDB_URL`, `ONR_URL`, `RULES_URL`, `GLOSSARY_URL`, `SEARCH_URL`.
- **Local overrides:** `resources/CardData/` (or its EL-shaped successor) lets operators define cards not yet in the upstream API; local data wins on conflict. Keep this affordance — it's useful for previews and corrections.
- **Aliases:** `resources/aliases.yml` — runtime-editable redirects from a query string to a specific card (e.g. nicknames). Stays.

## Architecture map

```
src/
  Structures/      Discord client bootstrap, command/handler/event loaders
    client.js      Top-level start(); init order: DB → card APIs → rules → glossary → whitelist → commands → handler → events → login
  Events/          interactionCreate, messageCreate (inline triggers), ready
  Commands/        Slash commands; one file per command; Superuser/ subdirectory for admin
  Utility/         env, error, fuzzySearch (weighted Damerau-Levenshtein), random, text, time
  Database/        MySQL (lightly used; check before assuming a feature touches it)
  Permissions/     Server whitelist
  Glossary/        api.js fetches/normalises glossary, embed.js renders
  Rules/           Same shape: api.js + embed.js
  Netrunner/       (to be removed) api.js, embed.js, discord.js, aliases.js, basicActions.js
  ONR/             (to be removed) api.js, embed.js, discord.js
  EmeraldLegacy/   (to be created) mirror the api/embed/discord split used by Netrunner/
```

Each game module follows the same shape: `api.js` (fetch + cache + lookup), `embed.js` (render to a Discord embed), `discord.js` (slash command / inline glue). Follow that pattern when building `EmeraldLegacy/`.

## Conventions

- **Module system:** ES modules (`"type": "module"`), `import`/`export`. Top-of-file JSDoc block comment with `@file` is the existing house style — keep it.
- **discord.js:** v14. Slash commands built with `SlashCommandBuilder`; embeds with `EmbedBuilder`.
- **Config:** All runtime config flows through `.env` (see `.env.example`). `src/Utility/env.js` wraps boolean parsing. Don't hardcode URLs, colors, or emoji IDs.
- **Commit messages:** Past-tense subject ("Added X", "Fixed Y", "Improved Z"), sentence case, no trailers. Match the existing `git log` style ("Added glossary command", "Fixed tag regex capturing too much"). **Do not append a `Co-Authored-By: Claude ...` trailer.**
- **Slash command registration:** Adding/renaming/changing the shape of a slash command requires re-registering with Discord (the API doesn't pick up changes from a file edit alone). Note this in PR descriptions when relevant.

## Gotchas

- `WHITELIST_SERVERS=1` in `.env.example` — by default the bot only responds in whitelisted servers. The whitelist is loaded from `resources/serverWhitelist.yml` at startup and rewritten when superuser commands edit it.
- MySQL is a declared dependency but lightly used. Don't assume a feature persists state to the DB without checking `src/Database/database.js`.
- Inline triggers run on every message via `messageCreate`. Be careful adding work to that path — it sees every message in every whitelisted channel.
- `RESULT_LIMIT` and `MAX_QUERY_LENGTH` exist to keep one chatty user from spamming many embeds; preserve those guards when adapting inline lookup.
- Card data is loaded once at startup. A bot restart is required to pick up upstream EmeraldDB changes (matches Sahasrara's behaviour with NRDB).

## Related files

- `README.md` — user-facing project description. Currently still Sahasrara/Netrunner; gets rewritten as part of the migration.
- `.env.example` — exhaustive list of runtime config. Currently still Netrunner; gets rewritten as part of the migration (clan colors/emojis instead of faction colors/emojis, EmeraldDB URLs, etc.).
- `LICENSE` — MIT, inherited from the upstream template.
