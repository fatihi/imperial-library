/**
 * A command for viewing a card's aliases.
 *
 * @file   This files defines the aliasView command module.
 */

///////////////////////////////////////////////////////////////////////////////

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { listAliases } from "../../Aliases/aliases.js";
import {
  getClosestCards,
  getAllNormalisedNames,
  denormaliseCardName,
} from "../../EmeraldLegacy/api.js";
import { factionToColor } from "../../EmeraldLegacy/discord.js";
import { normalise } from "../../Utility/text.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("alias_view")
  .setDescription("displays all aliases of a given card")
  .addStringOption((option) =>
    option
      .setName("card")
      .setDescription("the card to view")
      .setRequired(true)
      .setAutocomplete(true)
  );

const meta = {};

async function execute(interaction, client) {
  const cardName = interaction.options.getString("card");
  const cards = getClosestCards(cardName);
  const aliases = listAliases(cards.length > 0 ? cards[0].name : cardName);

  let embed;
  if (cards.length === 0) {
    embed = new EmbedBuilder()
      .setTitle("Card not found!")
      .setDescription(`\`${cardName}\` did not match any card.`)
      .setColor(+process.env.COLOR_ERROR);
  } else if (aliases.length > 0) {
    embed = new EmbedBuilder()
      .setColor(factionToColor(cards[0].faction))
      .setTitle("Aliases!")
      .setDescription(
        `Aliases for **${cards[0].name}**:\n- ${aliases.join("\n- ")}`
      );
  } else {
    embed = new EmbedBuilder()
      .setTitle("No aliases found!")
      .setDescription(`\`${cards[0].name}\` has no aliases.`)
      .setColor(+process.env.COLOR_ERROR);
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function autocomplete(interaction) {
  const focusedValue = normalise(interaction.options.getFocused());
  const validChoices = getAllNormalisedNames()
    .filter((n) => n.includes(focusedValue))
    .slice(0, 25)
    .map((n) => ({ name: denormaliseCardName(n), value: denormaliseCardName(n) }));
  await interaction.respond(validChoices);
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute, autocomplete };
