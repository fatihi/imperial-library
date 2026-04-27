/**
 * A command for displaying info about Sahasrara
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
  let message = `This is a Discord bot for fetching Netrunner cards from Discord. Learn more on [my website](https://sahasra.run/)!\n\nWant more info on how to use this bot? Use the \`/help\` command!`;

  const embed = new EmbedBuilder()
    .setTitle(":information_source: About Sahasrara")
    .setURL("https://sahasra.run/")
    .setDescription(message)
    .setColor(+process.env.COLOR_INFO);

  await interaction.reply({ embeds: [embed] });
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute };
