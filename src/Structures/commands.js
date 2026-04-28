/**
 * The command module. This loads all the commands at startup.
 *
 * @file   This files defines the commands module for the bot.
 */

///////////////////////////////////////////////////////////////////////////////

import Help from "./../Commands/help.js";
import About from "./../Commands/about.js";

import AliasAdd from "./../Commands/Superuser/aliasAdd.js";
import AliasRemove from "./../Commands/Superuser/aliasRemove.js";
import AliasView from "./../Commands/Superuser/aliasView.js";

import WhitelistAddServer from "../Commands/Superuser/whitelistServerAdd.js";
import WhitelistRemoveServer from "../Commands/Superuser/whitelistServerRemove.js";
import WhitelistViewServers from "../Commands/Superuser/whitelistServerView.js";

///////////////////////////////////////////////////////////////////////////////

export async function init(client) {
  const commands = [
    Help,
    About,

    AliasAdd,
    AliasRemove,
    AliasView,

    WhitelistAddServer,
    WhitelistRemoveServer,
    WhitelistViewServers,
  ];

  commands.forEach((command) => {
    client.commands.set(command.data.name, command);
  });
}
