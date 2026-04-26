/**
 * A command for fetching Netrunner glossary entries.
 *
 * @file   This files defines the glossary command module.
 * @since  1.0.0
 */

///////////////////////////////////////////////////////////////////////////////

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getEntry, getAllEntryLabels } from "../Glossary/api.js";
import { createGlossaryEmbed } from "../Glossary/embed.js";
import { normalise } from "../Utility/text.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("glossary")
  .setDescription("fetches Netrunner glossary entries")
  .addStringOption((option) =>
    option
      .setName("glossary_entry")
      .setDescription("the glossary entry to fetch")
      .setAutocomplete(true)
  );

const meta = {};

async function execute(interaction, client) {
  const label = interaction.options.getString("glossary_entry");
  const entry = getEntry(label);
  let embed;

  if (entry) {
    embed = createGlossaryEmbed(entry);
  } else {
    embed = new EmbedBuilder()
      .setTitle("Unknown Glossary Entry!")
      .setDescription(`"${label}" does not match any glossary entry.`)
      .setColor(+process.env.COLOR_ERROR);
  }

  await interaction.reply({ embeds: [embed] });
}

async function autocomplete(interaction, client) {
  const focusedValue = normalise(interaction.options.getFocused());
  const validChoices = getAllEntryLabels()
    .filter((label) => normalise(label).includes(focusedValue) || getEntry(label).pseudonyms.some((ps) => ps.includes(focusedValue)))
    .slice(0, 25)
    .map((label) => ({ name: label.replaceAll(/\{.+?\}/g, "").replaceAll("()", "").trim(), value: label }));
  await interaction.respond(validChoices);
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute, autocomplete };
