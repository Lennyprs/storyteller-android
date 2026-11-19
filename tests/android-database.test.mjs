import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { STORYTELLER_SCHEMA } from '../src/renderer/src/platform/androidDatabase.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('../node_modules/.pnpm/jeep-sqlite@2.8.0/node_modules/sql.js');
const SQL = await initSqlJs();
function openMemoryDb() {
  const db = new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
function one(db, sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const row = statement.step() ? statement.getAsObject() : null;
  statement.free();
  return row;
}

test('Android schema creates every persisted Storyteller data table', () => {
  const db = openMemoryDb();
  db.exec(STORYTELLER_SCHEMA);
  const tables = [];
  const statement = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  while (statement.step()) tables.push(statement.getAsObject().name);
  statement.free();
  for (const table of ['books', 'series', 'book_series', 'chapters', 'scenes', 'characters', 'character_relationships', 'worlds', 'locations', 'objects', 'workspace_state']) {
    assert.ok(tables.includes(table), `missing ${table}`);
  }
  db.close();
});

test('Android schema retains cascade and set-null relationships', () => {
  const db = openMemoryDb();
  db.exec(STORYTELLER_SCHEMA);
  const now = Date.now();
  db.run('INSERT INTO books(name, author, created_at, updated_at) VALUES (?, ?, ?, ?)', ['Book', 'Author', now, now]);
  const bookId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  db.run('INSERT INTO worlds(book_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [bookId, 'World', now, now]);
  const worldId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  db.run('INSERT INTO locations(book_id, world_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [bookId, worldId, 'Place', now, now]);
  const locationId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  db.run('DELETE FROM worlds WHERE id = ?', [worldId]);
  assert.equal(one(db, 'SELECT world_id AS worldId FROM locations WHERE id = ?', [locationId]).worldId, null);
  db.run('DELETE FROM books WHERE id = ?', [bookId]);
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM locations').n, 0);
  db.close();
});
