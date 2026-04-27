/**
 * A module for fetching data from the Netrunner Glossary API.
 *
 * @file   This files defines the Glossary API module.
 */

///////////////////////////////////////////////////////////////////////////////

import fs from "fs";
import { bestMatch } from "../Utility/fuzzySearch.js";

///////////////////////////////////////////////////////////////////////////////
// Init

/**
 * @typedef GlossaryEntry
 * @type {Object}
 * @property {string} label - The entry's name (used as an ID).
 * @property {string} type - The genre of the term.
 * @property {string} pseudonyms - Alternative labels for the entry.
 * @property {string} definition - The definition of the term.
 * @property {string} rulesReference - A string of rules references by number.
 */

/**
 * An object to store all card data used throughout the bot's lifetime.
 * @type {[GlossaryEntry]}
 */
const DATA = {};

/**
 * Initialises the api.
 *
 * This function should be called exactly once (at startup) to initialise data
 * from the glossary.
 */
export async function init() {
  let entries = await fetchGlossary();

  // Fix some of the formatting of the API
  entries = entries.filter((entry) => {
    entry.pseudonyms = entry.pseudonyms
      ? entry.pseudonyms.split(",").map((e) => e.trim().toLowerCase())
      : [];
    return entry;
  });

  // Store the glossary as a dictionary
  DATA.idToEntry = {};
  entries.forEach((entry) => {
    if (entry.label && entry.definition) {
      DATA.idToEntry[entry.label] = entry;
    }
  });
}

///////////////////////////////////////////////////////////////////////////////
// Glossary

/**
 * Gets the glossary entry with the given ID.
 *
 * @param {string} entryId A glossary entry's ID.
 * @return {GlossaryEntry} The corresponding glossary entry.
 */
export function getEntry(entryId) {
  return DATA.idToEntry[entryId];
}

/**
 * Gets all glossary entry labels.
 *
 * @return {[string]} Every entry label in the glossary.
 */
export function getAllEntryLabels() {
  return Object.keys(DATA.idToEntry);
}

///////////////////////////////////////////////////////////////////////////////
// API fetching

/**
 * Fetches all entries from the Glossary API
 *
 * @return {[GlossaryEntry]} All entries from the API.
 */
export async function fetchGlossary() {
  const json = await fetch(process.env.GLOSSARY_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Network response was not ok with url: ${url}`);
      }
      return response.json();
    })
    .catch((error) => {
      throw new Error("Failed to load data from API: " + error);
    });
  return json.data;
}
