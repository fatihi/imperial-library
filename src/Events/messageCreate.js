/**
 * A module for responding to messages sent in servers containing this bot.
 *
 * @file   This files defines the message-response module.
 */

///////////////////////////////////////////////////////////////////////////////

import { readBool } from "../Utility/env.js";
import * as wl from "../Permissions/serverWhitelist.js";

///////////////////////////////////////////////////////////////////////////////

export default async function execute(message) {
  const { author, content } = message;

  // Ignore bot/empty messages
  if (author.bot || !content) {
    return;
  }

  // If the whitelist is active, and we're in a server, check the server is whitelisted
  if (
    message.guildId &&
    readBool("WHITELIST_SERVERS") &&
    !wl.isServerWhitelisted(message.guildId)
  ) {
    return;
  }

  // If the message was posted in a DM, check DMs are enabled
  if (!message.guildId && !readBool("ALLOW_DIRECT_MESSAGES")) {
    return;
  }

  // Inline trigger parsing is rebuilt in the Emerald Legacy build phase.
  // The build phase will replace this comment with EL card lookup wired via
  // src/Aliases/aliases.js and src/EmeraldLegacy/api.js.
}
