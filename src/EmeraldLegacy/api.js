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

  // Build the bare-name index: a single name can map to multiple cards.
  DATA.cardsByNormalisedName = {};
  // Build the disambiguated-key index: name + stripped name_extra → single card.
  DATA.cardByDisambiguatedKey = {};
  cards.forEach((card) => {
    const bareKey = normalise(card.name);
    if (!DATA.cardsByNormalisedName[bareKey]) {
      DATA.cardsByNormalisedName[bareKey] = [];
    }
    DATA.cardsByNormalisedName[bareKey].push(card);

    const disKey = disambiguatedKey(card);
    if (disKey) DATA.cardByDisambiguatedKey[disKey] = card;
  });

  // Fuzzy-search pool: bare normalised names only (the disambiguator path
  // is exact-match, not fuzzy).
  const uniqueNames = Object.keys(DATA.cardsByNormalisedName);
  DATA.fuzzyPool = uniqueNames.map((n) => [n, n]);
}

/**
 * Computes the canonical disambiguated lookup key for a card. Returns
 * null if the card has no `name_extra`. The key has parens stripped and
 * whitespace collapsed so that both `[[hida kisada (2)]]` and
 * `[[hida kisada 2]]` resolve to the same card.
 *
 * @param {Object} card
 * @return {?string}
 */
function disambiguatedKey(card) {
  if (!card.name_extra) return null;
  const extra = stripDisambiguator(card.name_extra);
  if (!extra) return null;
  return `${normalise(card.name)} ${extra}`;
}

/**
 * Strips parens and collapses whitespace in a disambiguator string.
 * Used to canonicalise both stored `name_extra` values and user query
 * tails so they compare equal.
 *
 * @param {string} s
 * @return {string}
 */
function stripDisambiguator(s) {
  return normalise(s).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

///////////////////////////////////////////////////////////////////////////////
// Lookup

/**
 * Resolves a user query to one or more cards.
 *
 * Resolution order:
 *   1. Exact disambiguated match — e.g. `"hida kisada (2)"` or `"hida kisada 2"`
 *      both resolve to the single `Hida Kisada (2)` card. Returns `[card]`.
 *   2. Fuzzy bare-name match — returns *all* cards sharing the matched name,
 *      sorted with the most recently released first. The caller renders the
 *      top card and treats the rest as siblings.
 *
 * If no match is found, returns an empty array.
 *
 * @param {string} query A user query.
 * @return {CardWithVersions[]} Matching cards.
 */
export function getClosestCards(query) {
  const normalised = normalise(query);
  if (!normalised) return [];

  // 1. Exact disambiguated match (parens optional).
  const canonical = stripDisambiguator(normalised);
  const disHit = DATA.cardByDisambiguatedKey[canonical];
  if (disHit) return [disHit];

  // 2. Fuzzy on bare names.
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
