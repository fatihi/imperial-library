/**
 * A module for handling local database storage.
 *
 * @file   This files defines the Database/database module.
 */

///////////////////////////////////////////////////////////////////////////////

import mysql from "mysql";
import { logError } from "../Utility/error.js";

///////////////////////////////////////////////////////////////////////////////

let DB; // Persistent database connection

/**
 * Database schema:
 *
 * QueryType [0: text, 1: image, 2: flavour]
 *
  CREATE TABLE Query (
    ID INT NOT NULL AUTO_INCREMENT,
    Query VARCHAR(255) NOT NULL,
    CardId VARCHAR(60) NOT NULL,
    PrintingId VARCHAR(8) NOT NULL,
    ChannelType BIT(5) NOT NULL,
    QueryType BIT(2) NOT NULL,
    Timestamp DATETIME NOT NULL,
    PRIMARY KEY (ID)
  );
 *
 * Migration note: prior schema had an IsONR BIT(1) column and a QueryType=3
 * legality value. Both are dropped post-Netrunner. Any deployed instance of
 * the prior schema must run:
 *   ALTER TABLE Query DROP COLUMN IsONR;
 *   DELETE FROM Query WHERE QueryType = 3;
 * Imperial Library has no deployed instance at the time of this migration,
 * so no live ALTER is needed — this note is for future reference only.
 */

export async function init() {
  if (!process.env.DB_HOST || !process.env.DB_USER) {
    logError("Database data not defined. Skipping.");
    return;
  }

  DB = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  DB.connect(function (err) {
    if (err) {
      logError(err);
      console.error("There was an error loading the database. Database functionality has been disabled.\n");
      DB = null; // Ensure future attempts to use the database aren't attempted
    }
  });
}

/**
 * Saves a user's card query to the database.
 *
 * @param {string} query The raw query submitted.
 * @param {string} cardId The card ID of the fetched card.
 * @param {string} printingId The printing ID of the fetched card.
 * @param {number} channelType A flag representing the type of channel the request was sent from.
 * @param {number} queryType A flag representing if the request was for text (0), image (1), or flavour (2).
 */
export function logQuery(
  query,
  cardId,
  printingId,
  channelType,
  queryType
) {
  // Exit early if the database was not loaded on startup
  if (!DB) {
    return;
  }

  // Create the SQL command
  const sql = "INSERT INTO Query SET ?";
  const values = {
    Query: query.substring(0, 255),
    CardId: cardId.substring(0, 60),
    PrintingId: printingId.substring(0, 8),
    ChannelType: channelType,
    QueryType: queryType,
    Timestamp: new Date(),
  };
  DB.query(sql, values, function (err, result) {
    if (err) {
      logError(err);
    }
  });
}
