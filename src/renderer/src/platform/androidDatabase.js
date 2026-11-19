import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DATABASE_NAME = 'storyteller';
const DATABASE_VERSION = 1;
let connectionPromise;

export const STORYTELLER_SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, author TEXT NOT NULL, description TEXT, image TEXT, progress_status TEXT NOT NULL DEFAULT 'not_started', genres TEXT NOT NULL DEFAULT '[]', target_audience TEXT DEFAULT 'general', primary_language TEXT DEFAULT 'en', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS series (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS book_series (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, series_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE, FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS book_series_idx ON book_series(book_id, series_id);
CREATE TABLE IF NOT EXISTS characters (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '', gender TEXT, role TEXT NOT NULL DEFAULT 'supporting', avatar TEXT, description TEXT, attributes TEXT NOT NULL DEFAULT '{}', groups TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS character_relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, character_id INTEGER NOT NULL, related_character_id INTEGER NOT NULL, relationship_type TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE, FOREIGN KEY(related_character_id) REFERENCES characters(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS worlds (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, reference_image TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, world_id INTEGER, name TEXT NOT NULL, city TEXT, state TEXT, nation TEXT, description TEXT, reference_image TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE, FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS objects (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, groups TEXT NOT NULL DEFAULT '[]', reference_image TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS scenes (id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER NOT NULL, book_id INTEGER NOT NULL, name TEXT NOT NULL, content TEXT, status TEXT, start_date INTEGER, end_date INTEGER, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS workspace_state (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL UNIQUE, dockview_layout TEXT NOT NULL DEFAULT '{}', panel_layout TEXT, updated_at INTEGER NOT NULL, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_characters_book ON characters(book_id, position);
CREATE INDEX IF NOT EXISTS idx_worlds_book ON worlds(book_id, position);
CREATE INDEX IF NOT EXISTS idx_locations_book ON locations(book_id, position);
CREATE INDEX IF NOT EXISTS idx_objects_book ON objects(book_id, position);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, position);
CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id, position);
CREATE INDEX IF NOT EXISTS idx_scenes_book ON scenes(book_id, position);
`;

export async function openAndroidDatabase({ sqlite = CapacitorSQLite, platform = Capacitor.getPlatform() } = {}) {
  if (platform !== 'android') throw new Error(`Android database requested on ${platform}`);
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const sqliteConnection = new SQLiteConnection(sqlite);
      const db = await sqliteConnection.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false);
      await db.open();
      await db.execute(STORYTELLER_SCHEMA);
      return db;
    })().catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}

export function resetAndroidDatabaseConnectionForTests() {
  connectionPromise = undefined;
}
