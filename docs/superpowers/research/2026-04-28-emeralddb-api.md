# EmeraldDB API characterization

## Summary

EmeraldDB is a self-hosted Express.js / PostgreSQL application that serves both the card database frontend and a public REST API for Emerald Legacy (the community continuation of the FFG L5R LCG). The API lives under the `/api` prefix on whatever host the project is deployed to; the production domain, based on the hardcoded URL in `src/bot/private/commands/rulings.ts`, is **`https://www.emeralddb.org`**, so the API root is `https://www.emeralddb.org/api`.

The server (Express 5, TypeScript) exposes plain JSON responses — not JSON:API, not GraphQL. This is a significant departure from the Netrunner v3 JSON:API the bot previously consumed: there is no `data`/`attributes` envelope, no sparse fieldset syntax, no relationship links, and no pagination. Every list endpoint returns a flat JSON array in a single response. The framework is Express 5 with Knex 3 managing a PostgreSQL schema; types are shared via the local `@5rdb/api` package in `apiTypings/`.

Authentication is Auth0 / JWT (RS256) for write operations only. All read endpoints — cards, packs, cycles, formats, traits, rulings — are completely open with no authentication required. CORS is enabled for all origins (`app.use(cors())`). GET responses under `/api` carry `Cache-Control: public, max-age=300` (5 minutes), set by `src/app.ts`. Compression (gzip/brotli) is applied globally.

There is **no rules document API** and **no glossary API** served by EmeraldDB. The rules reference is fetched client-side directly from a raw GitHub URL as an AsciiDoc file; the glossary is not in scope for this application at all. Both of these bot features will require a different data source.

---

## Base URL and authentication

| Item | Value |
|---|---|
| Production base URL | `https://www.emeralddb.org/api` (inferred from `rulings.ts:86`) |
| Protocol | HTTPS |
| Content-type | `application/json` |
| CORS | Fully open (`cors()` with no origin restriction) |
| Compression | gzip/brotli on all responses |
| Cache-Control (GET) | `public, max-age=300` (5 min, set by server) |
| Auth (read endpoints) | None required |
| Auth (write endpoints) | Bearer token — Auth0 JWT, RS256, audience `http://fiveringsdb.com` |
| Rate limiting | Not codified in the source; no middleware visible |
| Pagination | None — all list endpoints return complete arrays |

The production URL is not present in any config file or environment variable in the repo; it is inferred from the hardcoded card detail link in `src/bot/private/commands/rulings.ts` line 84: `url: \`https://www.emeralddb.org/card/${card.id}\``. Confirm by fetching `https://www.emeralddb.org/api/cards` during implementation.

---

## Endpoints

### Cards

#### List all cards

```
GET /api/cards
```

**Auth:** none  
**Query params:** none  
**Response:** `CardWithVersions[]`

Each element is a `Card` object with an additional `versions` array holding all `CardInPack` entries (minus `card_id`) for that card. The handler (`src/handlers/getAllCards.ts`) also post-processes `<br/>` in `text` fields into `\n` newlines. Results are sorted alphabetically by `name`.

**Example (synthesized from `CardWithVersions` type — `apiTypings/private/compositeTypes.ts:3`):**

```json
{
  "id": "a-new-name",
  "name": "A New Name",
  "name_extra": null,
  "faction": "crab",
  "side": "conflict",
  "type": "event",
  "is_unique": false,
  "role_restrictions": [],
  "text": "Action: ...",
  "restricted_in": ["emerald"],
  "banned_in": null,
  "splash_banned_in": null,
  "allowed_clans": ["crab", "crane", "dragon", "lion", "phoenix", "scorpion", "unicorn", "mantis"],
  "traits": ["Tactic"],
  "cost": "1",
  "deck_limit": 3,
  "influence_cost": 2,
  "elements": null,
  "strength": null,
  "glory": null,
  "fate": null,
  "honor": null,
  "influence_pool": null,
  "strength_bonus": null,
  "military": null,
  "political": null,
  "military_bonus": null,
  "political_bonus": null,
  "versions": [
    {
      "pack_id": "core",
      "flavor": "\"Steel sharpens steel.\"",
      "illustrator": "John Doe",
      "image_url": "https://images-cdn.fantasyflightgames.com/.../card.png",
      "position": "001",
      "quantity": 3,
      "rotated": false
    }
  ]
}
```

#### Get single card with rulings

```
GET /api/cards/:cardId
```

**Auth:** none  
**Path param:** `cardId` — the card's string ID (slug format, e.g. `a-new-name`)  
**Response:** `CardWithDetails` — same as `CardWithVersions` plus a `rulings` array

**Example (synthesized from `CardWithDetails` type — `apiTypings/private/compositeTypes.ts:7`):**

```json
{
  "...all CardWithVersions fields...",
  "versions": [...],
  "rulings": [
    {
      "id": 1,
      "card_id": "a-new-name",
      "text": "This card does X when...",
      "source": "Developer ruling",
      "link": "https://discord.com/..."
    }
  ]
}
```

Returns HTTP 404 if the card ID is not found.

**Implication for the bot:** The `[[card]]` lookup should call `GET /api/cards` once at startup (or on first use) to build a local name index, then use the card's `id` to call `GET /api/cards/:cardId` for full details. The existing EmeraldDB Discord bot (`src/bot/private/cardCache.ts`) demonstrates this pattern: it hits `getAllCards()` and `getAllCardsInPacks()` directly from the DB, building a Fuse.js index over names; the HTTP-facing equivalent would be `GET /api/cards` for the bulk snapshot.

---

### Sets / packs

```
GET /api/packs
```

**Auth:** none  
**Response:** `Pack[]`

The `size` field is computed server-side as `COALESCE(SUM(cards_in_packs.quantity), 0)` via a LEFT JOIN — it is not stored in the `packs` table (`src/gateways/storage/private/pack.ts:17`).

**Example (synthesized from `Pack` type — `apiTypings/private/baseTypes.ts:45`):**

```json
[
  {
    "id": "core",
    "name": "Core Set",
    "position": 1,
    "size": 159,
    "released_at": "2017-08-17",
    "publisher_id": "ffg",
    "cycle_id": "core",
    "rotated": false
  }
]
```

To get full contents of a specific pack (all cards + CardInPack data), use:

```
GET /api/packs/export/:id
```

**Auth:** none  
**Response:**

```json
{
  "pack": { ...Pack },
  "cards": [ ...Card[] ],
  "cardsInPack": [ ...CardInPack[] ]
}
```

This is the only endpoint that returns a complete pack-with-cards bundle in one call (`src/handlers/exportPack.ts`).

---

### Formats

```
GET /api/formats
```

**Auth:** none  
**Response:** `Format[]`

**Example (synthesized from `Format` type — `apiTypings/private/baseTypes.ts:86`):**

```json
[
  {
    "id": "emerald",
    "name": "Emerald Legacy",
    "legal_packs": ["core", "fcb", "tftj", "..."],
    "supported": true,
    "position": 1,
    "maintainer": "Emerald Legacy Team",
    "description": "The primary community format...",
    "info_link": "https://emeraldlegacy.org/"
  }
]
```

Known format IDs (from migrations and `src/model/enums.ts`):

| ID | Name | Notes |
|---|---|---|
| `standard` | Stronghold Format | FFG's original |
| `single-core` | Single Core Format | |
| `skirmish` | Skirmish Format | |
| `jade-edict` | Jade Edict Format | |
| `enlightenment` | Enlightenment Format | |
| `emerald` | Emerald Legacy | EL community format |
| `obsidian` | Obsidian | Added 2021 |

The `legal_packs` field is a PostgreSQL `varchar(255)[]` array (added migration `20231110161403`). It lists the pack IDs that are legal in the format. This is the canonical way to determine card legality: a card is legal in a format if any of its `versions` has a `pack_id` that appears in the format's `legal_packs` array. Format legality on the `Card` object itself (`restricted_in`, `banned_in`, `splash_banned_in`) uses format IDs directly.

---

### Cycles

```
GET /api/cycles
```

**Auth:** none  
**Response:** `Cycle[]`

**Example (synthesized from `Cycle` type — `apiTypings/private/baseTypes.ts:67`):**

```json
[
  {
    "id": "core",
    "name": "Core Set",
    "position": 1,
    "size": 1,
    "rotated": false,
    "publisher": "ffg"
  },
  {
    "id": "emerald-legacy",
    "name": "Emerald Legacy",
    "position": 99,
    "size": 5,
    "rotated": false,
    "publisher": "emerald-legacy"
  }
]
```

The `publisher` field distinguishes FFG-published cycles (`"ffg"`) from community-published ones (`"emerald-legacy"`); it was added in migration `20231110153927`. Packs link to cycles via `pack.cycle_id`.

**Decision resolved:** EL absolutely uses cycles. The `/view_cycle` command should be **kept**. The `/api/cycles` endpoint is a first-class public endpoint returning rich data with `publisher` discrimination.

---

### Traits

```
GET /api/traits
```

**Auth:** none  
**Response:** `Trait[]`

```json
[
  { "id": "bushi", "name": "Bushi" },
  { "id": "courtier", "name": "Courtier" }
]
```

Traits are a simple lookup table. Not directly relevant to the bot use-cases described in the spec, but useful for display/search.

---

### Rulings

There is **no standalone `/api/rulings` GET endpoint** for listing all rulings. Rulings are attached to cards and returned:

- In `GET /api/cards/:cardId` → the `rulings` array on `CardWithDetails`
- The storage layer has `getAllRulings()` (`src/gateways/storage/private/ruling.ts:6`) but it is not wired to any route

The `Ruling` type (`apiTypings/private/baseTypes.ts:37`):

```typescript
{
  id: number        // auto-increment integer
  card_id: string   // FK to cards.id
  text: string      // ruling text, may contain markdown links [text](url)
  source: string    // e.g. "Developer ruling"
  link: string      // URL to original ruling source
}
```

**Implication for the bot:** The `/get_rule <id>` and `/search_rule <query>` commands cannot hit a dedicated rulings list endpoint. Options are: (a) fetch `GET /api/cards` (which does NOT include rulings — only the single-card endpoint does), then separately hit `GET /api/cards/:cardId` per card to get rulings; or (b) build a rulings index by iterating the full card list at startup.

---

### Rules document

**There is no rules document API in EmeraldDB.** The client (`client/src/views/ELRulesReferenceGuideNew.tsx:21`) fetches the rules reference directly from:

```
https://raw.githubusercontent.com/Emerald-Legacy/rules-documents/main/docs/Rules%20Reference%20Guide.adoc
```

This is a raw AsciiDoc file from a separate GitHub repository (`Emerald-Legacy/rules-documents`). The client converts it to HTML client-side using the `asciidoctor` npm package.

**Implication for the bot:** `/get_rule <id>` and `/search_rule <query>` must source data from the GitHub raw URL above (or clone the `rules-documents` repo). The structure is AsciiDoc, not structured JSON — parsing will require AsciiDoc handling or treating sections as plain text.

---

### Glossary

**There is no glossary API or glossary data in EmeraldDB.** No glossary table exists in migrations, no glossary handler exists in `src/handlers/`, and the client has no glossary view.

**Implication for the bot:** The `/glossary <term>` command must source its data from somewhere else entirely (e.g. the same `rules-documents` AsciiDoc, a separate data file, or a bespoke glossary maintained in the bot's own repo).

---

### Image proxy

```
GET /api/image-proxy?url=<encoded-url>
```

**Auth:** none  
**Purpose:** Proxies image URLs through the server to avoid mixed-content errors when the card's `image_url` uses plain HTTP  
**Allowed domains:** `lcg-cdn.fantasyflightgames.com`, `images-cdn.fantasyflightgames.com`  
**Response:** Piped image content with original `Content-Type`; `Cache-Control: public, max-age=86400`

**Implication for the bot:** The bot should use `image_url` from `CardInPack` directly (it is a full URL). The proxy is for the web frontend's mixed-content concern; a Discord bot sending an embed image URL is not affected by that. However if an `image_url` starts with `http://`, the bot can either use the image proxy or just pass the URL to Discord (Discord fetches images itself).

---

## Field-by-field card schema

The definitive schema is in `apiTypings/private/baseTypes.ts` (the `Card` and `CardInPack` interfaces), confirmed by migrations `20210403203438_create_cards_table.js`, `20210604080549_add_splash_banned_column.js`, and `20210723172233_role_restriction_array.js`.

### `Card` fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | Slug form of name, e.g. `a-new-name`. Primary key |
| `name` | `string` | yes | Display name |
| `name_extra` | `string \| undefined` | no | Disambiguator, e.g. `"(Experienced 2)"` or a version number in parentheses like `"(2)"`. The bot's card cache strips version numbers and appends them as `"Name 2"` |
| `faction` | `string` | yes | One of: `crab`, `crane`, `dragon`, `lion`, `mantis`, `phoenix`, `scorpion`, `unicorn`, `neutral`, `shadowlands`. Previously called `clan` (renamed migration `20210604084222`) |
| `side` | `string` | yes | One of: `conflict`, `dynasty`, `province`, `role`, `treaty` |
| `type` | `string` | yes | One of: `attachment`, `character`, `event`, `holding`, `province`, `role`, `stronghold`, `treaty`, `warlord` |
| `is_unique` | `boolean` | yes | Whether the card has the Unique dot |
| `role_restrictions` | `string[]` | yes (default `{}`) | Array of role restriction strings, e.g. `["keeper"]`, `["air"]`. Added migration `20210723172233` |
| `text` | `string \| undefined` | no | Card text, with `<br/>` converted to `\n` in API responses. May be undefined for some card types |
| `restricted_in` | `string[] \| undefined` | no | Array of format IDs where this card is restricted |
| `banned_in` | `string[] \| undefined` | no | Array of format IDs where this card is banned |
| `splash_banned_in` | `string[] \| undefined` | no | Array of format IDs where this card is banned when splashed (out-of-clan). Added migration `20210604080549` |
| `allowed_clans` | `string[] \| undefined` | no | Clans that may include this card; for clan-restricted cards |
| `traits` | `string[] \| undefined` | no | Array of trait IDs, e.g. `["bushi", "duelist"]` |
| `cost` | `string \| undefined` | no | Stored as string to accommodate `"-"` and `"X"` values |
| `deck_limit` | `number` | yes | Maximum copies in a deck (usually 3) |
| `influence_cost` | `number \| undefined` | no | Out-of-clan influence cost |
| `elements` | `string[] \| undefined` | no | Province cards only: one or more of `air`, `earth`, `fire`, `void`, `water` |
| `strength` | `string \| undefined` | no | Province strength (string for `"X"` values) |
| `glory` | `number \| undefined` | no | Stronghold only |
| `fate` | `number \| undefined` | no | Stronghold only |
| `honor` | `number \| undefined` | no | Stronghold only |
| `influence_pool` | `number \| undefined` | no | Stronghold only |
| `strength_bonus` | `string \| undefined` | no | Holding only: bonus to province strength |
| `military` | `string \| undefined` | no | Character only: military skill |
| `political` | `string \| undefined` | no | Character only: political skill |
| `military_bonus` | `string \| undefined` | no | Attachment only |
| `political_bonus` | `string \| undefined` | no | Attachment only |

### `CardInPack` fields (a.k.a. "version")

Returned in the `versions` array on `CardWithVersions` / `CardWithDetails`. The `card_id` field is omitted from the array items (only present in the raw DB type).

| Field | Type | Required | Notes |
|---|---|---|---|
| `pack_id` | `string` | yes | FK to `packs.id` |
| `flavor` | `string \| undefined` | no | Flavour text. Stored as `text` (unlimited length) since migration `20210701153449`. This is the field for `<<card>>` lookups |
| `illustrator` | `string \| undefined` | no | Illustrator credit |
| `image_url` | `string \| undefined` | no | Full URL to card image. May be `http://` (FFG CDN) or `https://`. May be absent |
| `position` | `string \| undefined` | no | Card position within the pack, e.g. `"001"` |
| `quantity` | `number \| undefined` | no | Number of copies in the pack |
| `rotated` | `boolean` | yes | Whether this specific pack printing is in the rotation |

**Key observation:** `image_url` and `flavor` live on `CardInPack`, not on `Card`. A card may have multiple versions (printings) in different packs, each with its own image and flavour text. The bot must pick a version when displaying an image or flavour. The EmeraldDB bot's cache (`src/bot/private/cardCache.ts`) takes the first version that has an `image_url`.

---

## Open questions and gaps

1. **Production base URL:** Inferred as `https://www.emeralddb.org/api` from the hardcoded card URL in `src/bot/private/commands/rulings.ts:84`. Confirm by fetching `https://www.emeralddb.org/api/cards` during implementation.

2. **Which version's image/flavour to use:** When a card has multiple printings, the API returns all versions. The EmeraldDB bot uses the first version with an `image_url`. The bot spec's `{{card}}` (image) and `<<card>>` (flavour) lookups need a version-selection strategy. This is a design decision for build phase — candidates: most-recent non-rotated, first available, or user-selectable.

3. **Rulings index strategy:** There is no `/api/rulings` list endpoint. Building a rulings index requires either (a) fetching each card individually via `GET /api/cards/:cardId`, or (b) requesting that the EmeraldDB maintainers add a `/api/rulings` GET endpoint. Option (a) is O(n) requests which is expensive. Recommend checking actual card count at runtime before committing to approach.

4. **Rules document structure:** The AsciiDoc at `https://raw.githubusercontent.com/Emerald-Legacy/rules-documents/main/docs/Rules%20Reference%20Guide.adoc` has no known structured section identifiers yet. `/get_rule <id>` implies stable IDs — check whether the AsciiDoc uses anchor IDs in sections.

5. **Glossary data source:** Completely absent from EmeraldDB. The bot's `/glossary <term>` command needs a dedicated data source — either parsed from the rules AsciiDoc or a maintained standalone list. This is a build-phase blocker for that command.

6. **`legal_packs` null handling:** Some formats may have `legal_packs: null` (the column is nullable). The legality determination logic must handle this case.

7. **`allowed_clans` for Mantis:** Migration `20241016210841` back-filled Mantis into `allowed_clans` for any card that was already allowed for Crab and Crane. The Mantis clan/faction was added across three migrations in October 2024. Check whether this migration ran successfully on production; cards playable by Mantis may not always list Mantis in `allowed_clans` if the migration had issues.

8. **Rate limits:** No rate limiting middleware is present in the source. The server is a single Node.js process. Burst requests (e.g. startup bulk fetch) are fine; sustained heavy traffic is not protected against.

---

## Decisions resolved

### Does EL have cycles? Keep `/view_cycle`?

**Yes — keep `/view_cycle`.** The `/api/cycles` endpoint is a proper first-class resource with `id`, `name`, `position`, `size`, `rotated`, and `publisher` (`"ffg"` vs `"emerald-legacy"`). Packs link to cycles via `pack.cycle_id`. The CycleList component in the client renders a full cycle-and-pack hierarchy tree. Cycles are a real, meaningful grouping in EmeraldDB.

### Is there a rules or glossary API?

**No.** Both bot features (`/get_rule`, `/search_rule`, `/glossary`) need a data source entirely outside EmeraldDB. The rules are served from the `Emerald-Legacy/rules-documents` GitHub repo as AsciiDoc. There is no glossary in any EmeraldDB data.

### Is the API paginated?

**No.** All list endpoints return complete arrays. The entire card catalogue is returned in one `GET /api/cards` call.

### Is auth required for read endpoints?

**No.** All read endpoints are public and unauthenticated.

### Does flavour text live on the card?

**No — flavour text (`flavor`) lives on `CardInPack`** (the `versions` array). There is no `flavor` field on `Card`. This means `<<card>>` lookups must access `card.versions[n].flavor`, and the bot needs to choose which version's flavour to use when multiple exist.

---

## Recommendations for the build phase

### Architecture of `src/EmeraldLegacy/api.js`

1. **Full snapshot at startup, cached in memory.** Call `GET /api/cards` once. This returns `CardWithVersions[]` — all cards with all their pack printings. Build a Fuse.js index over `name` (and `name_extra`). Refresh the snapshot every ~10 minutes (the server's `Cache-Control` is 5 minutes; 10 minutes gives a safety margin while staying fresh).

2. **Separate format/pack/cycle fetches.** `GET /api/formats`, `GET /api/packs`, and `GET /api/cycles` are small arrays. Fetch these at startup too and store in memory. Refresh on the same cadence.

3. **`GET /api/cards/:cardId` for rulings only.** The bulk endpoint does not include rulings. When a user triggers a rulings lookup, hit the single-card endpoint. Cache per-card rulings with a short TTL (e.g. 5 min) to avoid hammering the server.

4. **Version selection for image and flavour.** Implement a `preferredVersion(card)` helper that picks the first non-rotated version with an `image_url`; fall back to any version with an `image_url`; fall back to `null`. Apply the same logic for `flavor`.

5. **`image_url` format.** If `image_url` starts with `http://`, you can either: (a) use the EmeraldDB image proxy (`https://www.emeralddb.org/api/image-proxy?url=...`) — but this only allows FFG CDN domains; or (b) pass the HTTP URL directly to Discord (Discord fetches the image itself over HTTPS if the URL redirects, or renders it anyway). Test both during implementation.

6. **Legality determination.** For `[[card]]` embed legality fields: cross-reference `card.restricted_in`, `card.banned_in`, `card.splash_banned_in` (format ID arrays) against the format IDs from `GET /api/formats`. `legal_packs` on a format object tells you which packs are legal; use this to derive whether a given version is legal.

7. **No pagination to handle.** Unlike the old Netrunner JSON:API (which used cursor-based pagination), every EmeraldDB list endpoint returns the complete dataset in one shot. Remove any pagination-looping logic from the new API module.

8. **Content-type is always `application/json`.** No `Accept: application/vnd.api+json` header needed, no `Content-Type` negotiation.

9. **Rules and glossary.** These are out of scope for the EmeraldDB API module. They need a separate `src/Rules/emeraldLegacyRules.js` module that fetches from `https://raw.githubusercontent.com/Emerald-Legacy/rules-documents/main/docs/Rules%20Reference%20Guide.adoc` and parses the AsciiDoc. Evaluate whether a simple regex-based section splitter is sufficient or whether the full `asciidoctor` npm package is needed.

10. **`<br/>` normalisation.** The server already converts `<br/>` to `\n` in `text` fields (see `src/handlers/getAllCards.ts:22`). The bot does not need to do this itself.

11. **Card ID format.** Card IDs are slug strings (lowercase, hyphenated). When constructing a card detail URL for Discord embeds: `https://www.emeralddb.org/card/${card.id}`.

12. **Mantis awareness.** Mantis (`"mantis"`) is now a full faction and clan. It appears in `faction` values, `allowed_clans` arrays, and the clan enum. Any display logic that maps faction slugs to names/icons must include Mantis.
