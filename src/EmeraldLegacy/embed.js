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
    const variants = siblings
      .filter((c) => c.name_extra)
      .map((c) => c.name_extra)
      .join(", ");
    const otherCount = siblings.length;
    const hint = variants
      ? `${otherCount} other card${otherCount === 1 ? "" : "s"} share this name (${variants}) — append the disambiguator, e.g. [[${card.name.toLowerCase()} 2]]`
      : `${otherCount} other card${otherCount === 1 ? "" : "s"} share this name`;
    parts.push(hint);
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
