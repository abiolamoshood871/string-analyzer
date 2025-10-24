const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
app.use(bodyParser.json());

// --------------------
// SQLite setup
// --------------------
const db = new Database("strings.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS strings (
    id TEXT PRIMARY KEY,
    value TEXT,
    length INTEGER,
    is_palindrome INTEGER,
    unique_characters INTEGER,
    word_count INTEGER,
    sha256_hash TEXT,
    character_frequency_map TEXT,
    created_at TEXT
  )
`).run();

// --------------------
// POST /strings — add new string
// --------------------
app.post("/strings", (req, res) => {
  const { value } = req.body;
  if (!value) return res.status(400).json({ error: "Value is required" });

  const id = crypto.createHash("sha256").update(value).digest("hex");

  // Check if string already exists
  const exists = db.prepare("SELECT * FROM strings WHERE id = ?").get(id);
  if (exists) return res.status(409).json({ error: "String already exists" });

  const is_palindrome = value === value.split("").reverse().join("");
  const length = value.length;
  const unique_characters = new Set(value).size;
  const word_count = value.trim().split(/\s+/).length;

  const character_frequency_map = {};
  for (const char of value) character_frequency_map[char] = (character_frequency_map[char] || 0) + 1;

  const created_at = new Date().toISOString();

  // Insert into SQLite
  db.prepare(`
    INSERT INTO strings (id, value, length, is_palindrome, unique_characters, word_count, sha256_hash, character_frequency_map, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    value,
    length,
    is_palindrome ? 1 : 0,
    unique_characters,
    word_count,
    id,
    JSON.stringify(character_frequency_map),
    created_at
  );

  return res.status(201).json({
    id,
    value,
    properties: {
      length,
      is_palindrome,
      unique_characters,
      word_count,
      sha256_hash: id,
      character_frequency_map
    },
    created_at
  });
});

// --------------------
// GET /strings — get all strings with filters
// --------------------
app.get("/strings", (req, res) => {
  const { is_palindrome, min_length, max_length, word_count, contains_character } = req.query;

  let allStrings = db.prepare("SELECT * FROM strings").all().map(row => ({
    id: row.id,
    value: row.value,
    properties: {
      length: row.length,
      is_palindrome: !!row.is_palindrome,
      unique_characters: row.unique_characters,
      word_count: row.word_count,
      sha256_hash: row.sha256_hash,
      character_frequency_map: JSON.parse(row.character_frequency_map)
    },
    created_at: row.created_at
  }));

  if (is_palindrome !== undefined) {
    const boolVal = is_palindrome === "true";
    allStrings = allStrings.filter(item => item.properties.is_palindrome === boolVal);
  }
  if (min_length) allStrings = allStrings.filter(item => item.properties.length >= Number(min_length));
  if (max_length) allStrings = allStrings.filter(item => item.properties.length <= Number(max_length));
  if (word_count) allStrings = allStrings.filter(item => item.properties.word_count === Number(word_count));
  if (contains_character) allStrings = allStrings.filter(item => item.value.includes(contains_character));

  return res.json({
    data: allStrings,
    count: allStrings.length,
    filters_applied: { is_palindrome, min_length, max_length, word_count, contains_character }
  });
});

// --------------------
// GET /strings/filter-by-natural-language
// --------------------
app.get("/strings/filter-by-natural-language", (req, res) => {
  const { query } = req.query;

  if (!query) return res.status(400).json({ error: "Missing query parameter" });

  const lower = query.toLowerCase();
  const filters = {};

  // Simple parsing rules
  if (lower.includes("palindromic")) filters.is_palindrome = true;
  if (lower.includes("single word")) filters.word_count = 1;

  const longerMatch = lower.match(/longer than (\d+)/);
  if (longerMatch) filters.min_length = Number(longerMatch[1]) + 1;

  const letterMatch = lower.match(/letter (\w)/);
  if (letterMatch) filters.contains_character = letterMatch[1];

  // Apply filters
  let allStrings = db.prepare("SELECT * FROM strings").all().map(row => ({
    id: row.id,
    value: row.value,
    properties: {
      length: row.length,
      is_palindrome: !!row.is_palindrome,
      unique_characters: row.unique_characters,
      word_count: row.word_count,
      sha256_hash: row.sha256_hash,
      character_frequency_map: JSON.parse(row.character_frequency_map)
    },
    created_at: row.created_at
  }));

  if (filters.is_palindrome !== undefined) {
    allStrings = allStrings.filter(item => item.properties.is_palindrome === filters.is_palindrome);
  }
  if (filters.word_count) {
    allStrings = allStrings.filter(item => item.properties.word_count === filters.word_count);
  }
  if (filters.min_length) {
    allStrings = allStrings.filter(item => item.properties.length >= filters.min_length);
  }
  if (filters.contains_character) {
    allStrings = allStrings.filter(item => item.value.includes(filters.contains_character));
  }

  return res.json({
    data: allStrings,
    count: allStrings.length,
    interpreted_query: {
      original: query,
      parsed_filters: filters
    }
  });
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
