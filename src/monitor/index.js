/**
 * ticketops — main entry point
 *
 * Generic flow (works for any ticket website):
 *
 *   For each target:
 *     1. Load cached schema from storage/schemas/{id}.json
 *     2. If no schema → load page → ask Claude to discover schema → cache it
 *     3. Poll page using schema to extract listings
 *     4. If 0 listings returned → schema may be stale → re-discover
 *     5. First run → alert if tickets already available, else seed silently
 *     6. Subsequent runs → diff against stored state, alert on changes
 *     7. On change → WhatsApp alert + optional reservation
 */

import 'dotenv/config';
import fs from 'fs/promises';

import { loadTargets, env, paths } from '../config/index.js';
import { loadSchema, saveSchema }  from '../config/schema-store.js';
import { findBuiltInSchema }        from '../config/built-in-schemas.js';
import { loadPage, pollTarget, closeBrowser } from './poller.js';
import { discoverSchema }          from '../ai/discover.js';
import { detectChanges }           from './detector.js';
import { notify }                  from '../notifier/index.js';
import { attemptReservation }      from '../reserver/index.js';
import { initWhatsApp, closeWhatsApp } from '../notifier/whatsapp.js';
import { sleep }                   from '../utils/retry.js';
import logger                      from '../utils/logger.js';

// ── State persistence ─────────────────────────────────────────────────────────

async function loadState() {
  try { return JSON.parse(await fs.readFile(paths.state, 'utf-8')); } catch { return {}; }
}

async function saveState(state) {
  await fs.mkdir(paths.storage, { recursive: true });
  await fs.writeFile(paths.state, JSON.stringify(state, null, 2));
}

// ── Schema: load or discover ──────────────────────────────────────────────────

/**
 * Get a working schema for a target — from cache or freshly discovered.
 * @param {import('../config/index.js').Target} target
 * @param {boolean} forceRediscover
 * @returns {Promise<import('../ai/discover.js').Schema>}
 */
async function getSchema(target, forceRediscover = false) {
  // 1. Built-in schema (confirmed selectors, zero API cost)
  if (!forceRediscover) {
    const builtIn = findBuiltInSchema(target.url);
    if (builtIn) {
      logger.debug(`[monitor] [${target.id}] Using built-in schema for ${builtIn.name}`);
      return builtIn.schema;
    }
  }

  // 2. Cached schema from previous Claude discovery
  if (!forceRediscover) {
    const cached = await loadSchema(target.id);
    if (cached) {
      logger.debug(`[monitor] [${target.id}] Using cached schema (listSelector: "${cached.listSelector}") `);
      return cached;
    }
  }

  // 3. Unknown site — ask Claude to discover (costs API credits, runs once)
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      `No built-in schema for ${target.url} and ANTHROPIC_API_KEY is not set. ` +
      `Add your API key to .env to enable automatic schema discovery for new sites.`
    );
  }

  logger.info(`[monitor] [${target.id}] Unknown site — running Claude discovery (one-time, text-only)...`);
  const { html } = await loadPage(target.url);
  const schema = await discoverSchema({ url: target.url, html });
  await saveSchema(target.id, schema);
  logger.info(`[monitor] [${target.id}] Schema cached — Claude won't be called again for this site.`);
  return schema;
}

// ── Single target poll cycle ──────────────────────────────────────────────────

async function processSingleTarget(target, state) {
  logger.info(`[monitor] Polling → ${target.name}`);

  // ── Get schema (cached or discovered) ────────────────────────────────────────
  let schema;
  try {
    schema = await getSchema(target);
  } catch (err) {
    logger.error(`[monitor] [${target.id}] Schema discovery failed: ${err.message}`);
    return state;
  }

  // ── Poll the page ─────────────────────────────────────────────────────────────
  let pollResult;
  try {
    pollResult = await pollTarget(target, schema);
  } catch (err) {
    logger.error(`[monitor] [${target.id}] Poll failed: ${err.message}`);
    return state;
  }

  let { listings, screenshotBase64, polledAt } = pollResult;

  // ── Auto re-discover if schema returns nothing ────────────────────────────────
  if (listings.length === 0) {
    logger.warn(`[monitor] [${target.id}] 0 listings — schema may be stale, re-discovering...`);
    try {
      schema = await getSchema(target, true); // force rediscover
      pollResult = await pollTarget(target, schema);
      listings   = pollResult.listings;
    } catch (err) {
      logger.error(`[monitor] [${target.id}] Re-discovery failed: ${err.message}`);
      return state;
    }

    if (listings.length === 0) {
      logger.error(`[monitor] [${target.id}] Still 0 listings after re-discovery — page may be down`);
      return state;
    }
  }

  // ── First run ─────────────────────────────────────────────────────────────────
  const isFirstRun = !state[target.id];
  if (isFirstRun) {
    const alreadyAvailable = listings.filter((l) => !l.isSoldOut);

    if (alreadyAvailable.length === 0) {
      logger.info(`[monitor] [${target.id}] First run — all ${listings.length} sold out. Monitoring.`);
      return { ...state, [target.id]: { listings, polledAt } };
    }

    logger.info(`[monitor] [${target.id}] First run — ${alreadyAvailable.length} available! Alerting.`);
    await handleAvailability({ target, events: alreadyAvailable, schema });
    return { ...state, [target.id]: { listings, polledAt } };
  }

  // ── Subsequent runs: diff ─────────────────────────────────────────────────────
  const previous = state[target.id].listings || [];
  const { newlyAvailable, newEvents } = detectChanges(previous, listings);
  const changed = [...newlyAvailable, ...newEvents];

  if (changed.length === 0) {
    logger.debug(`[monitor] [${target.id}] No changes — ${listings.length} listing(s) unchanged`);
    return { ...state, [target.id]: { listings, polledAt } };
  }

  logger.info(
    `[monitor] [${target.id}] ⚡ Change — ` +
    `${newlyAvailable.length} newly available, ${newEvents.length} new event(s)`
  );

  await handleAvailability({ target, events: changed, schema });
  return { ...state, [target.id]: { listings, polledAt } };
}

// ── Shared availability handler ───────────────────────────────────────────────

async function handleAvailability({ target, events, schema }) {
  let reservationAttempted = false;
  let ticketsReserved      = 0;

  if (env.AUTO_RESERVE) {
    try {
      reservationAttempted = await attemptReservation({ target, events, schema });
      ticketsReserved      = target.ticketsToReserve ?? env.MAX_TICKETS;
    } catch (err) {
      logger.error(`[monitor] Reservation error: ${err.message}`);
    }
  }

  await notify({
    artistName: target.name,
    events,
    url:        target.url,
    reservationAttempted,
    ticketsReserved,
  });
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  logger.info('🎫  ticketops starting...');
  logger.info(`    Poll interval : ${env.POLL_INTERVAL_MS / 1000}s`);
  logger.info(`    Auto-reserve  : ${env.AUTO_RESERVE}`);

  await initWhatsApp();
  const targets = await loadTargets();
  logger.info(`    Targets       : ${targets.map((t) => t.name).join(', ')}\n`);

  while (true) {
    let state = await loadState();
    for (const target of targets) {
      state = await processSingleTarget(target, state);
    }
    await saveState(state);
    logger.info(`[monitor] Cycle complete. Sleeping ${env.POLL_INTERVAL_MS / 1000}s...\n`);
    await sleep(env.POLL_INTERVAL_MS);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  logger.info(`\n[monitor] ${signal} — shutting down...`);
  await closeBrowser();
  await closeWhatsApp();
  process.exit(0);
}

process.on('SIGINT',             () => shutdown('SIGINT'));
process.on('SIGTERM',            () => shutdown('SIGTERM'));
process.on('uncaughtException',  (err) => logger.error('[monitor] Uncaught exception:', err));
process.on('unhandledRejection', (r)   => logger.error('[monitor] Unhandled rejection:', r));

main().catch((err) => { logger.error('[monitor] Fatal:', err); process.exit(1); });
