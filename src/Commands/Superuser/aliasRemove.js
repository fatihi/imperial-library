/**
 * A superuser command for removing card aliases.
 *
 * @file   This files defines the aliasRemove command module.
 */

///////////////////////////////////////////////////////////////////////////////

import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { removeAlias, saveAliases } from "../../Aliases/aliases.js";

///////////////////////////////////////////////////////////////////////////////

const data = new SlashCommandBuilder()
  .setName("alias_remove")
  .setDescription("removes an alias")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName("alias")
      .setDescription("the alias to remove")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("card")
      .setDescription("if specified, only remove this card from the alias group")
  );

const meta = {
  hideFromHelp: true,
};

async function execute(interaction, client) {
  if (interaction.user.id != process.env.SUPER_USER) {
    const embed = new EmbedBuilder()
      .setTitle("Invalid permissions!")
      .setDescription(
        `You do not have permission to use this command, but you are seeing it because Discord does not allow any commands to be hidden from administrators.`
      )
      .setColor(+process.env.COLOR_ERROR);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const alias = interaction.options.getString("alias");
  const cardName = interaction.options.getString("card");
  const success = removeAlias(alias, cardName);

  let embed;
  if (success) {
    embed = new EmbedBuilder()
      .setTitle("Alias removed!")
      .setDescription(
        cardName
          ? `Removed \`${cardName}\` from alias \`${alias}\`.`
          : `Removed alias \`${alias}\`.`
      )
      .setColor(+process.env.COLOR_INFO);
    saveAliases();
  } else {
    embed = new EmbedBuilder()
      .setTitle("Alias not found!")
      .setDescription(
        cardName
          ? `\`${cardName}\` is not part of alias \`${alias}\`.`
          : `No alias \`${alias}\` exists.`
      )
      .setColor(+process.env.COLOR_ERROR);
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

///////////////////////////////////////////////////////////////////////////////

export default { data, meta, execute };
