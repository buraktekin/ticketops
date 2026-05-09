/**
 * whatsapp.js
 *
 * WhatsApp client wrapper using whatsapp-web.js.
 *
 * WHATSAPP_RECIPIENT_ID can be either:
 *   - A group ID:    XXXXXXXXXX-XXXXXXXXXX@g.us
 *   - Your own ID:   XXXXXXXXXXX@c.us   (send to yourself)
 *
 * Both work identically with sendMessage() — the ID format is the only difference.
 */

import pkg           from 'whatsapp-web.js';
import qrcode        from 'qrcode-terminal';
import { paths, env } from '../config/index.js';
import logger         from '../utils/logger.js';

const { Client, LocalAuth } = pkg;

let _client       = null;
let _ready        = false;
let _readyPromise = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initWhatsApp() {
  if (_ready) return;
  if (_readyPromise) return _readyPromise;

  _readyPromise = new Promise((resolve, reject) => {
    _client = new Client({
      authStrategy: new LocalAuth({ dataPath: paths.waAuth }),
      puppeteer: { headless: true, args: ['--no-sandbox'] },
    });

    _client.on('qr', (qr) => {
      logger.info('[whatsapp] Scan the QR code below with your WhatsApp app:');
      qrcode.generate(qr, { small: true });
    });

    _client.on('ready', () => {
      _ready = true;
      logger.info('[whatsapp] ✓ WhatsApp client ready');
      resolve();
    });

    _client.on('auth_failure', (msg) => {
      logger.error('[whatsapp] Auth failure:', msg);
      reject(new Error(`WhatsApp auth failed: ${msg}`));
    });

    _client.on('disconnected', (reason) => {
      _ready = false;
      logger.warn('[whatsapp] Disconnected:', reason);
    });

    _client.initialize().catch(reject);
  });

  return _readyPromise;
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Send a notification to the configured recipient (group or self).
 * Uses WHATSAPP_RECIPIENT_ID from env — works for both @g.us and @c.us IDs.
 * @param {string} message
 */
export async function sendNotification(message) {
  if (!_ready || !_client) throw new Error('[whatsapp] Client not ready');

  const recipientId = env.WHATSAPP_RECIPIENT_ID;
  if (!recipientId) throw new Error('[whatsapp] WHATSAPP_RECIPIENT_ID not set in .env');

  await _client.sendMessage(recipientId, message);

  const label = recipientId.endsWith('@g.us') ? 'group' : 'yourself';
  logger.info(`[whatsapp] ✓ Message sent to ${label} (${recipientId})`);
}

// ── Helpers for setup wizard ──────────────────────────────────────────────────

/**
 * Get the WhatsApp ID for the currently logged-in account.
 * Used to let the user send notifications to themselves.
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function getMyId() {
  if (!_ready || !_client) throw new Error('[whatsapp] Client not ready');
  const info = _client.info;
  const id   = info.wid._serialized; // e.g. "905XXXXXXXXX@c.us"
  const name = info.pushname || 'Me';
  return { id, name };
}

/**
 * List all groups the account is in.
 * @returns {Promise<Array<{id:string, name:string}>>}
 */
export async function listGroups() {
  if (!_ready || !_client) throw new Error('[whatsapp] Client not ready');
  const chats = await _client.getChats();
  return chats
    .filter((c) => c.isGroup)
    .map((c) => ({ id: c.id._serialized, name: c.name }));
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

export async function closeWhatsApp() {
  await _client?.destroy();
  _client = null;
  _ready  = false;
  logger.info('[whatsapp] Client closed');
}

// Legacy alias — keeps notifier/index.js working without changes
export { sendNotification as sendToGroup };
