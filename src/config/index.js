import 'dotenv/config';
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../../');

// ── Env ───────────────────────────────────────────────────────────────────────

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

export const env = {
  ANTHROPIC_API_KEY:   requireEnv('ANTHROPIC_API_KEY'),
  WHATSAPP_GROUP_ID:   requireEnv('WHATSAPP_GROUP_ID'),
  POLL_INTERVAL_MS:    parseInt(process.env.POLL_INTERVAL_MS  || '45000', 10),
  MAX_RETRIES:         parseInt(process.env.MAX_RETRIES        || '3',     10),
  MAX_TICKETS:         parseInt(process.env.MAX_TICKETS        || '10',    10),
  AUTO_RESERVE:        process.env.AUTO_RESERVE         !== 'false',
  USE_AI_CONFIRMATION: process.env.USE_AI_CONFIRMATION  !== 'false',
  LOG_LEVEL:           process.env.LOG_LEVEL             || 'info',
};

// ── Targets ───────────────────────────────────────────────────────────────────

/**
 * Load targets.json from the project root.
 * Falls back to targets.example.json with a warning if targets.json is missing.
 * @returns {Promise<Target[]>}
 */
export async function loadTargets() {
  const targetPath  = path.join(ROOT, 'targets.json');
  const examplePath = path.join(ROOT, 'targets.example.json');

  let raw;
  try {
    raw = await fs.readFile(targetPath, 'utf-8');
  } catch {
    logger.warn('[config] targets.json not found — using targets.example.json. Copy it and fill in real URLs.');
    raw = await fs.readFile(examplePath, 'utf-8');
  }

  const targets = JSON.parse(raw);
  const active  = targets.filter((t) => t.enabled);

  if (active.length === 0) {
    throw new Error('[config] No enabled targets found in targets.json');
  }

  logger.info(`[config] Loaded ${active.length} active target(s): ${active.map((t) => t.name).join(', ')}`);
  return active;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

export const paths = {
  root:        ROOT,
  storage:     path.join(ROOT, 'storage'),
  sessions:    path.join(ROOT, 'storage/sessions'),
  screenshots: path.join(ROOT, 'storage/screenshots'),
  state:       path.join(ROOT, 'storage/state.json'),
  waAuth:      path.join(ROOT, '.wwebjs_auth'),
};

/**
 * @typedef {Object} Target
 * @property {string}  id
 * @property {string}  name
 * @property {string}  url
 * @property {boolean} enabled
 * @property {number}  ticketsToReserve
 * @property {string}  [notes]
 */
