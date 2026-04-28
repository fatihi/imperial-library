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
    case "crab":         return 0x163078;
    case "crane":        return 0x44c2bc;
    case "dragon":       return 0x1d6922;
    case "lion":         return 0xdece23;
    case "mantis":       return 0x2c8369;
    case "phoenix":      return 0xde9923;
    case "scorpion":     return 0xab1916;
    case "unicorn":      return 0x90119e;
    case "neutral":      return 0xb1b1b1;
    case "shadowlands":  return 0x000000;
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
