/**
 * ticketops — main entry point
 *
 * Flow per poll cycle:
 *   1. Load targets from targets.json
 *   2. For each target: poll the Biletix page
 *   3. First run for a target → seed state silently, no alert
 *   4. Subsequent runs → compare with stored state, detect changes
 *   5. If changes: optionally confirm with Claude Vision (off by default)
 *   6. Send WhatsApp alert + attempt reservation
 *   7. Persist new state, sleep, repeat
 */

import 'dotenv/config';
import fs   from 'fs/promises';

import { loadTargets, env, paths }     from '../config/index.js';
import { pollTarget }                   from './poller.js';
import { detectChanges }               from './detector.js';
import { confirmAvailability }         from '../ai/index.js';
import { notify }                      from '../notifier/index.js';
import { attemptReservation }          from '../reserver/index.js';
import { initWhatsApp, closeWhatsApp } from '../notifier/whatsapp.js';
import { closeBrowser }                from './poller.js';
import { sleep }                       from '../utils/retry.js';
import logger                          from '../utils/logger.js';

// ── State persistence ─────────────────────────────────────────────────────────

async function loadState() {
  try {
    const raw = await fs.readFile(paths.state, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveState(state) {
  await fs.mkdir(paths.storage, { recursive: true });
  await fs.writeFile(paths.state, JSON.stringify(state, null, 2));
}

// ── Single target ─────────────────────────────────────────────────────────────

async function processSingleTarget(target, state) {
  logger.info(`[monitor] Polling → ${target.name}`);

  let pollResult;
  try {
    pollResult = await pollTarget(target);
  } catch (err) {
    logger.error(`[monitor] Poll failed for ${target.id}: ${err.message}`);
    return state;
  }

  const { listings, screenshotBase64, polledAt } = pollResult;

  if (listings.length === 0) {
    logger.warn(`[monitor] [${target.id}] No listings found — page structure may have changed`);
    return state;
  }

  // ── First run: seed state AND alert if tickets already available ─────────────
  const isFirstRun = !state[target.id];
  if (isFirstRun) {
    const alreadyAvailable = listings.filter((l) => !l.isSoldOut);

    if (alreadyAvailable.length === 0) {
      logger.info(
        `[monitor] [${target.id}] First run — all ${listings.length} listing(s) sold out. Monitoring for changes.`
      );
      return { ...state, [target.id]: { listings, polledAt } };
    }

    logger.info(
      `[monitor] [${target.id}] First run — ${alreadyAvailable.length} listing(s) already available! Alerting.`
    );

    let reservationAttempted = false;
    let ticketsReserved      = 0;
    if (env.AUTO_RESERVE) {
      try {
        reservationAttempted = await attemptReservation({ target, events: alreadyAvailable });
        ticketsReserved      = target.ticketsToReserve ?? env.MAX_TICKETS;
      } catch (err) {
        logger.error(`[monitor] Reservation error: ${err.message}`);
      }
    }

    await notify({ artistName: target.name, events: alreadyAvailable, url: target.url, reservationAttempted, ticketsReserved });
    return { ...state, [target.id]: { listings, polledAt } };
  }

  // ── Subsequent runs: diff against stored state ────────────────────────────────
  const previous = state[target.id].listings || [];
  const { newlyAvailable, newEvents } = detectChanges(previous, listings);
  const changed = [...newlyAvailable, ...newEvents];

  if (changed.length === 0) {
    logger.debug(`[monitor] [${target.id}] No changes — ${listings.length} listing(s) unchanged`);
    return { ...state, [target.id]: { listings, polledAt } };
  }

  logger.info(
    `[monitor] [${target.id}] ⚡ Change detected — ` +
    `${newlyAvailable.length} newly available, ${newEvents.length} new event(s)`
  );

  // ── Optional AI confirmation (off by default) ─────────────────────────────────
  if (env.USE_AI_CONFIRMATION) {
    const changeType   = newlyAvailable.length > 0 ? 'newlyAvailable' : 'newEvent';
    const confirmation = await confirmAvailability({
      artistName:    target.name,
      changedEvents: changed,
      changeType,
      screenshotBase64,
    });

    if (!confirmation.confirmed) {
      logger.warn(`[monitor] [${target.id}] AI rejected: "${confirmation.reason}" — skipping`);
      return { ...state, [target.id]: { listings, polledAt } };
    }

    logger.info(`[monitor] [${target.id}] AI confirmed: "${confirmation.reason}"`);
  }

  // ── Reservation ───────────────────────────────────────────────────────────────
  let reservationAttempted = false;
  let ticketsReserved      = 0;

  if (env.AUTO_RESERVE) {
    try {
      reservationAttempted = await attemptReservation({ target, events: changed });
      ticketsReserved      = target.ticketsToReserve ?? env.MAX_TICKETS;
    } catch (err) {
      logger.error(`[monitor] Reservation error for ${target.id}: ${err.message}`);
    }
  }

  // ── WhatsApp notification ─────────────────────────────────────────────────────
  await notify({ artistName: target.name, events: changed, url: target.url, reservationAttempted, ticketsReserved });

  return { ...state, [target.id]: { listings, polledAt } };
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  logger.info('🎫  ticketops starting...');
  logger.info(`    Poll interval : ${env.POLL_INTERVAL_MS / 1000}s`);
  logger.info(`    Auto-reserve  : ${env.AUTO_RESERVE}`);
  logger.info(`    AI confirm    : ${env.USE_AI_CONFIRMATION}`);

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
