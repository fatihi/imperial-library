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
