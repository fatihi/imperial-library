/**
 * The primary module for the bot. This should handle startup.
 *
 * @file   This files defines the top level module for the bot.
 */

///////////////////////////////////////////////////////////////////////////////

import {
  Client,
  GatewayIntentBits,
  Collection,
  ActivityType,
  Partials,
} from "discord.js";
import { init as initCommands } from "./commands.js";
import { init as initHandler } from "./handler.js";
import { init as initEvents } from "./events.js";
import { loadWhitelist } from "../Permissions/serverWhitelist.js";
import { init as initDatabase } from "../Database/database.js";
import { readBool } from "../Utility/env.js";

///////////////////////////////////////////////////////////////////////////////

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

///////////////////////////////////////////////////////////////////////////////

export async function start(config) {
  client.config = config;

  // Initialise database
  console.log("initialising database...");
  await initDatabase();

  // Set up whitelist
  if (readBool("WHITELIST_SERVERS")) {
    console.log("server whitelist is enabled; loading saved data...");
    loadWhitelist();
  }

  // Initialise bot features
  console.log("loading commands...");
  await initCommands(client);
  console.log("loading handler...");
  await initHandler(client);
  console.log("loading events...");
  await initEvents(client);

  // Start running the bot
  await client.login(process.env.TOKEN);

  // Set the bot status
  client.user.setPresence({
    activities: [{ name: process.env.STATUS ? process.env.STATUS : "/help for help", type: ActivityType.Custom }],
    status: "online",
  });
}
