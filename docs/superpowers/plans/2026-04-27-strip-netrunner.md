# Strip Netrunner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Netrunner-specific code, content, and configuration from `imperial-library`, leaving a slim Discord/utility infrastructure base ready for the Emerald Legacy build phase.

**Architecture:** Surgical strip in three passes — first disconnect Netrunner/ONR modules from the runtime path (event router, startup, command registry), then delete the now-unreachable modules, then strip Netrunner content from the surviving command/config shells. Game-agnostic infrastructure (Discord client setup, fuzzy search, embed plumbing, glossary/rules api shape, alias module, server whitelist, database) is preserved. The bot is **allowed to be non-functional between strip and build** — there is no public Imperial Library deployment yet, and Sahasrara still serves Netrunner from its own deployment.

**Tech stack:** Node.js (ESM), discord.js v14, YAML, MySQL.

**Out of scope for this plan:** Building the Emerald Legacy module (api, embeds, slash commands, EmeraldDB integration). That is a separate plan written after this one lands and after the EmeraldDB schema is characterized.

**Reference:** Target user-facing surface is documented in `CLAUDE.md`. Upstream Netrunner state is preserved at git tag `netrunner-final`.

---

## File Structure

After this plan completes, `src/` looks like this:

```
src/
  Aliases/
    aliases.js          [moved from src/Netrunner/aliases.js]
  Commands/
    about.js            [body reset to migration placeholder]
    help.js             [body reset to migration placeholder]
    Superuser/
      whitelistServerAdd.js
      whitelistServerRemove.js
      whitelistServerRemoveAll.js
      whitelistServerView.js
  Database/
    database.js         [schema docs updated]
  Events/
    interactionCreate.js
    messageCreate.js    [inline-trigger body removed]
    ready.js
  Glossary/
    api.js              [comments sanitized; init wiring removed]
    embed.js            [comments sanitized]
  Permissions/
    serverWhitelist.js
  Rules/
    api.js              [comments sanitized; init wiring removed]
    embed.js            [comments sanitized]
  Structures/
    client.js           [card-data init calls removed]
    commands.js         [Netrunner-specific imports removed]
    events.js
    handler.js
  Utility/
    env.js
    error.js
    fuzzySearch.js
    random.js
    text.js
    time.js
```

Deleted: `src/Netrunner/`, `src/ONR/`, `src/Commands/Netrunner/`, `src/Commands/Rules/`, `src/Commands/mark.js`, `src/Commands/side.js`, `src/Commands/basicActions.js`, `src/Commands/glossary.js`, `src/Commands/Superuser/aliasAdd.js`, `src/Commands/Superuser/aliasRemove.js`, `src/Commands/Superuser/aliasView.js`, `resources/CardData/*`.

---

## Verification approach

This codebase has no test framework. Verification is via:

1. **`node --check <file>`** — syntax check for every JS file under `src/`.
2. **Import resolution probe** — `node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"`. This loads the import graph from the top-level client without running `start()`. If any import path resolves to a deleted file, this fails loudly.

Run both at the end of every task that deletes or moves a file.

---

## Task 1: Move alias module to a neutral location

`src/Netrunner/aliases.js` is game-agnostic (it manages a YAML file of string→cardName mappings) and is worth preserving for the build phase. Move it out of `src/Netrunner/` so the rest of that directory can be deleted later without losing this code.

**Files:**
- Move: `src/Netrunner/aliases.js` → `src/Aliases/aliases.js`

- [ ] **Step 1: Move the file**

```bash
mkdir -p src/Aliases
git mv src/Netrunner/aliases.js src/Aliases/aliases.js
```

- [ ] **Step 2: Verify the file's internal imports still resolve**

`aliases.js` imports `../Utility/text.js` and `../Utility/random.js`. From `src/Aliases/`, those paths are still `../Utility/text.js` and `../Utility/random.js` (same depth). No edits needed inside the moved file.

Verify:

```bash
node --check src/Aliases/aliases.js
```

Expected: exits 0, no output.

- [ ] **Step 3: Note the consumers that will break**

Three files currently `import` from `../Netrunner/aliases.js` or `./../Netrunner/aliases.js`:

- `src/Events/messageCreate.js` — fixed in Task 2 (the entire import is going away).
- `src/Commands/Superuser/aliasAdd.js` — deleted in Task 6.
- `src/Commands/Superuser/aliasRemove.js` — deleted in Task 6.
- `src/Commands/Superuser/aliasView.js` — deleted in Task 6.

No edits to consumers needed in this task; they're handled in their respective tasks.

- [ ] **Step 4: Commit**

```bash
git add src/Aliases/aliases.js
git rm src/Netrunner/aliases.js  # already staged by git mv; this is a no-op confirmation
git commit -m "Moved alias module out of Netrunner namespace"
```

---

## Task 2: Disconnect Netrunner/ONR from the message router

`src/Events/messageCreate.js` is the inline-trigger entrypoint. It imports from `Netrunner/`, `ONR/`, and `Database/`, and parses `[[`/`{{`/`<<`/`((`/`[|`/`{|`/`<|` triggers against those modules. Strip the body so the module exports only the early-return guards (whitelist, DM check). Inline-trigger parsing is rebuilt in the EL build phase.

**Files:**
- Modify: `src/Events/messageCreate.js`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/Events/messageCreate.js` with:

```javascript
/**
 * A module for responding to messages sent in servers containing this bot.
 *
 * @file   This files defines the message-response module.
 */

///////////////////////////////////////////////////////////////////////////////

import { readBool } from "../Utility/env.js";
import * as wl from "../Permissions/serverWhitelist.js";

///////////////////////////////////////////////////////////////////////////////

export default async function execute(message) {
  const { author, content } = message;

  // Ignore bot/empty messages
  if (author.bot || !content) {
    return;
  }

  // If the whitelist is active, and we're in a server, check the server is whitelisted
  if (
    message.guildId &&
    readBool("WHITELIST_SERVERS") &&
    !wl.isServerWhitelisted(message.guildId)
  ) {
    return;
  }

  // If the message was posted in a DM, check DMs are enabled
  if (!message.guildId && !readBool("ALLOW_DIRECT_MESSAGES")) {
    return;
  }

  // Inline trigger parsing is rebuilt in the Emerald Legacy build phase.
  // The build phase will replace this comment with EL card lookup wired via
  // src/Aliases/aliases.js and src/EmeraldLegacy/api.js.
}
```

- [ ] **Step 2: Verify**

```bash
node --check src/Events/messageCreate.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/Events/messageCreate.js
git commit -m "Disconnected message router from Netrunner/ONR modules"
```

---

## Task 3: Disconnect card-data init calls from startup

`src/Structures/client.js` calls `initNetrunner()`, `initONR()`, `initRules()`, `initGlossary()` during startup. All four reach for game-specific URLs. Remove the imports and the calls so the bot can start without card data. Database init and whitelist load stay (they're game-agnostic and harmless when unused).

**Files:**
- Modify: `src/Structures/client.js`

- [ ] **Step 1: Remove the four init imports**

Edit `src/Structures/client.js`. Delete these lines:

```javascript
import { init as initNetrunner } from "../Netrunner/api.js";
import { init as initONR } from "../ONR/api.js";
import { init as initRules } from "../Rules/api.js";
import { init as initGlossary } from "../Glossary/api.js";
```

- [ ] **Step 2: Remove the four init calls**

In the same file, delete this block from `start()`:

```javascript
  // Initialise card data so it can be accessed by commands on initialisation
  console.log("initialising nrdb api...");
  await initNetrunner();
  console.log("initialising onr api...");
  await initONR();

  // Initialise comprehensive rules data
  console.log("initialising rules api...");
  await initRules();

  // Initialise glossary data
  console.log("initialising glossary api...");
  await initGlossary();
```

The build phase will re-add `initEmeraldLegacy()`, `initRules()`, and `initGlossary()` with EmeraldDB-shaped implementations.

- [ ] **Step 3: Verify**

```bash
node --check src/Structures/client.js
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/Structures/client.js
git commit -m "Removed Netrunner/ONR/Rules/Glossary init from startup"
```

---

## Task 4: Slim down the command registry

`src/Structures/commands.js` imports and registers 20 commands. After this task, 5 remain: `Help`, `About`, and 3 whitelist superuser commands (`WhitelistAddServer`, `WhitelistRemoveServer`, `WhitelistViewServers`). Everything else is deleted in Task 6 — but its imports must come out of `commands.js` first, otherwise the deletion in Task 6 leaves the registry pointing at missing files.

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

import WhitelistAddServer from "../Commands/Superuser/whitelistServerAdd.js";
import WhitelistRemoveServer from "../Commands/Superuser/whitelistServerRemove.js";
import WhitelistViewServers from "../Commands/Superuser/whitelistServerView.js";

///////////////////////////////////////////////////////////////////////////////

export async function init(client) {
  const commands = [
    Help,
    About,

    WhitelistAddServer,
    WhitelistRemoveServer,
    WhitelistViewServers,
  ];

  commands.forEach((command) => {
    client.commands.set(command.data.name, command);
  });
}
```

Note: `whitelistServerRemoveAll.js` exists in the repo but was not registered in the original `commands.js`. Preserving that pre-existing behavior — the strip phase is not the place to silently fix unrelated registration gaps. Address separately if desired.

- [ ] **Step 2: Verify**

```bash
node --check src/Structures/commands.js
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/Structures/commands.js
git commit -m "Slimmed command registry to keep only About, Help, and whitelist superuser commands"
```

---

## Task 5: Reset `/about` and `/help` bodies to migration placeholders

These two commands stay registered through the migration so the bot can answer `/about` and `/help` with a clear "we're rebuilding" message. Their current bodies reference Netrunner concepts (faction colors, inline-trigger docs that mention `((card))` legality, "Sahasrara" branding, `https://sahasra.run/`).

**Files:**
- Modify: `src/Commands/about.js`
- Modify: `src/Commands/help.js`

- [ ] **Step 1: Rewrite `src/Commands/about.js`**

Overwrite with:

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
  const message = `**Imperial Library** is a card-fetching Discord bot for [Legend of the Five Rings — Emerald Legacy](https://emeralddb.org/).\n\nThe bot is currently mid-migration from its Netrunner-fetching predecessor (Sahasrara). Card lookup will return once the Emerald Legacy build phase lands.`;

  const embed = new EmbedBuilder()
    .setTitle(":information_source: About Imperial Library")
    .setDescription(message)
    .setColor(+process.env.COLOR_INFO);

  await interaction.reply({ embeds: [embed] });
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute };
```

- [ ] **Step 2: Rewrite `src/Commands/help.js`**

The original `help.js` has a hardcoded inline-trigger primer that references `((card))` (dropped) and `[|card|]` (dropped — ONR-specific). Strip the hardcoded section; keep the dynamic command list.

Overwrite with:

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
    descriptionText = `A Discord bot for Legend of the Five Rings — Emerald Legacy.\n\n_Card lookup is currently being rebuilt; only meta commands are available right now._\n\n**Commands**`;

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

- [ ] **Step 3: Verify**

```bash
node --check src/Commands/about.js
node --check src/Commands/help.js
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/Commands/about.js src/Commands/help.js
git commit -m "Reset /about and /help bodies to Imperial Library migration placeholders"
```

---

## Task 6: Delete Netrunner-specific source modules and commands

With the runtime path disconnected (Tasks 2-4) and `/about`/`/help` reset (Task 5), it's safe to delete the now-unreachable Netrunner code.

**Files:**
- Delete: `src/Netrunner/` (entire directory; `aliases.js` was already moved out in Task 1)
- Delete: `src/ONR/`
- Delete: `src/Commands/mark.js`, `src/Commands/side.js`, `src/Commands/basicActions.js`, `src/Commands/glossary.js`
- Delete: `src/Commands/Netrunner/`
- Delete: `src/Commands/Rules/`
- Delete: `src/Commands/Superuser/aliasAdd.js`, `src/Commands/Superuser/aliasRemove.js`, `src/Commands/Superuser/aliasView.js`

- [ ] **Step 1: Confirm `src/Netrunner/aliases.js` was moved (not still present)**

```bash
test ! -f src/Netrunner/aliases.js && echo "OK: moved"
```

Expected: prints `OK: moved`. If not, return to Task 1.

- [ ] **Step 2: Delete the directories and files**

```bash
git rm -r src/Netrunner src/ONR src/Commands/Netrunner src/Commands/Rules
git rm src/Commands/mark.js src/Commands/side.js src/Commands/basicActions.js src/Commands/glossary.js
git rm src/Commands/Superuser/aliasAdd.js src/Commands/Superuser/aliasRemove.js src/Commands/Superuser/aliasView.js
```

- [ ] **Step 3: Run syntax check on every remaining JS file**

```bash
find src -name "*.js" -print0 | xargs -0 -n1 node --check
```

Expected: no output, exit 0. Any file printing an error means a stale import survived.

- [ ] **Step 4: Run import resolution probe**

```bash
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1); })"
```

Expected: prints `OK`. A failure here means some still-present file imports a now-deleted module.

- [ ] **Step 5: Commit**

```bash
git commit -m "Deleted Netrunner and ONR source modules and Netrunner-specific commands"
```

---

## Task 7: Sanitize comments in `Glossary/` and `Rules/` modules

`src/Glossary/api.js`, `src/Glossary/embed.js`, `src/Rules/api.js`, `src/Rules/embed.js` have generic, reusable code, but their JSDoc comments mention "Netrunner" and "NetrunnerDB". The build phase will re-wire these to EmeraldDB. Strip the Netrunner-specific phrasing now so the comments don't lie about what the code does.

**Files:**
- Modify: `src/Glossary/api.js`
- Modify: `src/Glossary/embed.js`
- Modify: `src/Rules/api.js`
- Modify: `src/Rules/embed.js`

- [ ] **Step 1: Sanitize `src/Glossary/api.js`**

Apply these specific edits:

Find:
```
 * A module for fetching data from the Netrunner Glossary API.
```
Replace with:
```
 * A module for fetching data from the Glossary API (game-agnostic).
```

Find:
```
 * An object to store all card data used throughout the bot's lifetime.
 * @type {[GlossaryEntry]}
 */
const DATA = {};

/**
 * Initialises the api.
 *
 * This function should be called exactly once (at startup) to initialise data
 * from the glossary.
 */
```
Replace with:
```
 * An object to store all glossary data used throughout the bot's lifetime.
 * @type {[GlossaryEntry]}
 */
const DATA = {};

/**
 * Initialises the api.
 *
 * This function should be called exactly once (at startup) to initialise
 * data from the glossary.
 */
```

- [ ] **Step 2: Sanitize `src/Rules/api.js`**

Find:
```
 * A module for fetching data from the NetrunnerDB v3 API.
 *
 * @file   This files defines the Netrunner/api module.
```
Replace with:
```
 * A module for fetching the comprehensive rules document.
 *
 * @file   This files defines the Rules/api module.
```

Find:
```
 * An object to store all card data used throughout the bot's lifetime.
 * @type {[Rule]}
 */
const DATA = {};

/**
 * Initialises the api.
 *
 * This function should be called exactly once (at startup) to initialise data
 * from NetrunnerDB and any local data from resources.
 */
```
Replace with:
```
 * An object to store all rules data used throughout the bot's lifetime.
 * @type {[Rule]}
 */
const DATA = {};

/**
 * Initialises the api.
 *
 * This function should be called exactly once (at startup) to initialise
 * the rules data.
 */
```

- [ ] **Step 3: Skim `src/Glossary/embed.js` and `src/Rules/embed.js` for Netrunner references**

```bash
grep -n -i "netrunner\|nrdb\|nullsignal" src/Glossary/embed.js src/Rules/embed.js
```

If matches appear, edit them to neutral phrasing. If none, this step is a no-op.

- [ ] **Step 4: Verify**

```bash
node --check src/Glossary/api.js src/Glossary/embed.js src/Rules/api.js src/Rules/embed.js
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/Glossary/api.js src/Glossary/embed.js src/Rules/api.js src/Rules/embed.js
git commit -m "Sanitized Netrunner references from Glossary and Rules module comments"
```

---

## Task 8: Strip Netrunner-specific env vars from `.env.example`

Remove the Netrunner-specific config block from `.env.example`. Keep only the keys whose consumers still exist after the strip. New EL-shaped keys (clan colors, ring/clan emojis, EmeraldDB URLs) get added by the build phase as their consumers are written, not preemptively.

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace `.env.example` contents**

Overwrite with:

```bash
# BOT
TOKEN=YOUR.BOT.TOKEN.HERE
BOT_ID=YOUR.BOT.ID.HERE
GUILD_ID=YOUR.GUILD.ID.HERE # (optional)
SUPER_USER=YOUR.USER.ID.HERE
STATUS=custom status here

# ACCESS RESTRICTION
ALLOW_DIRECT_MESSAGES=0 # If users can use the bot in DMs
WHITELIST_SERVERS=1 # If servers must be whitelisted by the superuser for users there to use the bot

# COMMANDS
RESULT_LIMIT=5 # Max number of card results per message
MAX_QUERY_LENGTH=30 # Max length an inline query can be before it is ignored

# DATABASE
DB_HOST=localhost
DB_USER=username
DB_PASSWORD=password

# COLORS
COLOR_POSITIVE=0x57F287
COLOR_NEUTRAL=0xfee65c
COLOR_NEGATIVE=0xed4245

COLOR_INFO=0x1abc9c
COLOR_ERROR=0x992e22
```

Removed:

- `API_URL`, `NRDB_URL`, `ONR_URL`, `RULES_URL`, `SEARCH_URL`, `GLOSSARY_URL` — all Netrunner data sources.
- `COLOR_RUNNER`, `COLOR_CORP`, faction colors (anarch, criminal, shaper, hb, jinteki, nbn, weyland), neutral runner/corp, adam, apex, sunny, HQ/RND/Archives, ONR rarities, glossary type colors — Netrunner-specific.
- All Netrunner emoji vars (`EMOJI_CLICK`, `EMOJI_CREDIT`, `EMOJI_INTERRUPT`, `EMOJI_LINK`, `EMOJI_MU`, `EMOJI_NETRUNNER`, `EMOJI_RECURRING_CREDIT`, `EMOJI_SUBROUTINE`, `EMOJI_TRASH_*`, faction emojis, ONR emojis).
- All `IMAGE_*` vars (faction icons, basic actions images).

The kept generic colors (`COLOR_POSITIVE`, `COLOR_NEUTRAL`, `COLOR_NEGATIVE`, `COLOR_INFO`, `COLOR_ERROR`) are still consumed by `src/Commands/about.js`, `src/Commands/help.js`, and the whitelist superuser commands.

- [ ] **Step 2: Sanity-check that the kept env vars cover everything the surviving code reads**

```bash
grep -roh "process\.env\.[A-Z_]*" src | sort -u
```

Cross-check the output against `.env.example`. Any `process.env.FOO` referenced by surviving code that is not in `.env.example` is a gap. Fix gaps before committing — either re-add the var or remove the dead reference.

Expected references after the strip (approximately): `TOKEN`, `BOT_ID`, `GUILD_ID`, `SUPER_USER`, `STATUS`, `ALLOW_DIRECT_MESSAGES`, `WHITELIST_SERVERS`, `RESULT_LIMIT`, `MAX_QUERY_LENGTH`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `COLOR_INFO`, `COLOR_ERROR`. (`RESULT_LIMIT` and `MAX_QUERY_LENGTH` will be unused until inline triggers return in the build phase, but keep them — they're cheap and signal the intended config surface.)

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "Stripped Netrunner-specific env vars from .env.example"
```

---

## Task 9: Delete Netrunner card-data resources

`resources/CardData/` holds local JSON overrides for Netrunner cards/printings/sets/cycles, following the NetrunnerDB v3 schema. None of it applies to Emerald Legacy.

**Files:**
- Delete: contents of `resources/CardData/`

- [ ] **Step 1: Confirm what's there**

```bash
find resources/CardData -type f
```

Expected: a list of JSON files under `Cards/`, `Printings/`, `CardSets/`, `CardCycles/`. If empty, this task is a no-op — skip to step 3.

- [ ] **Step 2: Delete the contents**

```bash
git rm -r resources/CardData
```

The build phase will re-create `resources/CardData/` (or its EL-shaped equivalent) when the local-overrides feature is rewired against EmeraldDB.

- [ ] **Step 3: Confirm `resources/aliases.yml` is empty**

```bash
cat resources/aliases.yml
```

Expected: `aliases: {}`. If it has Netrunner aliases instead, replace its contents with `aliases: {}\n`.

- [ ] **Step 4: Commit**

```bash
git commit -m "Deleted Netrunner card-data resources"
```

---

## Task 10: Update database schema documentation

`src/Database/database.js` documents a schema with an `IsONR` column and four `QueryType` values (text, image, flavour, legality). After the strip, ONR is gone and legality lookup is gone (it folds into the main card embed in the build phase). Update the schema comment, the `logQuery` function, and the calling convention.

Note: this updates the *documented* schema and the *function signature*. Any actual deployed MySQL instance would need an `ALTER TABLE` migration; per CLAUDE.md, there is no public Imperial Library deployment yet, so no live migration is needed. Record the intent in a comment.

**Files:**
- Modify: `src/Database/database.js`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/Database/database.js` with:

```javascript
/**
 * A module for handling local database storage.
 *
 * @file   This files defines the Database/database module.
 */

///////////////////////////////////////////////////////////////////////////////

import mysql from "mysql";
import { logError } from "../Utility/error.js";

///////////////////////////////////////////////////////////////////////////////

let DB; // Persistent database connection

/**
 * Database schema:
 *
 * QueryType [0: text, 1: image, 2: flavour]
 *
  CREATE TABLE Query (
    ID INT NOT NULL AUTO_INCREMENT,
    Query VARCHAR(255) NOT NULL,
    CardId VARCHAR(60) NOT NULL,
    PrintingId VARCHAR(8) NOT NULL,
    ChannelType BIT(5) NOT NULL,
    QueryType BIT(2) NOT NULL,
    Timestamp DATETIME NOT NULL,
    PRIMARY KEY (ID)
  );
 *
 * Migration note: prior schema had an IsONR BIT(1) column and a QueryType=3
 * legality value. Both are dropped post-Netrunner. Any deployed instance of
 * the prior schema must run:
 *   ALTER TABLE Query DROP COLUMN IsONR;
 *   DELETE FROM Query WHERE QueryType = 3;
 * Imperial Library has no deployed instance at the time of this migration,
 * so no live ALTER is needed — this note is for future reference only.
 */

export async function init() {
  if (!process.env.DB_HOST || !process.env.DB_USER) {
    logError("Database data not defined. Skipping.");
    return;
  }

  DB = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  DB.connect(function (err) {
    if (err) {
      logError(err);
      console.error("There was an error loading the database. Database functionality has been disabled.\n");
      DB = null; // Ensure future attempts to use the database aren't attempted
    }
  });
}

/**
 * Saves a user's card query to the database.
 *
 * @param {string} query The raw query submitted.
 * @param {string} cardId The card ID of the fetched card.
 * @param {string} printingId The printing ID of the fetched card.
 * @param {number} channelType A flag representing the type of channel the request was sent from.
 * @param {number} queryType A flag representing if the request was for text (0), image (1), or flavour (2).
 */
export function logQuery(
  query,
  cardId,
  printingId,
  channelType,
  queryType
) {
  // Exit early if the database was not loaded on startup
  if (!DB) {
    return;
  }

  // Create the SQL command
  const sql = "INSERT INTO Query SET ?";
  const values = {
    Query: query.substring(0, 255),
    CardId: cardId.substring(0, 60),
    PrintingId: printingId.substring(0, 8),
    ChannelType: channelType,
    QueryType: queryType,
    Timestamp: new Date(),
  };
  DB.query(sql, values, function (err, result) {
    if (err) {
      logError(err);
    }
  });
}
```

- [ ] **Step 2: Verify**

```bash
node --check src/Database/database.js
```

Expected: exits 0.

- [ ] **Step 3: Verify there are no callers passing the old 6-arg signature**

```bash
grep -rn "logQuery(" src
```

Expected: no matches. The only callers were in `src/Events/messageCreate.js` (the inline-trigger parsers for Netrunner and ONR), which were stripped in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/Database/database.js
git commit -m "Updated database schema docs to drop IsONR and legality query type"
```

---

## Task 11: Final verification and migration-status doc update

Confirm the strip is complete and update CLAUDE.md to reflect that the strip phase is done.

- [ ] **Step 1: Run syntax check on every remaining JS file**

```bash
find src -name "*.js" -print0 | xargs -0 -n1 node --check
```

Expected: no output, exit 0.

- [ ] **Step 2: Run import resolution probe**

```bash
node -e "import('./src/Structures/client.js').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1); })"
```

Expected: prints `OK`.

- [ ] **Step 3: Verify no surviving file imports a deleted path**

```bash
grep -rn "from \".*Netrunner" src && echo "FAIL" || echo "OK: no Netrunner imports"
grep -rn "from \".*ONR" src && echo "FAIL" || echo "OK: no ONR imports"
```

Expected: prints `OK: no Netrunner imports` and `OK: no ONR imports`.

- [ ] **Step 4: Verify the kept directory tree matches the File Structure section of this plan**

```bash
find src -type f -name "*.js" | sort
```

Cross-reference against the File Structure section at the top of this plan. Any extras = something this plan didn't account for; investigate.

- [ ] **Step 5: Update `CLAUDE.md` migration-status section**

Edit the "Migration status" section in `CLAUDE.md`. Specifically, update the migration-plan list to mark step 2 (strip) complete and reflect that step 3 (build) is now the active phase. Suggested replacement for the three-step plan:

```markdown
The repo is mid-migration from Netrunner to Emerald Legacy. The plan is **strip-then-build**:

1. **Done.** Tagged `netrunner-final` — last commit reflecting the Netrunner-era project.
2. **Done.** Stripped Netrunner/ONR code, content, and config (see `docs/superpowers/plans/2026-04-27-strip-netrunner.md`).
3. **In progress.** Build the Emerald Legacy module against EmeraldDB on the leftover scaffolding.

Until step 3 lands, the bot answers `/about` and `/help` with migration-status placeholders and does not respond to inline triggers. Card lookup returns when EL is wired in.
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "Marked strip phase complete in migration status"
```

---

## What comes after this plan

The Emerald Legacy build phase is a separate plan, written after this one is merged. The first task of that plan is **EmeraldDB API characterization** — fetch the API, document the schema (cards, sets, formats, rules, glossary, possibly cycles), and decide concretely what `/view_cycle` does (or whether to drop it). Without that characterization, build-phase task code would be guesswork.

The build plan covers, at minimum:

- Create `src/EmeraldLegacy/` with `api.js`, `embed.js`, `discord.js` mirroring the shape of the deleted `src/Netrunner/` modules.
- Rewire `src/Events/messageCreate.js` for `[[card]]`, `{{card}}`, `<<card>>` against EmeraldDB.
- Re-add `src/Commands/basicActions.js`, `src/Commands/glossary.js`, `src/Commands/Netrunner/search.js`, `random.js`, `setView.js`, `formatView.js`, `src/Commands/Rules/getRule.js`, `searchRules.js` — under their EL-flavoured locations.
- Re-add the alias superuser commands wired to the new `src/Aliases/aliases.js` and the EL card-fetch.
- Repopulate `.env.example` with EL-specific URLs, clan colors, and ring/clan emojis as their consumers are written.
- Update `README.md` to remove the "migration in progress" banner and add the public-instance "Add App" affordance once a hosted instance exists.
