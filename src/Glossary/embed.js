/**
 * A module for building Netrunner-based Discord embeds.
 *
 * @file   This files defines the Netrunner/embed module.
 */

///////////////////////////////////////////////////////////////////////////////

import { EmbedBuilder } from "discord.js";
import { formatText } from "../Netrunner/discord.js";

///////////////////////////////////////////////////////////////////////////////

/**
 * @param {GlossaryEntry} entry A glossary entry.
 * @return {Object} A Discord embed displaying the entry.
 */
export function createGlossaryEmbed(entry) {
  const entryId = entry.label.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const definitionText = formatText(entry.definition.replaceAll(/\[([^\]]+?)\]\(#[^\)]+?\)/g, "__$1__"))
  const rulesText = entry.rulesReference ? `\n\nSee Comprehensive Rules entries ${
    entry.rulesReference.split(",").map((cr) => `[${cr}](https://rules.nullsignal.games/#:~:text=${cr}.)`).join(", ")
  }` : "";

  const embed = new EmbedBuilder()
    .setTitle(`:book: ${formatText(entry.label)}`)
    .setURL(`https://sahasra.run/glossary#${entryId}`)
    .setDescription(definitionText + rulesText)
    .setColor(typeToColor(entry.type))
    .setFooter({text: `Glossary category: ${entry.type}`});
  return embed;
}

/**
 * @param {string} type A glossary entry type.
 * @return {int} An RGB color code.
 */
function typeToColor(type) {
  const color = process.env[`COLOR_GLOSSARY_${type.trim().replaceAll(" ", "_")}`];
  return color ? +color : +process.env.COLOR_INFO; // Default to info color
}
