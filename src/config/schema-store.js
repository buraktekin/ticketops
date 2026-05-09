/**
 * schema-store.js
 *
 * Reads and writes discovered schemas to storage/schemas/{targetId}.json
 *
 * Schemas are auto-discovered by Claude on first run and cached here.
 * They are NOT committed to git (covered by .gitignore).
 */

import fs   from 'fs/promises';
import path from 'path';
import { paths } from './index.js';
import logger    from '../utils/logger.js';

const schemasDir = path.join(paths.storage, 'schemas');

async function ensureDir() {
  await fs.mkdir(schemasDir, { recursive: true });
}

/**
 * Load a saved schema for a target, or null if not yet discovered.
 * @param {string} targetId
 * @returns {Promise<import('../ai/discover.js').Schema|null>}
 */
export async function loadSchema(targetId) {
  try {
    const raw = await fs.readFile(path.join(schemasDir, `${targetId}.json`), 'utf-8');
    const schema = JSON.parse(raw);
    logger.debug(`[schema-store] Loaded cached schema for ${targetId}`);
    return schema;
  } catch {
    return null;
  }
}

/**
 * Save a discovered schema for a target.
 * @param {string} targetId
 * @param {import('../ai/discover.js').Schema} schema
 */
export async function saveSchema(targetId, schema) {
  await ensureDir();
  const schemaPath = path.join(schemasDir, `${targetId}.json`);
  await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));
  logger.info(`[schema-store] Schema saved → ${schemaPath}`);
}

/**
 * Delete a schema — forces re-discovery on next poll.
 * @param {string} targetId
 */
export async function deleteSchema(targetId) {
  try {
    await fs.unlink(path.join(schemasDir, `${targetId}.json`));
    logger.info(`[schema-store] Schema deleted for ${targetId} — will re-discover on next poll`);
  } catch {}
}
