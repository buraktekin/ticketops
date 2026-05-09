import { sendToGroup }        from './whatsapp.js';
import { notificationMessage } from '../ai/prompts.js';
import logger                  from '../utils/logger.js';

/**
 * Send a ticket availability alert to the WhatsApp group.
 *
 * @param {object}  opts
 * @param {string}  opts.artistName
 * @param {import('../monitor/detector.js').EventSnapshot[]} opts.events
 * @param {string}  opts.url
 * @param {boolean} opts.reservationAttempted
 * @param {number}  opts.ticketsReserved
 */
export async function notify({ artistName, events, url, reservationAttempted, ticketsReserved = 10 }) {
  const message = notificationMessage(artistName, events, url, reservationAttempted, ticketsReserved);

  logger.info(`[notifier] Sending WhatsApp alert for ${artistName}`);
  logger.debug(`[notifier] Message:\n${message}`);

  try {
    await sendToGroup(message);
    logger.info('[notifier] ✓ Alert sent');
  } catch (err) {
    logger.error('[notifier] Failed to send WhatsApp message:', err.message);
    logger.warn('[notifier] MISSED ALERT:\n' + message);
  }
}
