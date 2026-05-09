import { reserveTickets } from './generic.js';
import { env }            from '../config/index.js';
import logger             from '../utils/logger.js';

/**
 * @param {object} opts
 * @param {import('../config/index.js').Target} opts.target
 * @param {import('../monitor/detector.js').EventSnapshot[]} opts.events
 * @param {import('../ai/discover.js').Schema} opts.schema
 */
export async function attemptReservation({ target, events, schema }) {
  if (!env.AUTO_RESERVE) {
    logger.info('[reserver] AUTO_RESERVE disabled — skipping');
    return false;
  }

  const event = events[0]; // reserve for the first available event
  const result = await reserveTickets({
    url:         target.url,
    artistName:  target.name,
    maxTickets:  target.ticketsToReserve ?? env.MAX_TICKETS,
    targetEvent: event,
    schema,
  });

  if (result.success) {
    logger.info(`[reserver] ✓ Reserved ${result.ticketsReserved} tickets for ${target.name}`);
  } else {
    logger.error(`[reserver] ✗ Failed for ${target.name}: ${result.error}`);
  }

  return result.success;
}
