const json = (value, fallback) => JSON.stringify(value ?? fallback);
const parse = (value, fallback) => { try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; } };
const envelope = (fn) => async (...args) => {
  try { return { success: true, data: await fn(...args) }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
};

const SELECTS = {
  books: `id, name, author, description, image, progress_status AS progressStatus, genres, target_audience AS targetAudience, primary_language AS primaryLanguage, created_at AS createdAt, updated_at AS updatedAt, archived`,
  series: `id, name, description, image, created_at AS createdAt, updated_at AS updatedAt, archived`,
  characters: `id, book_id AS bookId, first_name AS first_name, last_name AS last_name, gender, role, avatar, description, attributes, groups, tags, position, created_at AS createdAt, updated_at AS updatedAt`,
  worlds: `id, book_id AS bookId, name, description, reference_image AS referenceImage, position, created_at AS createdAt, updated_at AS updatedAt`,
  locations: `id, book_id AS bookId, world_id AS worldId, name, city, state, nation, description, reference_image AS referenceImage, position, created_at AS createdAt, updated_at AS updatedAt`,
  objects: `id, book_id AS bookId, name, description, groups, reference_image AS referenceImage, position, created_at AS createdAt, updated_at AS updatedAt`,
  chapters: `id, book_id AS bookId, name, description, status, position, created_at AS createdAt, updated_at AS updatedAt`,
  scenes: `id, chapter_id AS chapterId, book_id AS bookId, name, content, status, start_date AS startDate, end_date AS endDate, position, created_at AS createdAt, updated_at AS updatedAt`,
};
const MAPS = {
  books: (r) => r && ({ ...r, genres: parse(r.genres, []), archived: !!r.archived }),
  series: (r) => r && ({ ...r, archived: !!r.archived }),
  characters: (r) => r && ({ ...r, firstName: r.first_name, lastName: r.last_name, attributes: parse(r.attributes, {}), groups: parse(r.groups, []), tags: parse(r.tags, []) }),
  objects: (r) => r && ({ ...r, groups: parse(r.groups, []) }),
};
const columns = {
  books: { name: 'name', author: 'author', description: 'description', image: 'image', progressStatus: 'progress_status', genres: 'genres', targetAudience: 'target_audience', primaryLanguage: 'primary_language', archived: 'archived' },
  series: { name: 'name', description: 'description', image: 'image', archived: 'archived' },
  characters: { bookId: 'book_id', first_name: 'first_name', firstName: 'first_name', last_name: 'last_name', lastName: 'last_name', gender: 'gender', role: 'role', avatar: 'avatar', description: 'description', attributes: 'attributes', groups: 'groups', tags: 'tags', position: 'position' },
  worlds: { bookId: 'book_id', name: 'name', description: 'description', referenceImage: 'reference_image', position: 'position' },
  locations: { bookId: 'book_id', worldId: 'world_id', name: 'name', city: 'city', state: 'state', nation: 'nation', description: 'description', referenceImage: 'reference_image', position: 'position' },
  objects: { bookId: 'book_id', name: 'name', description: 'description', groups: 'groups', referenceImage: 'reference_image', position: 'position' },
  chapters: { bookId: 'book_id', name: 'name', description: 'description', status: 'status', position: 'position' },
  scenes: { chapterId: 'chapter_id', bookId: 'book_id', name: 'name', content: 'content', status: 'status', startDate: 'start_date', endDate: 'end_date', position: 'position' },
};
const jsonFields = { books: new Set(['genres']), characters: new Set(['attributes', 'groups', 'tags']), objects: new Set(['groups']) };
const defaults = {
  books: (d) => ({ author: d.author, progress_status: d.progressStatus || 'not_started', genres: json(d.genres, []), target_audience: d.targetAudience || 'general', primary_language: d.primaryLanguage || 'en', archived: 0 }),
  series: () => ({ archived: 0 }),
  characters: (d) => ({ last_name: d.last_name ?? d.lastName ?? '', role: d.role || 'supporting', attributes: json(d.attributes, {}), groups: json(d.groups, []), tags: json(d.tags, []) }),
  objects: (d) => ({ groups: json(d.groups, []) }),
  scenes: (d) => ({ content: d.content == null ? null : (typeof d.content === 'string' ? d.content : json(d.content, null)) }),
};

export function createAndroidDataApi(db, { deleteImage } = {}) {
  const query = async (sql, values = []) => (await db.query(sql, values)).values ?? [];
  const run = async (sql, values = []) => db.run(sql, values);
  const one = async (table, id) => {
    const rows = await query(`SELECT ${SELECTS[table]} FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    return (MAPS[table] || ((row) => row))(rows[0] ?? null);
  };
  const create = async (table, data, scope = {}) => {
    const input = { ...scope, ...data };
    const row = { ...input, ...(defaults[table]?.(input) || {}) };
    const positionColumn = table === 'scenes' ? 'chapter_id' : table === 'characters' || table === 'worlds' || table === 'locations' || table === 'objects' || table === 'chapters' ? 'book_id' : null;
    if (positionColumn && row.position == null) {
      const scopeId = positionColumn === 'chapter_id' ? row.chapterId : row.bookId;
      const max = (await query(`SELECT MAX(position) AS max FROM ${table} WHERE ${positionColumn} = ?`, [scopeId]))[0]?.max;
      row.position = Number(max ?? -1) + 1;
    }
    const now = Date.now();
    const pairs = Object.entries(columns[table]).filter(([key]) => row[key] !== undefined).map(([key, col]) => [col, jsonFields[table]?.has(key) ? json(row[key], key === 'genres' || key === 'groups' || key === 'tags' ? [] : {}) : row[key]]);
    for (const [col, val] of [['created_at', now], ['updated_at', now]]) pairs.push([col, val]);
    if (table === 'books' || table === 'series') pairs.push(['archived', row.archived ?? 0]);
    const result = await run(`INSERT INTO ${table} (${pairs.map(([col]) => col).join(', ')}) VALUES (${pairs.map(() => '?').join(', ')})`, pairs.map(([, val]) => val));
    return one(table, Number(result.changes?.lastId ?? result.lastId));
  };
  const update = async (table, id, data) => {
    const pairs = Object.entries(columns[table]).filter(([key]) => data[key] !== undefined).map(([key, col]) => [col, jsonFields[table]?.has(key) ? json(data[key], {}) : data[key]]);
    pairs.push(['updated_at', Date.now()]);
    await run(`UPDATE ${table} SET ${pairs.map(([col]) => `${col} = ?`).join(', ')} WHERE id = ?`, [...pairs.map(([, val]) => val), id]);
    return one(table, id);
  };
  const byBook = (table) => envelope(async (bookId) => {
    const rows = await query(`SELECT ${SELECTS[table]} FROM ${table} WHERE book_id = ? ORDER BY position ASC, created_at DESC`, [bookId]);
    return rows.map((row) => (MAPS[table] || ((r) => r))(row));
  });
  const entity = (table, bookScoped = true) => ({
    ...(bookScoped ? { getAllByBook: byBook(table) } : { getAll: envelope(async () => (await query(`SELECT ${SELECTS[table]} FROM ${table} ORDER BY created_at DESC`)).map((r) => (MAPS[table] || ((v) => v))(r))) }),
    getById: envelope((id) => one(table, id)),
    create: envelope((data) => create(table, data)),
    update: envelope((id, data) => update(table, id, data)),
    delete: envelope(async (id) => {
      const imageColumn = ({ books: 'image', series: 'image', characters: 'avatar', worlds: 'reference_image', locations: 'reference_image', objects: 'reference_image' })[table];
      if (imageColumn && deleteImage) {
        const row = (await query(`SELECT ${imageColumn} AS imageId FROM ${table} WHERE id = ? LIMIT 1`, [id]))[0];
        if (row?.imageId) await deleteImage(row.imageId);
      }
      await run(`DELETE FROM ${table} WHERE id = ?`, [id]); return { deleted: true };
    }),
  });
  const reorder = (table) => envelope(async (bookId, ids) => {
    await db.beginTransaction();
    try {
      for (const [position, id] of ids.entries()) await run(`UPDATE ${table} SET position = ?, updated_at = ? WHERE id = ? AND book_id = ?`, [position, Date.now(), id, bookId]);
      await db.commitTransaction();
    } catch (error) { await db.rollbackTransaction(); throw error; }
    return { reordered: true };
  });
  const books = entity('books', false);
  books.getOverview = envelope(async (id) => {
    const book = await one('books', id);
    if (!book) return null;
    const stats = {};
    for (const [key, table] of Object.entries({ chapters: 'chapters', scenes: 'scenes', characters: 'characters', worlds: 'worlds', locations: 'locations', objects: 'objects' })) stats[key] = Number((await query(`SELECT COUNT(*) AS count FROM ${table} WHERE book_id = ?`, [id]))[0]?.count ?? 0);
    const scenes = await query('SELECT content, status, created_at AS createdAt FROM scenes WHERE book_id = ?', [id]);
    let words = 0; let scenesWithContent = 0; let firstSceneAt = null; let lastSceneAt = null;
    const sceneStatusCounts = {};
    const nodeText = (node) => (node && typeof node === 'object' ? `${typeof node.text === 'string' ? `${node.text} ` : ''}${Array.isArray(node.content) ? node.content.map(nodeText).join('') : ''}` : '');
    for (const scene of scenes) {
      let content;
      try { content = typeof scene.content === 'string' ? JSON.parse(scene.content) : scene.content; } catch { content = null; }
      const text = nodeText(content);
      const count = text.trim() ? text.trim().split(/\s+/).length : 0;
      words += count; if (count > 0) scenesWithContent++;
      const key = scene.status || 'unspecified'; sceneStatusCounts[key] = (sceneStatusCounts[key] || 0) + 1;
      if (scene.createdAt != null) { firstSceneAt = firstSceneAt == null ? scene.createdAt : Math.min(firstSceneAt, scene.createdAt); lastSceneAt = lastSceneAt == null ? scene.createdAt : Math.max(lastSceneAt, scene.createdAt); }
    }
    stats.words = { total: words, averagePerScene: scenesWithContent ? Math.round(words / scenesWithContent) : 0 };
    stats.structure = { scenesPerChapter: stats.chapters ? Math.round((stats.scenes / stats.chapters) * 10) / 10 : 0 };
    stats.sceneStatusCounts = sceneStatusCounts;
    stats.writingPeriod = { firstSceneAt, lastSceneAt };
    return { book, stats };
  });
  books.archive = envelope((id) => update('books', id, { archived: 1 }));
  books.unarchive = envelope((id) => update('books', id, { archived: 0 }));
  const series = entity('series', false);
  series.archive = envelope((id) => update('series', id, { archived: 1 }));
  series.unarchive = envelope((id) => update('series', id, { archived: 0 }));
  series.getBooks = envelope(async (seriesId) => {
    const rows = await query(`SELECT ${SELECTS.books.split(', ').map((c) => c.startsWith('id,') ? `b.${c.slice(0,2)}${c.slice(2)}` : `b.${c}`).join(', ')}, bs.position FROM book_series bs JOIN books b ON b.id = bs.book_id WHERE bs.series_id = ? ORDER BY bs.position ASC`, [seriesId]);
    return rows.map(MAPS.books);
  });
  const bookSeries = {
    addBookToSeries: envelope(async (bookId, seriesId, position = null) => {
      if (position == null) position = Number((await query('SELECT MAX(position) AS max FROM book_series WHERE series_id = ?', [seriesId]))[0]?.max ?? -1) + 1;
      const result = await run('INSERT INTO book_series(book_id, series_id, position) VALUES(?, ?, ?)', [bookId, seriesId, position]);
      return (await query('SELECT id, book_id AS bookId, series_id AS seriesId, position FROM book_series WHERE id = ?', [result.changes?.lastId ?? result.lastId]))[0];
    }),
    removeBookFromSeries: envelope(async (bookId, seriesId) => { await run('DELETE FROM book_series WHERE book_id = ? AND series_id = ?', [bookId, seriesId]); return { removed: true }; }),
    updateBookPosition: envelope(async (bookId, seriesId, position) => { await run('UPDATE book_series SET position = ? WHERE book_id = ? AND series_id = ?', [position, bookId, seriesId]); return (await query('SELECT id, book_id AS bookId, series_id AS seriesId, position FROM book_series WHERE book_id = ? AND series_id = ?', [bookId, seriesId]))[0] ?? null; }),
    reorderSeries: envelope(async (seriesId, ids) => { await db.beginTransaction(); try { for (const [i, id] of ids.entries()) await run('UPDATE book_series SET position = ? WHERE book_id = ? AND series_id = ?', [i, id, seriesId]); await db.commitTransaction(); } catch (e) { await db.rollbackTransaction(); throw e; } return { reordered: true }; }),
  };
  const characters = entity('characters');
  characters.reorder = reorder('characters');
  characters.getRelationships = envelope(async (characterId) => (await query(`SELECT cr.id, cr.character_id AS characterId, cr.related_character_id AS relatedCharacterId, cr.relationship_type AS relationshipType, cr.metadata, c.id AS related_id, c.first_name AS related_firstName, c.last_name AS related_lastName, c.avatar AS related_avatar, c.gender AS related_gender FROM character_relationships cr JOIN characters c ON c.id = cr.related_character_id WHERE cr.character_id = ?`, [characterId])).map((r) => ({ id: r.id, characterId: r.characterId, relatedCharacterId: r.relatedCharacterId, relationshipType: r.relationshipType, metadata: parse(r.metadata, {}), relatedCharacter: { id: r.related_id, firstName: r.related_firstName, lastName: r.related_lastName, avatar: r.related_avatar, gender: r.related_gender } })));
  characters.addRelationship = envelope(async ({ characterId, relatedCharacterId, relationshipType, metadata }) => {
    const neutral = ({ father: 'parent', mother: 'parent', son: 'child', daughter: 'child', brother: 'sibling', sister: 'sibling', husband: 'spouse', wife: 'spouse', 'fiancé': 'engaged', 'fiancée': 'engaged' })[relationshipType] || relationshipType;
    const reciprocal = ({ parent: 'child', child: 'parent', mentor: 'apprentice', apprentice: 'mentor' })[neutral] || neutral;
    const now = Date.now();
    const result = await run('INSERT INTO character_relationships(character_id, related_character_id, relationship_type, metadata, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)', [characterId, relatedCharacterId, neutral, json(metadata, {}), now, now]);
    const existing = await query('SELECT id FROM character_relationships WHERE character_id = ? AND related_character_id = ? LIMIT 1', [relatedCharacterId, characterId]);
    if (!existing.length) await run('INSERT INTO character_relationships(character_id, related_character_id, relationship_type, metadata, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)', [relatedCharacterId, characterId, reciprocal, json(metadata, {}), now, now]);
    const row = (await query('SELECT id, character_id AS characterId, related_character_id AS relatedCharacterId, relationship_type AS relationshipType, metadata, created_at AS createdAt, updated_at AS updatedAt FROM character_relationships WHERE id = ?', [result.changes?.lastId ?? result.lastId]))[0];
    return { ...row, metadata: parse(row?.metadata, {}) };
  });
  characters.updateRelationship = envelope(async (id, data) => {
    const normalize = (type) => ({ father: 'parent', mother: 'parent', son: 'child', daughter: 'child', brother: 'sibling', sister: 'sibling', husband: 'spouse', wife: 'spouse', 'fiancé': 'engaged', 'fiancée': 'engaged' })[type] || type;
    const reciprocalType = (type) => ({ parent: 'child', child: 'parent', mentor: 'apprentice', apprentice: 'mentor' })[type] || type;
    const pairs = [];
    const neutral = data.relationshipType === undefined ? undefined : normalize(data.relationshipType);
    if (neutral !== undefined) pairs.push(['relationship_type', neutral]);
    if (data.metadata !== undefined) pairs.push(['metadata', json(data.metadata, {})]);
    pairs.push(['updated_at', Date.now()]);
    await run(`UPDATE character_relationships SET ${pairs.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`, [...pairs.map(([, value]) => value), id]);
    const row = (await query('SELECT id, character_id AS characterId, related_character_id AS relatedCharacterId, relationship_type AS relationshipType, metadata, created_at AS createdAt, updated_at AS updatedAt FROM character_relationships WHERE id = ?', [id]))[0];
    if (!row) return null;
    const reciprocal = (await query('SELECT id FROM character_relationships WHERE character_id = ? AND related_character_id = ? LIMIT 1', [row.relatedCharacterId, row.characterId]))[0];
    if (reciprocal) {
      const recPairs = [];
      if (data.metadata !== undefined) recPairs.push(['metadata', json(data.metadata, {})]);
      if (neutral !== undefined) recPairs.push(['relationship_type', reciprocalType(neutral)]);
      recPairs.push(['updated_at', Date.now()]);
      await run(`UPDATE character_relationships SET ${recPairs.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`, [...recPairs.map(([, value]) => value), reciprocal.id]);
    }
    return { ...row, metadata: parse(row.metadata, {}) };
  });
  characters.removeRelationship = envelope(async (id) => { const rel = (await query('SELECT character_id AS characterId, related_character_id AS relatedCharacterId FROM character_relationships WHERE id = ?', [id]))[0]; if (!rel) return { deleted: false }; await run('DELETE FROM character_relationships WHERE id = ? OR (character_id = ? AND related_character_id = ?)', [id, rel.relatedCharacterId, rel.characterId]); return { deleted: true }; });
  const worlds = entity('worlds'); worlds.reorder = reorder('worlds');
  const locations = entity('locations'); locations.reorder = reorder('locations');
  const objects = entity('objects'); objects.reorder = reorder('objects');
  const chapters = entity('chapters'); chapters.reorder = reorder('chapters');
  const scenes = entity('scenes');
  scenes.getAllByChapter = envelope(async (chapterId) => (await query(`SELECT ${SELECTS.scenes} FROM scenes WHERE chapter_id = ? ORDER BY position ASC, created_at ASC`, [chapterId])));
  scenes.getAllByBook = envelope(async (bookId) => (await query(`SELECT ${SELECTS.scenes} FROM scenes WHERE book_id = ? ORDER BY position ASC, created_at ASC`, [bookId])));
  scenes.reorder = envelope(async (chapterId, ids) => { await db.beginTransaction(); try { for (const [position, id] of ids.entries()) await run('UPDATE scenes SET position = ?, updated_at = ? WHERE id = ? AND chapter_id = ?', [position, Date.now(), id, chapterId]); await db.commitTransaction(); } catch (e) { await db.rollbackTransaction(); throw e; } return { reordered: true }; });
  scenes.moveToChapter = envelope(async (sceneId, chapterId) => { const scene = await one('scenes', sceneId); if (!scene) throw new Error('Scene not found'); if (scene.chapterId === chapterId) return { moved: false, message: 'Scene already in target chapter' }; const target = (await query('SELECT MAX(position) AS max FROM scenes WHERE chapter_id = ?', [chapterId]))[0]; await run('UPDATE scenes SET chapter_id = ?, position = ?, updated_at = ? WHERE id = ?', [chapterId, Number(target?.max ?? -1) + 1, Date.now(), sceneId]); return { moved: true, scene: await one('scenes', sceneId), oldChapterId: scene.chapterId, newChapterId: chapterId }; });
  const writing = { getAllForPreview: envelope(async (bookId) => { const cs = await query(`SELECT ${SELECTS.chapters} FROM chapters WHERE book_id = ? ORDER BY position ASC, created_at ASC`, [bookId]); const ss = await query(`SELECT ${SELECTS.scenes} FROM scenes WHERE book_id = ? ORDER BY position ASC, created_at ASC`, [bookId]); const grouped = Object.groupBy ? Object.groupBy(ss, (s) => s.chapterId) : ss.reduce((acc, s) => ((acc[s.chapterId] ||= []).push(s), acc), {}); return cs.map((c) => ({ ...c, scenes: grouped[c.id] || [] })); }) };
  return { books, series, bookSeries, characters, worlds, locations, objects, chapters, scenes, writing };
}
