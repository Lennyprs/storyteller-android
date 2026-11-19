import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { STORYTELLER_SCHEMA } from '../src/renderer/src/platform/androidDatabase.js';
import { createAndroidDataApi } from '../src/renderer/src/platform/androidDataApi.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('../node_modules/.pnpm/jeep-sqlite@2.8.0/node_modules/sql.js');
const SQL = await initSqlJs();
function createDb() {
  const raw = new SQL.Database();
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(STORYTELLER_SCHEMA);
  return {
    query: async (sql, values = []) => {
      const stmt = raw.prepare(sql); stmt.bind(values); const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free(); return { values: rows };
    },
    run: async (sql, values = []) => { raw.run(sql, values); return { changes: { lastId: raw.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0] } }; },
    beginTransaction: async () => raw.exec('BEGIN'),
    commitTransaction: async () => raw.exec('COMMIT'),
    rollbackTransaction: async () => raw.exec('ROLLBACK'),
    close: () => raw.close(),
  };
}
const dataOf = async (promise) => { const result = await promise; assert.equal(result.success, true, result.error); return result.data; };

test('books and series support persistent CRUD and membership operations', async () => {
  const db = createDb(); const api = createAndroidDataApi(db);
  const book = await dataOf(api.books.create({ name: 'Test Book', author: 'Author' }));
  assert.equal((await dataOf(api.books.getById(book.id))).name, 'Test Book');
  assert.deepEqual((await dataOf(api.books.update(book.id, { description: 'Edited' }))).description, 'Edited');
  const series = await dataOf(api.series.create({ name: 'Series' }));
  await dataOf(api.bookSeries.addBookToSeries(book.id, series.id));
  assert.equal((await dataOf(api.series.getBooks(series.id))).length, 1);
  await dataOf(api.bookSeries.removeBookFromSeries(book.id, series.id));
  assert.equal((await dataOf(api.series.getBooks(series.id))).length, 0);
  await dataOf(api.books.delete(book.id));
  assert.equal(await dataOf(api.books.getById(book.id)), null);
  db.close();
});

test('all book entities support create, read, update, and delete', async () => {
  const db = createDb(); const api = createAndroidDataApi(db);
  const book = await dataOf(api.books.create({ name: 'Book', author: 'Author' }));
  const character = await dataOf(api.characters.create({ bookId: book.id, first_name: 'Ada', attributes: { age: 31 } }));
  const world = await dataOf(api.worlds.create({ bookId: book.id, name: 'World' }));
  const location = await dataOf(api.locations.create({ bookId: book.id, worldId: world.id, name: 'City' }));
  const object = await dataOf(api.objects.create({ bookId: book.id, name: 'Key', groups: ['plot'] }));
  const chapter = await dataOf(api.chapters.create({ bookId: book.id, name: 'Chapter' }));
  const scene = await dataOf(api.scenes.create({ bookId: book.id, chapterId: chapter.id, name: 'Scene', content: { type: 'doc' } }));
  const entities = [
    [api.characters, character, { description: 'Updated' }], [api.worlds, world, { description: 'Updated' }],
    [api.locations, location, { city: 'Updated' }], [api.objects, object, { description: 'Updated' }],
    [api.scenes, scene, { status: 'draft' }], [api.chapters, chapter, { description: 'Updated' }],
  ];
  for (const [entity, created, patch] of entities) {
    assert.ok(await dataOf(entity.getById(created.id)), JSON.stringify(created));
    assert.ok(await dataOf(entity.update(created.id, patch)));
    await dataOf(entity.delete(created.id));
    assert.equal(await dataOf(entity.getById(created.id)), null);
  }
  assert.ok(await dataOf(api.characters.getAllByBook(book.id)));
  db.close();
});

test('character relationship create, update, and delete preserve reciprocal relations', async () => {
  const db = createDb(); const api = createAndroidDataApi(db);
  const book = await dataOf(api.books.create({ name: 'Book', author: 'Author' }));
  const parent = await dataOf(api.characters.create({ bookId: book.id, first_name: 'Parent' }));
  const child = await dataOf(api.characters.create({ bookId: book.id, first_name: 'Child' }));
  const relation = await dataOf(api.characters.addRelationship({ characterId: parent.id, relatedCharacterId: child.id, relationshipType: 'father' }));
  assert.equal(relation.relationshipType, 'parent');
  assert.equal((await dataOf(api.characters.getRelationships(child.id)))[0].relationshipType, 'child');
  await dataOf(api.characters.updateRelationship(relation.id, { relationshipType: 'mentor', metadata: { note: 'updated' } }));
  assert.equal((await dataOf(api.characters.getRelationships(child.id)))[0].relationshipType, 'apprentice');
  assert.deepEqual((await dataOf(api.characters.getRelationships(child.id)))[0].metadata, { note: 'updated' });
  await dataOf(api.characters.removeRelationship(relation.id));
  assert.equal((await dataOf(api.characters.getRelationships(parent.id))).length, 0);
  db.close();
});
