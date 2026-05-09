import Anthropic from '@anthropic-ai/sdk';
import { env }   from '../config/index.js';
import {
  CONFIRMATION_SYSTEM,
  confirmationPrompt,
} from './prompts.js';
import logger from '../utils/logger.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/**
 * Ask Claude Vision to confirm whether the detected change is a real
 * ticket availability event, and extract structured event details.
 *
 * @param {object}   opts
 * @param {string}   opts.artistName
 * @param {import('../monitor/detector.js').EventSnapshot[]} opts.changedEvents
 * @param {'newlyAvailable'|'newEvent'}  opts.changeType
 * @param {string}   opts.screenshotBase64  - PNG as base64
 * @returns {Promise<ConfirmationResult>}
 */
export async function confirmAvailability({ artistName, changedEvents, changeType, screenshotBase64 }) {
  logger.info(`[ai] Asking Claude to confirm availability for ${artistName}...`);

  try {
    const response = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      system:     CONFIRMATION_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
            },
            {
              type: 'text',
              text: confirmationPrompt(artistName, changedEvents, changeType),
            },
          ],
        },
      ],
    });

    const raw = response.content[0]?.text || '{}';

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    logger.info(`[ai] Confirmation result: confirmed=${parsed.confirmed}, reason="${parsed.reason}"`);
    return parsed;

  } catch (err) {
    logger.error(`[ai] Claude confirmation failed: ${err.message}`);
    // On AI failure, fall back to trusting the DOM detector — don't block the alert
    return {
      confirmed: true,
      reason:    'AI confirmation failed — DOM change treated as valid',
      events:    changedEvents.map((e) => ({ dateKey: e.dateKey, available: !e.isSoldOut })),
    };
  }
}

/**
 * @typedef {Object} ConfirmationResult
 * @property {boolean} confirmed
 * @property {string}  reason
 * @property {Array<{dateKey:string, date:string, time:string, venue:string, priceHint:string|null, available:boolean}>} events
 */
