# Emerald Legacy MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working Imperial Library bot that serves Emerald Legacy cards via inline triggers (`[[card]]`, `{{card}}`, `<<card>>`) against EmeraldDB, replacing the Netrunner-stripped scaffolding.

**Architecture:** A single `src/EmeraldLegacy/` module mirrors the shape of the deleted `src/Netrunner/`: `api.js` fetches and indexes all cards/packs/cycles/formats from EmeraldDB at startup; `embed.js` renders cards into Discord embeds; `discord.js` holds clan/format display helpers. The message router (`src/Events/messageCreate.js`) is rewired to handle the three inline triggers, with the fuzzy-search-and-render pipeline returning *all* cards sharing a name (since L5R has multiple distinct cards with identical names) and posting one embed for the most-recent match plus a footer hint listing siblings. The alias superuser commands are restored, wired against `src/Aliases/aliases.js` and the new EL card-fetch.

**Tech Stack:** Node.js (ESM), discord.js v14, EmeraldDB JSON REST API at `https://www.emeralddb.org/api`, existing `weighted-damerau-levenshtein` fuzzy search, `yaml` for alias persistence.

**Out of scope for this plan (Plan 2 territory):** `/search`, `/random`, `/view_set`, `/view_format`, `/view_cycle` slash commands. This plan ships inline-trigger card lookup and the alias admin tooling — that's the highest-leverage feature and gives a usable bot end-to-end.

**Reference docs:** Spec at `CLAUDE.md`. EmeraldDB API characterization at `docs/superpowers/research/2026-04-28-emeralddb-api.md` — cite this in tasks rather than re-deriving.

---

## File Structure

After this plan completes, `src/` looks like this:

```
src/
  Aliases/
    aliases.js          [unchanged from strip phase]
  Commands/
    about.js            [body replaced with real content]
    help.js             [body replaced with real content]
    Superuser/
      aliasAdd.js       [recreated, wired against EL]
      aliasRemove.js    [recreated, wired against EL]
      aliasView.js      [recreated, wired against EL]
      whitelistServerAdd.js          [unchanged]
      whitelistServerRemove.js       [unchanged]
      whitelistServerRemoveAll.js    [unchanged, still unregistered]
      whitelistServerView.js         [unchanged]
  Database/
    database.js         [unchanged]
  EmeraldLegacy/
    api.js              [NEW: fetch + index + lookup]
    discord.js          [NEW: clan→color, format/legality display helpers]
    embed.js            [NEW: createCardEmbed, createCardImageEmbed, createCardFlavourEmbed]
  Events/
    interactionCreate.js  [unchanged]
    messageCreate.js    [body replaced: inline-trigger pipeline]
    ready.js            [unchanged]
  Permissions/
    serverWhitelist.js  [unchanged]
  Structures/
    client.js           [add initEmeraldLegacy call + loadAliases call]
    commands.js         [register alias superuser commands]
    events.js           [unchanged]
    handler.js          [unchanged]
  Utility/              [unchanged]
```

Deleted (orphan modules from the strip phase, no longer needed):
- `src/Glossary/` (rules/glossary out of scope per CLAUDE.md decision)
- `src/Rules/` (same)

`.env.example` gains one new key (`EMERALDDB_API_URL`). Two existing keys (`GLOSSARY_URL`, `RULES_URL`) become dead and are removed.

---

## Verification approach

This codebase has no test framework. Verification per task is via:

1. **`node --check <file>`** — syntax check.
2. **Import resolution probe** — `node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"`. Loads the import graph from the top.
3. **Live boot smoke test** — for tasks that affect runtime, invoke `node -e "import('./src/EmeraldLegacy/api.js').then(m => m.init()).then(() => console.log('init OK'))"` to verify the API actually fetches and indexes successfully against the live EmeraldDB. This requires network access. If unavailable, note it as DONE_WITH_CONCERNS.
4. **Card-lookup smoke** — once `api.js` is in place, run a one-line Node script that initialises and looks up `"Hida Kisada"` (a card known to have multiple printings/versions in L5R) to validate the indexing.

Run the smoke tests at task boundaries where they apply — not every task needs a live boot.

---

## Task 1: Delete orphan Glossary and Rules modules

The strip phase preserved these as game-agnostic shapes for a future rules/glossary build. The MVP build dropped that scope (rules/glossary deferred indefinitely per CLAUDE.md). The modules are now genuine dead code — no consumers, no init calls, no tests. Delete them.

**Files:**
- Delete: `src/Glossary/api.js`
- Delete: `src/Rules/api.js`

- [ ] **Step 1: Delete the directories**

```bash
git rm -r src/Glossary src/Rules
```

- [ ] **Step 2: Confirm no surviving file imports from either path**

```bash
grep -rn "from \".*Glossary\|from \".*Rules" src && echo "FAIL" || echo "OK: no surviving imports"
```

Expected: `OK: no surviving imports`.

- [ ] **Step 3: Verify all remaining JS still parses**

```bash
find src -name "*.js" -print0 | xargs -0 -n1 node --check
```

Expected: no output, exit 0.

- [ ] **Step 4: Verify import probe still passes**

```bash
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```

Expected: prints `OK`.

- [ ] **Step 5: Commit**

```bash
git commit -m "Deleted orphan Glossary and Rules modules"
```

---

## Task 2: Add EmeraldDB URL to .env.example

The new EL module reads `process.env.EMERALDDB_API_URL`. Add it to the example file. Remove the now-dead `GLOSSARY_URL` and `RULES_URL` placeholders, since their consumer files are gone.

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace the API section of `.env.example`**

Find this block:
```
# API (set during the Emerald Legacy build phase)
GLOSSARY_URL=
RULES_URL=
```

Replace with:
```
# API
EMERALDDB_API_URL=https://www.emeralddb.org/api
```

The rest of `.env.example` stays exactly as it is.

- [ ] **Step 2: Sanity-check env consistency**

```bash
grep -roh "process\.env\.[A-Z_]*" src | sort -u
```

Expected output should still match `.env.example` keys. `GLOSSARY_URL` and `RULES_URL` should no longer appear (because their consumers were deleted in Task 1). `EMERALDDB_API_URL` should not appear yet (its consumer is created in Task 4).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "Added EMERALDDB_API_URL to .env.example"
```

---

## Task 3: Create EmeraldLegacy display helpers

`src/EmeraldLegacy/discord.js` holds small pure functions that the embed renderer uses: clan→Discord-color mapping, type/side display formatting, faction name display. These are independent of any API data so they're built first.

L5R clans (per the API research): `crab`, `crane`, `dragon`, `lion`, `mantis`, `phoenix`, `scorpion`, `unicorn`, `neutral`, `shadowlands`. Standard color associations from L5R lore: Crab brown/blue, Crane white/blue, Dragon green, Lion gold, Mantis green/orange, Phoenix orange/red, Scorpion red/black, Unicorn purple, Neutral gray, Shadowlands black.

**Files:**
- Create: `src/EmeraldLegacy/discord.js`

- [ ] **Step 1: Create the file**

Create `src/EmeraldLegacy/discord.js` with:

```javascript
/**
 * Display helpers for Emerald Legacy cards: clan→color mapping, name
 * formatting, legality summarisation.
 *
 * @file   This files defines the EmeraldLegacy/discord module.
 */

///////////////////////////////////////////////////////////////////////////////

/**
 * Maps a clan/faction ID from the EmeraldDB API to a Discord embed color.
 *
 * @param {string} faction A faction ID (e.g. "crab", "phoenix").
 * @return {number} An RGB integer suitable for EmbedBuilder.setColor().
 */
export function factionToColor(faction) {
  switch (faction) {
    case "crab":         return 0x1f4e79; // Crab blue
    case "crane":        return 0x4f81bd; // Crane blue
    case "dragon":       return 0x4f8d3e; // Dragon green
    case "lion":         return 0xc9a227; // Lion gold
    case "mantis":       return 0x2e8b57; // Mantis green
    case "phoenix":      return 0xc0392b; // Phoenix red
    case "scorpion":     return 0x6f1313; // Scorpion crimson
    case "unicorn":      return 0x6f3782; // Unicorn purple
    case "shadowlands":  return 0x111111; // Shadowlands black
    case "neutral":      return 0x7f7f7f; // Neutral gray
    default:             return +process.env.COLOR_INFO;
  }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Capitalises a faction ID for display.
 *
 * @param {string} faction A faction ID.
 * @return {string} A title-cased faction name.
 */
export function factionName(faction) {
  if (!faction) return "Unknown";
  return faction.charAt(0).toUpperCase() + faction.slice(1);
}

/**
 * Builds a one-line type label for a card: "<Side> <Type>", e.g.
 * "Conflict Event", "Dynasty Character". For card types where the
 * side label is redundant (province, role, stronghold, treaty),
 * just returns the type label.
 *
 * @param {Object} card A card record (must have `type` and `side`).
 * @return {string} A display label.
 */
export function typeLabel(card) {
  const type = card.type ? card.type.charAt(0).toUpperCase() + card.type.slice(1) : "";
  const side = card.side ? card.side.charAt(0).toUpperCase() + card.side.slice(1) : "";
  if (!type) return side;
  if (!side || side.toLowerCase() === type.toLowerCase()) return type;
  // For sides that are the same as the type (province, role, treaty, stronghold), suppress the redundant side
  if (["province", "role", "treaty", "stronghold"].includes(card.type)) return type;
  return `${side} ${type}`;
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Summarises a card's current legality across the formats it's listed in.
 * Returns a short string like "Legal in Emerald Legacy", "Restricted in
 * Stronghold", "Banned in Stronghold; Legal in Emerald Legacy", etc.
 *
 * If the card has no restrictions and no bans, returns "Legal".
 *
 * @param {Object} card A card record.
 * @param {Object<string, Object>} formatsById Map from format ID to format record.
 * @return {string} A legality summary line.
 */
export function legalitySummary(card, formatsById) {
  const banned = card.banned_in || [];
  const restricted = card.restricted_in || [];
  if (banned.length === 0 && restricted.length === 0) {
    return "Legal";
  }
  const parts = [];
  banned.forEach((fid) => {
    const fmt = formatsById[fid];
    parts.push(`Banned in ${fmt ? fmt.name : fid}`);
  });
  restricted.forEach((fid) => {
    const fmt = formatsById[fid];
    parts.push(`Restricted in ${fmt ? fmt.name : fid}`);
  });
  return parts.join("; ");
}
```

- [ ] **Step 2: Verify**

```bash
node --check src/EmeraldLegacy/discord.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/EmeraldLegacy/discord.js
git commit -m "Added EmeraldLegacy display helpers"
```

---

## Task 4: Create the EmeraldLegacy API module

`src/EmeraldLegacy/api.js` is the data layer. At startup it fetches `/api/cards`, `/api/packs`, `/api/cycles`, `/api/formats` from EmeraldDB and builds in-memory indices. It exposes lookup helpers that downstream modules (embeds, inline triggers, alias autocomplete) use.

The fuzzy-search strategy reuses `src/Utility/fuzzySearch.js` (`bestMatchValue`). The L5R-specific complication: a single normalised name can map to multiple distinct cards (e.g. "Tadaka", "Hida Kisada"). The lookup returns *all* cards sharing the best-matched name, and the caller decides how to render.

**Files:**
- Create: `src/EmeraldLegacy/api.js`

- [ ] **Step 1: Create the file**

Create `src/EmeraldLegacy/api.js` with:

```javascript
/**
 * Fetches and indexes Emerald Legacy card data from EmeraldDB at startup.
 *
 * @file   This files defines the EmeraldLegacy/api module.
 */

///////////////////////////////////////////////////////////////////////////////

import { bestMatchValue } from "../Utility/fuzzySearch.js";
import { normalise } from "../Utility/text.js";

///////////////////////////////////////////////////////////////////////////////

/**
 * @typedef CardWithVersions
 * @type {Object}
 * @property {string} id - Slug-form card ID.
 * @property {string} name - Display name.
 * @property {?string} name_extra - Disambiguator for cards sharing a name (e.g. "(2)", "(Experienced 2)").
 * @property {string} faction - Clan/faction ID.
 * @property {string} side - "conflict", "dynasty", "province", "role", or "treaty".
 * @property {string} type - Card type.
 * @property {string} text - Card rules text.
 * @property {?string[]} traits - Trait IDs.
 * @property {?string} cost - Cost (string to allow "X").
 * @property {?string[]} restricted_in - Format IDs.
 * @property {?string[]} banned_in - Format IDs.
 * @property {Object[]} versions - Array of CardInPack records (printings).
 */

const DATA = {};

/**
 * Initialises the API. Fetches every dataset from EmeraldDB and builds
 * lookup indices. Throws on network failure (the bot should not start
 * with broken card data).
 */
export async function init() {
  const baseUrl = process.env.EMERALDDB_API_URL;
  if (!baseUrl) {
    throw new Error("EMERALDDB_API_URL is not set");
  }

  const [cards, packs, cycles, formats] = await Promise.all([
    fetchJson(`${baseUrl}/cards`),
    fetchJson(`${baseUrl}/packs`),
    fetchJson(`${baseUrl}/cycles`),
    fetchJson(`${baseUrl}/formats`),
  ]);

  DATA.cards = cards;
  DATA.cardById = Object.fromEntries(cards.map((c) => [c.id, c]));
  DATA.packsById = Object.fromEntries(packs.map((p) => [p.id, p]));
  DATA.cyclesById = Object.fromEntries(cycles.map((c) => [c.id, c]));
  DATA.formatsById = Object.fromEntries(formats.map((f) => [f.id, f]));

  // Build the normalised-name index. A single name can map to multiple cards.
  DATA.cardsByNormalisedName = {};
  cards.forEach((card) => {
    const key = normalise(card.name);
    if (!DATA.cardsByNormalisedName[key]) {
      DATA.cardsByNormalisedName[key] = [];
    }
    DATA.cardsByNormalisedName[key].push(card);
  });

  // Build the fuzzy-search pool: pairs of [normalised name, normalised name].
  // The pool is a list of unique normalised names; we look up the cards
  // afterwards via cardsByNormalisedName.
  const uniqueNames = Object.keys(DATA.cardsByNormalisedName);
  DATA.fuzzyPool = uniqueNames.map((n) => [n, n]);
}

///////////////////////////////////////////////////////////////////////////////
// Lookup

/**
 * Finds all cards whose normalised name best-matches the query. Returns
 * an array sorted with the most recently released card first (by latest
 * version's pack release date, falling back to pack position).
 *
 * If no match is found, returns an empty array.
 *
 * @param {string} query A user query (e.g. "tadaka").
 * @return {CardWithVersions[]} Matching cards.
 */
export function getClosestCards(query) {
  const normalised = normalise(query);
  if (!normalised) return [];

  const matchedName = bestMatchValue(normalised, DATA.fuzzyPool);
  if (!matchedName) return [];

  const cards = DATA.cardsByNormalisedName[matchedName] || [];
  return [...cards].sort((a, b) => releaseRank(b) - releaseRank(a));
}

/**
 * Fetches a card by its EmeraldDB ID.
 *
 * @param {string} cardId An EmeraldDB card ID.
 * @return {?CardWithVersions} The card, or undefined if not found.
 */
export function getCardById(cardId) {
  return DATA.cardById[cardId];
}

/**
 * Returns the pack record for a pack ID.
 */
export function getPack(packId) {
  return DATA.packsById[packId];
}

/**
 * Returns the cycle record for a cycle ID.
 */
export function getCycle(cycleId) {
  return DATA.cyclesById[cycleId];
}

/**
 * Returns the formats-by-id map (used by the legality summariser).
 */
export function getFormatsById() {
  return DATA.formatsById;
}

/**
 * Returns all unique normalised card names. Used by alias autocomplete.
 */
export function getAllNormalisedNames() {
  return Object.keys(DATA.cardsByNormalisedName);
}

/**
 * Returns the canonical display name for a normalised name. If multiple
 * cards share the normalised name, returns the most-recent card's display
 * name. Used by alias autocomplete to render the option labels.
 *
 * @param {string} normalisedName A normalised name (e.g. "tadaka").
 * @return {string} A display name (e.g. "Tadaka").
 */
export function denormaliseCardName(normalisedName) {
  const cards = DATA.cardsByNormalisedName[normalisedName];
  if (!cards || cards.length === 0) return normalisedName;
  const sorted = [...cards].sort((a, b) => releaseRank(b) - releaseRank(a));
  return sorted[0].name;
}

///////////////////////////////////////////////////////////////////////////////
// Internal

/**
 * Computes a sortable "newer is bigger" rank for a card based on its
 * versions' pack release dates.
 *
 * @param {CardWithVersions} card
 * @return {number}
 */
function releaseRank(card) {
  if (!card.versions || card.versions.length === 0) return 0;
  let best = 0;
  card.versions.forEach((v) => {
    const pack = DATA.packsById[v.pack_id];
    if (!pack) return;
    const ts = pack.released_at ? Date.parse(pack.released_at) : 0;
    if (ts > best) best = ts;
  });
  return best;
}

/**
 * Fetches a URL and returns parsed JSON. Throws on non-OK responses.
 *
 * @param {string} url
 * @return {Promise<*>}
 */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/EmeraldLegacy/api.js
```

Expected: exits 0.

- [ ] **Step 3: Live smoke test**

This step requires network access to `https://www.emeralddb.org/api`. Run:

```bash
EMERALDDB_API_URL=https://www.emeralddb.org/api node -e "
import('./src/EmeraldLegacy/api.js').then(async (m) => {
  await m.init();
  const cards = m.getClosestCards('hida kisada');
  console.log('Found', cards.length, 'cards named like \"hida kisada\":');
  cards.forEach((c) => console.log('-', c.name, c.name_extra || '', '(' + c.id + ')'));
}).catch((e) => { console.error(e); process.exit(1); });
"
```

Expected: prints multiple cards (e.g. `Hida Kisada` and `Hida Kisada (2)`), confirming the multi-card-name handling works.

If the network is unavailable, skip this step and report DONE_WITH_CONCERNS noting the smoke wasn't run.

- [ ] **Step 4: Commit**

```bash
git add src/EmeraldLegacy/api.js
git commit -m "Added EmeraldLegacy api module with fetch and lookup"
```

---

## Task 5: Wire EmeraldLegacy init into client startup

The new API module needs its `init()` called at startup, in the same place the previous Netrunner init lived. Aliases also need loading at startup (the strip phase didn't wire them — `Aliases/aliases.js` exists but `loadAliases()` isn't called anywhere yet).

**Files:**
- Modify: `src/Structures/client.js`

- [ ] **Step 1: Add the imports**

In `src/Structures/client.js`, find the existing import block. Add two lines after the existing imports from `./events.js`:

Find:
```javascript
import { init as initEvents } from "./events.js";
import { loadWhitelist } from "../Permissions/serverWhitelist.js";
import { init as initDatabase } from "../Database/database.js";
import { readBool } from "../Utility/env.js";
```

Replace with:
```javascript
import { init as initEvents } from "./events.js";
import { init as initEmeraldLegacy } from "../EmeraldLegacy/api.js";
import { loadAliases } from "../Aliases/aliases.js";
import { loadWhitelist } from "../Permissions/serverWhitelist.js";
import { init as initDatabase } from "../Database/database.js";
import { readBool } from "../Utility/env.js";
```

- [ ] **Step 2: Add the init calls**

In the same file, find the `start()` function body. After the database init, before the whitelist block:

Find:
```javascript
  // Initialise database
  console.log("initialising database...");
  await initDatabase();

  // Set up whitelist
  if (readBool("WHITELIST_SERVERS")) {
    console.log("server whitelist is enabled; loading saved data...");
    loadWhitelist();
  }
```

Replace with:
```javascript
  // Initialise database
  console.log("initialising database...");
  await initDatabase();

  // Initialise card data
  console.log("initialising emerald legacy api...");
  await initEmeraldLegacy();

  // Load aliases
  console.log("loading aliases...");
  loadAliases();

  // Set up whitelist
  if (readBool("WHITELIST_SERVERS")) {
    console.log("server whitelist is enabled; loading saved data...");
    loadWhitelist();
  }
```

- [ ] **Step 3: Verify syntax**

```bash
node --check src/Structures/client.js
```

Expected: exits 0.

- [ ] **Step 4: Verify import probe**

```bash
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```

Expected: prints `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/Structures/client.js
git commit -m "Wired EmeraldLegacy init and alias loading into startup"
```

---

## Task 6: Create the EmeraldLegacy embed renderer

`src/EmeraldLegacy/embed.js` exports three functions matching the three inline triggers:

- `createCardEmbed(card)` — full card view: name, type, clan-coloured sidebar, fields for cost/MIL/POL/glory/fate/etc. (varies by card type), traits, text in description, image, footer with set + legality + multi-card hint when appropriate.
- `createCardImageEmbed(card)` — image-only embed: large card image, minimal title, no text fields.
- `createCardFlavourEmbed(card)` — flavour text in description, small thumbnail of the card image, no stats.

All three pick the card's most-recent printing for image and flavour (per the printing-selection rule).

The `createCardEmbed` is the structural one — define it carefully. The other two are derivatives.

**Files:**
- Create: `src/EmeraldLegacy/embed.js`

- [ ] **Step 1: Create the file**

Create `src/EmeraldLegacy/embed.js` with:

```javascript
/**
 * Renders Emerald Legacy cards as Discord embeds.
 *
 * @file   This files defines the EmeraldLegacy/embed module.
 */

///////////////////////////////////////////////////////////////////////////////

import { EmbedBuilder } from "discord.js";
import {
  factionToColor,
  factionName,
  typeLabel,
  legalitySummary,
} from "./discord.js";
import { getPack, getFormatsById } from "./api.js";
import { truncate } from "../Utility/text.js";

///////////////////////////////////////////////////////////////////////////////

/**
 * Picks the most recent printing of a card. Falls back to the first
 * printing if none have a release date.
 *
 * @param {Object} card A card record with a `versions` array.
 * @return {?Object} The selected version, or null if there are none.
 */
function preferredVersion(card) {
  if (!card.versions || card.versions.length === 0) return null;
  let best = null;
  let bestTs = -1;
  card.versions.forEach((v) => {
    const pack = getPack(v.pack_id);
    const ts = pack && pack.released_at ? Date.parse(pack.released_at) : 0;
    if (ts > bestTs) {
      best = v;
      bestTs = ts;
    }
  });
  return best || card.versions[0];
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Renders the full card embed.
 *
 * @param {Object} card A card record.
 * @param {Object[]} [siblings] Other cards sharing this card's name.
 *   When non-empty, a hint is appended to the footer.
 * @return {EmbedBuilder}
 */
export function createCardEmbed(card, siblings) {
  const version = preferredVersion(card);
  const pack = version ? getPack(version.pack_id) : null;
  const formatsById = getFormatsById();

  const embed = new EmbedBuilder()
    .setTitle(displayTitle(card))
    .setURL(`https://www.emeralddb.org/card/${card.id}`)
    .setColor(factionToColor(card.faction));

  // Description: card text + optional flavour
  const description = buildDescription(card, version);
  if (description) embed.setDescription(description);

  // Type/Clan/Traits header line as fields
  embed.addFields(
    { name: "Type", value: typeLabel(card), inline: true },
    { name: "Clan", value: factionName(card.faction), inline: true }
  );
  if (card.traits && card.traits.length > 0) {
    embed.addFields({
      name: "Traits",
      value: card.traits.map(formatTrait).join(" • "),
      inline: true,
    });
  }

  // Stats fields (vary by card type)
  const statFields = buildStatFields(card);
  if (statFields.length > 0) embed.addFields(...statFields);

  // Image
  if (version && version.image_url) {
    embed.setImage(version.image_url);
  }

  // Footer: pack + legality + sibling hint
  embed.setFooter({ text: buildFooter(card, version, pack, formatsById, siblings) });

  return embed;
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Renders the image-only embed (`{{card}}` trigger).
 *
 * @param {Object} card
 * @return {EmbedBuilder}
 */
export function createCardImageEmbed(card) {
  const version = preferredVersion(card);
  const embed = new EmbedBuilder()
    .setTitle(displayTitle(card))
    .setURL(`https://www.emeralddb.org/card/${card.id}`)
    .setColor(factionToColor(card.faction));
  if (version && version.image_url) {
    embed.setImage(version.image_url);
  } else {
    embed.setDescription("_No image available._");
  }
  return embed;
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Renders the flavour-only embed (`<<card>>` trigger).
 *
 * @param {Object} card
 * @return {EmbedBuilder}
 */
export function createCardFlavourEmbed(card) {
  const version = preferredVersion(card);
  const embed = new EmbedBuilder()
    .setTitle(displayTitle(card))
    .setURL(`https://www.emeralddb.org/card/${card.id}`)
    .setColor(factionToColor(card.faction));
  if (version && version.flavor) {
    embed.setDescription(`_${version.flavor}_`);
  } else {
    embed.setDescription("_No flavour text on this printing._");
  }
  if (version && version.image_url) {
    embed.setThumbnail(version.image_url);
  }
  return embed;
}

///////////////////////////////////////////////////////////////////////////////
// Internal

/**
 * Builds the title shown at the top of every embed. Includes the
 * disambiguating `name_extra` if present.
 */
function displayTitle(card) {
  if (card.name_extra) return `${card.name} ${card.name_extra}`;
  return card.name;
}

/**
 * Builds the description: card text followed by an optional flavour line.
 * Truncates to fit Discord's embed-description limit (4096 chars).
 */
function buildDescription(card, version) {
  const parts = [];
  if (card.text) parts.push(card.text);
  if (version && version.flavor) parts.push(`_${version.flavor}_`);
  if (parts.length === 0) return null;
  return truncate(parts.join("\n\n"), 4000, "…");
}

/**
 * Returns the inline stat fields appropriate to the card's type.
 */
function buildStatFields(card) {
  const fields = [];
  switch (card.type) {
    case "character":
      if (card.cost !== undefined && card.cost !== null) fields.push({ name: "Cost", value: String(card.cost), inline: true });
      if (card.military !== undefined && card.military !== null) fields.push({ name: "Military", value: String(card.military), inline: true });
      if (card.political !== undefined && card.political !== null) fields.push({ name: "Political", value: String(card.political), inline: true });
      if (card.glory !== undefined && card.glory !== null) fields.push({ name: "Glory", value: String(card.glory), inline: true });
      break;
    case "attachment":
      if (card.cost !== undefined && card.cost !== null) fields.push({ name: "Cost", value: String(card.cost), inline: true });
      if (card.military_bonus) fields.push({ name: "Military Bonus", value: String(card.military_bonus), inline: true });
      if (card.political_bonus) fields.push({ name: "Political Bonus", value: String(card.political_bonus), inline: true });
      break;
    case "event":
      if (card.cost !== undefined && card.cost !== null) fields.push({ name: "Cost", value: String(card.cost), inline: true });
      break;
    case "holding":
      if (card.cost !== undefined && card.cost !== null) fields.push({ name: "Cost", value: String(card.cost), inline: true });
      if (card.strength_bonus) fields.push({ name: "Strength Bonus", value: String(card.strength_bonus), inline: true });
      break;
    case "province":
      if (card.strength !== undefined && card.strength !== null) fields.push({ name: "Strength", value: String(card.strength), inline: true });
      if (card.elements && card.elements.length > 0) fields.push({ name: "Elements", value: card.elements.map(capitalize).join(" • "), inline: true });
      break;
    case "stronghold":
      if (card.glory !== undefined && card.glory !== null) fields.push({ name: "Glory", value: String(card.glory), inline: true });
      if (card.fate !== undefined && card.fate !== null) fields.push({ name: "Fate", value: String(card.fate), inline: true });
      if (card.honor !== undefined && card.honor !== null) fields.push({ name: "Honor", value: String(card.honor), inline: true });
      if (card.influence_pool !== undefined && card.influence_pool !== null) fields.push({ name: "Influence", value: String(card.influence_pool), inline: true });
      if (card.strength_bonus) fields.push({ name: "Strength Bonus", value: String(card.strength_bonus), inline: true });
      break;
    default:
      // role, treaty, warlord — no stats
      break;
  }
  if (card.influence_cost !== undefined && card.influence_cost !== null) {
    fields.push({ name: "Influence Cost", value: String(card.influence_cost), inline: true });
  }
  return fields;
}

/**
 * Builds the footer line: pack + position, current legality, and a
 * sibling-disambiguation hint if applicable.
 */
function buildFooter(card, version, pack, formatsById, siblings) {
  const parts = [];
  if (pack) {
    const pos = version && version.position ? ` #${version.position}` : "";
    parts.push(`${pack.name}${pos}`);
  }
  parts.push(legalitySummary(card, formatsById));
  if (siblings && siblings.length > 0) {
    const otherCount = siblings.length;
    parts.push(`${otherCount} other card${otherCount === 1 ? "" : "s"} share this name — use [[${card.name.toLowerCase()}|set]] to pick one`);
  }
  return parts.join(" • ");
}

function formatTrait(traitId) {
  if (!traitId) return "";
  return capitalize(traitId);
}

function capitalize(s) {
  if (!s || typeof s !== "string") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/EmeraldLegacy/embed.js
```

Expected: exits 0.

- [ ] **Step 3: Verify import probe**

```bash
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```

Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/EmeraldLegacy/embed.js
git commit -m "Added EmeraldLegacy embed renderer"
```

---

## Task 7: Rewire messageCreate for inline triggers

The strip phase left `src/Events/messageCreate.js` as a stub with whitelist + DM guards but no inline-trigger parsing. Restore the parsing pipeline, this time wiring against `src/EmeraldLegacy/api.js`, `src/Aliases/aliases.js`, and `src/EmeraldLegacy/embed.js`.

The inline-trigger syntax handled here:
- `[[card]]` — full card view
- `{{card}}` — image only
- `<<card>>` — flavour only
- `[[card|set]]` / `[[card|n]]` — pick a specific printing (build-phase Plan 1 ships this with set/index resolution, but only at the *card* level; the `|set` modifier picks which of the matching cards to render when there are multi-name siblings)

Multi-card name handling: when `getClosestCards` returns N cards, post one embed for the top card (most recent) and pass the remaining N-1 cards as `siblings` so the footer shows the disambiguation hint.

The `|<arg>` modifier for now only supports an integer index (`-1` for newest, `0` for first, etc.) into the matching-cards list. Set-name resolution is deferred to Plan 2 (it needs printing-level filtering, not just card-level). Document this clearly in the comment.

**Files:**
- Modify: `src/Events/messageCreate.js`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/Events/messageCreate.js` with:

```javascript
/**
 * Responds to messages by parsing inline card triggers.
 *
 * @file   This files defines the message-response module.
 */

///////////////////////////////////////////////////////////////////////////////

import { applyAlias } from "../Aliases/aliases.js";
import { getClosestCards } from "../EmeraldLegacy/api.js";
import {
  createCardEmbed,
  createCardImageEmbed,
  createCardFlavourEmbed,
} from "../EmeraldLegacy/embed.js";
import { readBool } from "../Utility/env.js";
import { logError } from "../Utility/error.js";
import * as wl from "../Permissions/serverWhitelist.js";
import { logQuery } from "../Database/database.js";

///////////////////////////////////////////////////////////////////////////////

const TRIGGER_REGEX =
  /\[\[[^\[\]]+?\]\]|\{\{[^\{\}]+?\}\}|<<[^<>]+?>>/g;

const QUERY_TYPE = {
  TEXT: 0,
  IMAGE: 1,
  FLAVOUR: 2,
};

///////////////////////////////////////////////////////////////////////////////

export default async function execute(message) {
  const { author, content } = message;

  // Ignore bot/empty messages
  if (author.bot || !content) return;

  // Whitelist gate
  if (
    message.guildId &&
    readBool("WHITELIST_SERVERS") &&
    !wl.isServerWhitelisted(message.guildId)
  ) {
    return;
  }

  // DM gate
  if (!message.guildId && !readBool("ALLOW_DIRECT_MESSAGES")) return;

  parseInlineTriggers(message).catch(logError);
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Parses inline triggers in a message and posts one embed per trigger.
 *
 * Supported syntax:
 *   [[card]]        - full card view
 *   {{card}}        - image only
 *   <<card>>        - flavour only
 *   [[card|n]]      - pick the nth matching card when there are siblings
 *                     (0 = oldest, -1 = newest; default is -1)
 *
 * Note: the `|<set>` form (pick a specific printing/pack) is reserved
 * for Plan 2; this build only resolves card-level disambiguation.
 *
 * @param {Object} message A Discord message.
 */
async function parseInlineTriggers(message) {
  const { client, content, channelId } = message;

  // Strip out code blocks before matching
  const filtered = content
    .replace(/(?<!\\)```[\s\S]*?```/g, "")
    .replace(/(?<!\\)`[\s\S]*?`/g, "");

  let matches = filtered.match(TRIGGER_REGEX);
  if (!matches) return;

  // Filter out unintentional queries
  matches = matches.filter(
    (m) => m.length - 4 <= +process.env.MAX_QUERY_LENGTH && !m.includes("||")
  );
  if (matches.length === 0) return;

  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const seen = new Set();
  let remaining = +process.env.RESULT_LIMIT;

  for (const match of matches) {
    if (remaining < 1) return;

    const rawInput = match.substring(2, match.length - 2).trim();
    if (!rawInput || rawInput.length > 255) continue;

    // Parse |index modifier if present
    const parts = rawInput.split("|");
    const query = parts.slice(0, parts.length > 1 ? -1 : undefined).join("|");
    const indexArg = parts.length > 1 ? parts[parts.length - 1].trim() : null;

    const dealiased = applyAlias(query);
    const cards = getClosestCards(dealiased);
    if (cards.length === 0) {
      logError(new Error(`No card matched query "${rawInput}"`));
      continue;
    }

    // Pick which card from the cards list (for multi-name siblings)
    const card = pickCard(cards, indexArg);
    if (!card) {
      logError(new Error(`Index "${indexArg}" out of range for query "${rawInput}"`));
      continue;
    }

    // Skip if this card has already been posted in this message
    if (seen.has(card.id)) continue;
    seen.add(card.id);

    const siblings = cards.filter((c) => c.id !== card.id);

    const trigger = match[0];
    const queryType =
      trigger === "[" ? QUERY_TYPE.TEXT
      : trigger === "{" ? QUERY_TYPE.IMAGE
      : QUERY_TYPE.FLAVOUR;

    const embed =
      trigger === "[" ? createCardEmbed(card, siblings)
      : trigger === "{" ? createCardImageEmbed(card)
      : createCardFlavourEmbed(card);

    logQuery(rawInput, card.id, "", channel.type, queryType);

    await channel.send({ embeds: [embed] });
    remaining--;
  }
}

/**
 * Picks a card from a list given an optional `|n` index modifier.
 *
 * - `null` or omitted → return the first card (most recent, since the list is sorted newest-first).
 * - Integer `n >= 0` → return the (n+1)th-most-recent card (0 = newest).
 * - Negative integers → count from the end (-1 = oldest).
 *
 * Returns null if the index is out of range or non-integer.
 *
 * @param {Object[]} cards Sorted list of matching cards (newest first).
 * @param {?string} indexArg The user-supplied modifier text.
 * @return {?Object}
 */
function pickCard(cards, indexArg) {
  if (indexArg === null || indexArg === undefined || indexArg === "") {
    return cards[0];
  }
  const n = parseInt(indexArg, 10);
  if (isNaN(n) || !Number.isInteger(n)) return null;
  if (n >= 0) {
    if (n >= cards.length) return null;
    return cards[n];
  }
  // Negative: count from end
  const idx = cards.length + n;
  if (idx < 0 || idx >= cards.length) return null;
  return cards[idx];
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/Events/messageCreate.js
```

Expected: exits 0.

- [ ] **Step 3: Verify import probe**

```bash
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```

Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/Events/messageCreate.js
git commit -m "Rewired message router for Emerald Legacy inline triggers"
```

---

## Task 8: Replace /about body with real content

The strip phase left `/about` returning a "mid-migration" placeholder. Replace with real Imperial Library content now that card lookup works.

**Files:**
- Modify: `src/Commands/about.js`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/Commands/about.js` with:

```javascript
/**
 * A command for displaying info about Imperial Library.
 *
 * @file   This files defines the about command module.
 */

///////////////////////////////////////////////////////////////////////////////

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("about")
  .setDescription("provides information about this bot");

const meta = {};

async function execute(interaction, client) {
  const message = `**Imperial Library** is a card-fetching Discord bot for [Legend of the Five Rings — Emerald Legacy](https://emeralddb.org/), the community-maintained continuation of the L5R LCG.\n\nUse \`[[card]]\` to look up a card, \`{{card}}\` for its image, or \`<<card>>\` for flavour text. See \`/help\` for full usage.\n\nCard data is sourced from [EmeraldDB](https://www.emeralddb.org/).`;

  const embed = new EmbedBuilder()
    .setTitle(":information_source: About Imperial Library")
    .setDescription(message)
    .setColor(+process.env.COLOR_INFO);

  await interaction.reply({ embeds: [embed] });
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute };
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/Commands/about.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/Commands/about.js
git commit -m "Replaced /about body with real Imperial Library content"
```

---

## Task 9: Replace /help body with real content

`/help` should document the inline triggers and the index modifier. The auto-listing of registered commands stays.

**Files:**
- Modify: `src/Commands/help.js`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/Commands/help.js` with:

```javascript
/**
 * A command for viewing user documentation for the bot.
 *
 * @file   This files defines the help command module.
 */

///////////////////////////////////////////////////////////////////////////////

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { normalise } from "../Utility/text.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("shows information about a specific command")
  .addStringOption((option) =>
    option
      .setName("command_name")
      .setDescription("the command to display info on")
      .setAutocomplete(true)
  );

const meta = {};

async function execute(interaction, client) {
  const commandName = interaction.options.getString("command_name");
  let titleText,
    descriptionText,
    color = +process.env.COLOR_INFO;

  if (commandName) {
    const command = client.commands.get(commandName);
    if (command && !command.data.hideFromHelp) {
      titleText = `\`${command.data.name}\``;
      descriptionText = command.data.longDescription
        ? command.data.longDescription
        : command.data.description;
    } else {
      titleText = "Unknown command";
      descriptionText =
        "No command exists with that name! Try `/help` for a full list of commands.";
      color = +process.env.COLOR_ERROR;
    }
  } else {
    titleText = "Imperial Library";
    descriptionText = `A Discord bot for [Legend of the Five Rings — Emerald Legacy](https://emeralddb.org/).\n\n**Looking up cards**\n\`[[card]]\` to view a card with stats, text, and current legality\n\`{{card}}\` to view its image only\n\`<<card>>\` to view its flavour text only\n\n**Disambiguating shared names**\nL5R has multiple distinct cards sharing a name (e.g. \`Tadaka\`). When this happens, \`[[card]]\` shows the most recent one and a footer hint lists the others. Use \`[[card|n]]\` to pick a specific match: \`-1\` is the oldest, \`0\` is the newest (the default).\n\n**Commands**`;

    client.commands.forEach((command) => {
      if (!command.meta.hideFromHelp) {
        descriptionText += `\n\`${command.data.name}\` ${command.data.description}`;
      }
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`:scroll:  ${titleText}`)
    .setDescription(descriptionText)
    .setColor(color);

  await interaction.reply({ embeds: [embed] });
}

async function autocomplete(interaction, client) {
  const focusedValue = normalise(interaction.options.getFocused());
  const validChoices = client.commands
    .filter(
      (command) =>
        !command.meta.hideFromHelp &&
        normalise(command.data.name).startsWith(focusedValue)
    )
    .map((command) => ({ name: command.data.name, value: command.data.name }));
  await interaction.respond(validChoices);
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute, autocomplete };
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/Commands/help.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/Commands/help.js
git commit -m "Replaced /help body with real Imperial Library content"
```

---

## Task 10: Recreate the alias_add superuser command

The strip phase deleted the alias superuser commands because they imported from `src/Netrunner/`. Recreate them now wired against `src/Aliases/aliases.js` and `src/EmeraldLegacy/api.js` for autocomplete.

**Files:**
- Create: `src/Commands/Superuser/aliasAdd.js`

- [ ] **Step 1: Create the file**

Create `src/Commands/Superuser/aliasAdd.js` with:

```javascript
/**
 * A superuser command for adding card aliases.
 *
 * @file   This files defines the aliasAdd command module.
 */

///////////////////////////////////////////////////////////////////////////////

import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { addAlias, saveAliases } from "../../Aliases/aliases.js";
import {
  getAllNormalisedNames,
  denormaliseCardName,
} from "../../EmeraldLegacy/api.js";
import { normalise } from "../../Utility/text.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("alias_add")
  .setDescription("adds an alias for a given card")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName("alias")
      .setDescription("the alias to map to a card")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("card")
      .setDescription("the card the alias will map to")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption((option) =>
    option
      .setName("can_group")
      .setDescription("whether the alias can be a group alias")
  );

const meta = {
  hideFromHelp: true,
};

async function execute(interaction, client) {
  if (interaction.user.id != process.env.SUPER_USER) {
    const embed = new EmbedBuilder()
      .setTitle("Invalid permissions!")
      .setDescription(
        `You do not have permission to use this command, but you are seeing it because Discord does not allow any commands to be hidden from administrators.`
      )
      .setColor(+process.env.COLOR_ERROR);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const alias = interaction.options.getString("alias");
  const cardName = interaction.options.getString("card");
  const canGroup = interaction.options.getBoolean("can_group");
  const success = addAlias(alias, cardName, canGroup);

  let embed;
  if (success) {
    embed = new EmbedBuilder()
      .setTitle("Alias added!")
      .setDescription(`\`${alias}\` ⇒ \`${cardName}\``)
      .setColor(+process.env.COLOR_INFO);
    saveAliases();
  } else {
    embed = new EmbedBuilder()
      .setTitle("Alias already exists!")
      .setDescription(`\`${alias}\` is already an alias for a card.`)
      .setColor(+process.env.COLOR_ERROR);
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function autocomplete(interaction) {
  const focusedValue = normalise(interaction.options.getFocused());
  const validChoices = getAllNormalisedNames()
    .filter((n) => n.includes(focusedValue))
    .slice(0, 25)
    .map((n) => ({ name: denormaliseCardName(n), value: denormaliseCardName(n) }));
  await interaction.respond(validChoices);
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute, autocomplete };
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/Commands/Superuser/aliasAdd.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/Commands/Superuser/aliasAdd.js
git commit -m "Added /alias_add superuser command"
```

---

## Task 11: Recreate the alias_remove superuser command

**Files:**
- Create: `src/Commands/Superuser/aliasRemove.js`

- [ ] **Step 1: Create the file**

Create `src/Commands/Superuser/aliasRemove.js` with:

```javascript
/**
 * A superuser command for removing card aliases.
 *
 * @file   This files defines the aliasRemove command module.
 */

///////////////////////////////////////////////////////////////////////////////

import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { removeAlias, saveAliases } from "../../Aliases/aliases.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("alias_remove")
  .setDescription("removes an alias")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName("alias")
      .setDescription("the alias to remove")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("card")
      .setDescription("if specified, only remove this card from the alias group")
  );

const meta = {
  hideFromHelp: true,
};

async function execute(interaction, client) {
  if (interaction.user.id != process.env.SUPER_USER) {
    const embed = new EmbedBuilder()
      .setTitle("Invalid permissions!")
      .setDescription(
        `You do not have permission to use this command, but you are seeing it because Discord does not allow any commands to be hidden from administrators.`
      )
      .setColor(+process.env.COLOR_ERROR);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const alias = interaction.options.getString("alias");
  const cardName = interaction.options.getString("card");
  const success = removeAlias(alias, cardName);

  let embed;
  if (success) {
    embed = new EmbedBuilder()
      .setTitle("Alias removed!")
      .setDescription(
        cardName
          ? `Removed \`${cardName}\` from alias \`${alias}\`.`
          : `Removed alias \`${alias}\`.`
      )
      .setColor(+process.env.COLOR_INFO);
    saveAliases();
  } else {
    embed = new EmbedBuilder()
      .setTitle("Alias not found!")
      .setDescription(
        cardName
          ? `\`${cardName}\` is not part of alias \`${alias}\`.`
          : `No alias \`${alias}\` exists.`
      )
      .setColor(+process.env.COLOR_ERROR);
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute };
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/Commands/Superuser/aliasRemove.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/Commands/Superuser/aliasRemove.js
git commit -m "Added /alias_remove superuser command"
```

---

## Task 12: Recreate the alias_view command

`alias_view` lists all aliases for a given card. It is not superuser-restricted (anyone can see the alias list).

**Files:**
- Create: `src/Commands/Superuser/aliasView.js`

- [ ] **Step 1: Create the file**

Create `src/Commands/Superuser/aliasView.js` with:

```javascript
/**
 * A command for viewing a card's aliases.
 *
 * @file   This files defines the aliasView command module.
 */

///////////////////////////////////////////////////////////////////////////////

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { listAliases } from "../../Aliases/aliases.js";
import {
  getClosestCards,
  getAllNormalisedNames,
  denormaliseCardName,
} from "../../EmeraldLegacy/api.js";
import { factionToColor } from "../../EmeraldLegacy/discord.js";
import { normalise } from "../../Utility/text.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("alias_view")
  .setDescription("displays all aliases of a given card")
  .addStringOption((option) =>
    option
      .setName("card")
      .setDescription("the card to view")
      .setRequired(true)
      .setAutocomplete(true)
  );

const meta = {};

async function execute(interaction, client) {
  const cardName = interaction.options.getString("card");
  const cards = getClosestCards(cardName);
  const aliases = listAliases(cards.length > 0 ? cards[0].name : cardName);

  let embed;
  if (cards.length === 0) {
    embed = new EmbedBuilder()
      .setTitle("Card not found!")
      .setDescription(`\`${cardName}\` did not match any card.`)
      .setColor(+process.env.COLOR_ERROR);
  } else if (aliases.length > 0) {
    embed = new EmbedBuilder()
      .setColor(factionToColor(cards[0].faction))
      .setTitle("Aliases!")
      .setDescription(
        `Aliases for **${cards[0].name}**:\n- ${aliases.join("\n- ")}`
      );
  } else {
    embed = new EmbedBuilder()
      .setTitle("No aliases found!")
      .setDescription(`\`${cards[0].name}\` has no aliases.`)
      .setColor(+process.env.COLOR_ERROR);
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function autocomplete(interaction) {
  const focusedValue = normalise(interaction.options.getFocused());
  const validChoices = getAllNormalisedNames()
    .filter((n) => n.includes(focusedValue))
    .slice(0, 25)
    .map((n) => ({ name: denormaliseCardName(n), value: denormaliseCardName(n) }));
  await interaction.respond(validChoices);
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute, autocomplete };
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/Commands/Superuser/aliasView.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/Commands/Superuser/aliasView.js
git commit -m "Added /alias_view command"
```

---

## Task 13: Register alias commands in the registry

`src/Structures/commands.js` currently registers only Help, About, and three whitelist commands. Add the three alias commands.

**Files:**
- Modify: `src/Structures/commands.js`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/Structures/commands.js` with:

```javascript
/**
 * The command module. This loads all the commands at startup.
 *
 * @file   This files defines the commands module for the bot.
 */

///////////////////////////////////////////////////////////////////////////////

import Help from "./../Commands/help.js";
import About from "./../Commands/about.js";

import AliasAdd from "./../Commands/Superuser/aliasAdd.js";
import AliasRemove from "./../Commands/Superuser/aliasRemove.js";
import AliasView from "./../Commands/Superuser/aliasView.js";

import WhitelistAddServer from "../Commands/Superuser/whitelistServerAdd.js";
import WhitelistRemoveServer from "../Commands/Superuser/whitelistServerRemove.js";
import WhitelistViewServers from "../Commands/Superuser/whitelistServerView.js";

///////////////////////////////////////////////////////////////////////////////

export async function init(client) {
  const commands = [
    Help,
    About,

    AliasAdd,
    AliasRemove,
    AliasView,

    WhitelistAddServer,
    WhitelistRemoveServer,
    WhitelistViewServers,
  ];

  commands.forEach((command) => {
    client.commands.set(command.data.name, command);
  });
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check src/Structures/commands.js
```

Expected: exits 0.

- [ ] **Step 3: Verify import probe**

```bash
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```

Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/Structures/commands.js
git commit -m "Registered alias superuser commands in registry"
```

---

## Task 14: Update CLAUDE.md migration status

Mark the MVP build complete in CLAUDE.md.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the migration-status block**

Find the "Migration status" section, which currently has the three-line list with steps 1, 2, and 3 (where step 3 is "In progress"). Replace the three-line block and the paragraph immediately below it with:

```markdown
1. **Done.** Tagged `netrunner-final` — last commit reflecting the Netrunner-era project.
2. **Done.** Stripped Netrunner/ONR code, content, and config (see `docs/superpowers/plans/2026-04-27-strip-netrunner.md`).
3. **Done (MVP).** Built Emerald Legacy inline-trigger card lookup against EmeraldDB (see `docs/superpowers/plans/2026-04-28-emerald-legacy-mvp.md`). The bot now answers `[[card]]`, `{{card}}`, and `<<card>>`, plus the alias superuser commands.
4. **Pending.** Remaining slash commands (`/search`, `/random`, `/view_set`, `/view_format`, `/view_cycle`) — separate plan to follow.

The bot is now usable for its core card-lookup purpose. Slash card commands are a future enhancement, not a blocker for deploying.
```

- [ ] **Step 2: Verify**

```bash
grep -A 6 "## Migration status" CLAUDE.md | head -20
```

Confirm the new four-step list is in place.

- [ ] **Step 3: Final overall smoke**

Run all syntax checks and the import probe one more time to confirm the whole branch is healthy:

```bash
find src -name "*.js" -print0 | xargs -0 -n1 node --check
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```

Expected: no syntax errors, probe prints `OK`.

If you have network access and an EmeraldDB-reachable environment, also run a final live boot smoke:

```bash
EMERALDDB_API_URL=https://www.emeralddb.org/api node -e "
import('./src/EmeraldLegacy/api.js').then(async (m) => {
  await m.init();
  const cards = m.getClosestCards('hida kisada');
  console.log('Tasks 4-7 wiring works. Found', cards.length, 'cards for \"hida kisada\".');
}).catch((e) => { console.error(e); process.exit(1); });
"
```

Expected: prints "Tasks 4-7 wiring works. Found N cards for ..." with N >= 1.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Marked MVP build phase complete in migration status"
```

---

## What comes after this plan

The remaining slash commands (`/search`, `/random`, `/view_set`, `/view_format`, `/view_cycle`) are deferred to a separate Plan 2. They share most of the data infrastructure built here (`src/EmeraldLegacy/api.js` already has `getCardById`, `getPack`, `getCycle`, `getFormatsById`), so Plan 2 should be substantially smaller.

Plan 2 will need to add:
- A free-text search helper on the API module (more than the single-best-match lookup `getClosestCards` provides — probably top-N matches with optional faction/type filters).
- A "browse" embed style (multi-card listings rather than single-card detail).
- The actual slash command files (six new files plus registry updates).

Out-of-scope work that may eventually be requested:
- Rules and glossary commands (deferred indefinitely; need a parser for the `Emerald-Legacy/rules-documents` AsciiDoc).
- Rulings (per-card via `GET /api/cards/:id`, since the bulk endpoint omits them).
- Reactions to detect copy-pasted decklists (Sahasrara had this; not in CLAUDE.md scope).
