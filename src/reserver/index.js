import { reserveTickets } from './biletix.js';
import { env }            from '../config/index.js';
import logger             from '../utils/logger.js';

/**
 * Orchestrate the reservation flow for all newly available events.
 *
 * @param {object}  opts
 * @param {import('../config/index.js').Target} opts.target
 * @param {import('../monitor/detector.js').EventSnapshot[]} opts.events
 * @returns {Promise<boolean>}  true if at least one reservation succeeded
 */
export async function attemptReservation({ target, events }) {
  if (!env.AUTO_RESERVE) {
    logger.info('[reserver] AUTO_RESERVE is disabled — skipping');
    return false;
  }

  let anySuccess = false;

  // Reserve for the first available event (or all, if you prefer)
  const toReserve = events.slice(0, 1); // reserve first one to avoid overkill

  for (const event of toReserve) {
    const result = await reserveTickets({
      url:         target.url,
      artistName:  target.name,
      maxTickets:  target.ticketsToReserve ?? env.MAX_TICKETS,
      targetEvent: event,
    });

    if (result.success) {
      anySuccess = true;
      logger.info(
        `[reserver] ✓ Reserved ${result.ticketsReserved} ticket(s) for ${target.name} — ${event.dateKey}`,
      );
    } else {
      logger.error(`[reserver] ✗ Failed for ${target.name} — ${event.dateKey}: ${result.error}`);
    }
  }

  return anySuccess;
}
