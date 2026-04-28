# Imperial Library

A card-fetching Discord bot for **Legend of the Five Rings — Emerald Legacy** (the community-maintained continuation of the FFG L5R LCG).

This repo is a fork of [Sahasrara](https://github.com/distributive/Sahasrara2) by [@distributive](https://github.com/distributive), a Netrunner card-fetching bot, being adapted to a different game. The plumbing (Discord client, fuzzy search, embed builders, slash command framework, server whitelist, superuser tooling) is being kept; everything game-specific is being replaced.

The hosted public instance + optional self-host model from Sahasrara is preserved.

## Migration status (transient — delete this section once the migration is done)

The repo is mid-migration from Netrunner to Emerald Legacy. The plan is **strip-then-build**:

1. **Done.** Tagged `netrunner-final` — last commit reflecting the Netrunner-era project.
2. **Done.** Stripped Netrunner/ONR code, content, and config (see `docs/superpowers/plans/2026-04-27-strip-netrunner.md`).
3. **Done (MVP).** Built Emerald Legacy inline-trigger card lookup against EmeraldDB (see `docs/superpowers/plans/2026-04-28-emerald-legacy-mvp.md`). The bot now answers `[[card]]`, `{{card}}`, and `<<card>>`, plus the alias superuser commands.
4. **Pending.** Remaining slash commands (`/search`, `/random`, `/view_set`, `/view_format`, `/view_cycle`) — separate plan to follow.

The bot is now usable for its core card-lookup purpose. Slash card commands are a future enhancement, not a blocker for deploying.

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
- `/search` — free-text card search (EmeraldDB).
- `/random` — random card, optionally filtered.
- `/view_set` — browse a card pack/set.
- `/view_format` — browse a tournament format (EL has formats).
- `/view_cycle` — browse a cycle (EmeraldDB groups packs into cycles, with `publisher` discriminating FFG from Emerald-Legacy releases).
- Superuser commands (`alias_add`/`alias_remove`/`alias_view`, `whitelist_server_*`) — admin tooling, kept as-is in shape.

**Slash commands dropped:**

- `/mark` — Netrunner-only mechanic.
- `/side` — Netrunner Runner/Corp coin-flip; L5R first-player choice is decided by honor bid, not coin flip.
- `/view_banlist` — EL has only a current legality state (no historical banlists to enumerate); legality is shown inside `[[card]]`.
- `/basic_actions` — Sahasrara showed Netrunner's printed "Basic Action Card" for each side. L5R has no equivalent reference card; player actions vary by phase, ring, and triggered abilities, not a fixed printed list.
- `/get_rule`, `/search_rule`, `/glossary` — deferred indefinitely. EmeraldDB has no rules or glossary endpoint; rules live as AsciiDoc in a separate GitHub repo, glossary doesn't exist upstream at all. Both are out of scope for the current build phase. May come back in a later phase if there's demand.

**Out of scope for now:** clan/ring lookup, honor-bid simulator, conflict-type primer, lore quotes, deckbuilding helpers. Goal is **feature parity with Sahasrara**, not a wider L5R toolbelt.

## Data sources

- **Cards & rules/glossary:** [EmeraldDB](https://emeralddb.org/). The exact endpoints (cards API, rules section structure, glossary location) are a discovery task during implementation. Replaces Sahasrara's `API_URL` (NRDB v3), `NRDB_URL`, `ONR_URL`, `RULES_URL`, `GLOSSARY_URL`, `SEARCH_URL`.
- **Local overrides:** `resources/CardData/` (or its EL-shaped successor) lets operators define cards not yet in the upstream API; local data wins on conflict. Keep this affordance — it's useful for previews and corrections.
- **Aliases:** `resources/aliases.yml` — runtime-editable redirects from a query string to a specific card (e.g. nicknames). Stays.

## Architecture map

```
src/
  Structures/      Discord client bootstrap, command/handler/event loaders
    client.js      Top-level start(); init order: DB → whitelist → commands → handler → events → login
  Events/          interactionCreate, messageCreate (inline triggers — body stubbed, rebuilt in build phase), ready
  Commands/        Slash commands; one file per command; Superuser/ subdirectory for admin
  Utility/         env, error, fuzzySearch (weighted Damerau-Levenshtein), random, text, time
  Database/        MySQL (lightly used; check before assuming a feature touches it)
  Permissions/     Server whitelist
  Aliases/         aliases.js — game-agnostic string→cardName redirect table backed by resources/aliases.yml
  Glossary/        api.js — game-agnostic fetch/index of a glossary JSON; orphan until build phase rewires init
  Rules/           api.js — game-agnostic fetch/index of a rules JSON; orphan until build phase rewires init
  EmeraldLegacy/   (to be created in build phase) api.js, embed.js, discord.js — card lookup, slash commands, inline triggers
```

The build phase will create `src/EmeraldLegacy/` with `api.js` (fetch + cache + lookup), `embed.js` (render to a Discord embed), and `discord.js` (slash command / inline glue), and rewire `Glossary/api.js` and `Rules/api.js` against EmeraldDB by setting `GLOSSARY_URL`/`RULES_URL` and re-adding their `init()` calls in `client.js`.

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

- `README.md` — user-facing project description for Imperial Library, with a migration-status banner pointing here.
- `.env.example` — runtime config template. Slimmed down during the strip phase; the build phase will add EL-specific keys (clan colors, ring/clan emojis, populated `GLOSSARY_URL`/`RULES_URL`) as their consumers are written.
- `LICENSE` — MIT, inherited from the upstream template.
- `docs/superpowers/plans/2026-04-27-strip-netrunner.md` — the strip-phase implementation plan, kept for reference.
