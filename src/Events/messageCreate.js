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
 *   [[card]]                 - full card view; multi-card names render the
 *                              newest variant with a footer hint listing the
 *                              other variants' name_extra.
 *   {{card}}                 - image only
 *   <<card>>                 - flavour only
 *   [[card 2]] / [[card (2)]] - pick a specific same-named variant by its
 *                              name_extra (parens optional). Resolved inside
 *                              getClosestCards — no special parsing here.
 *   [[card|n]]               - escape hatch when multiple same-name cards
 *                              have no name_extra to disambiguate them.
 *                              0 = newest, -1 = oldest.
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
