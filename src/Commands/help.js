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
    if (command && !command.meta.hideFromHelp) {
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
    descriptionText = `A Discord bot for [Legend of the Five Rings — Emerald Legacy](https://emeralddb.org/).\n\n**Looking up cards**\n\`[[card]]\` to view a card with stats, text, and current legality\n\`{{card}}\` to view its image only\n\`<<card>>\` to view its flavour text only\n\n**Disambiguating shared names**\nL5R has multiple distinct cards sharing a name (e.g. \`Tadaka\`, \`Hida Kisada\`). When this happens, \`[[card]]\` shows the most recent variant and the footer lists the others. To pick a specific variant, append its disambiguator: \`[[hida kisada 2]]\` or \`[[hida kisada (2)]]\` both resolve to \`Hida Kisada (2)\`.\n\n**Commands**`;

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
