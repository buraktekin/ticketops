import pkg           from 'whatsapp-web.js';
import qrcode         from 'qrcode-terminal';
import { paths, env } from '../config/index.js';
import logger         from '../utils/logger.js';

const { Client, LocalAuth } = pkg;

let _client    = null;
let _ready     = false;
let _readyPromise = null;

/**
 * Initialize the WhatsApp client.
 * On first run, prints a QR code to the terminal — scan with your phone.
 * Subsequent runs reuse the saved session (no QR needed).
 *
 * @returns {Promise<void>}
 */
export async function initWhatsApp() {
  if (_ready) return;
  if (_readyPromise) return _readyPromise;

  _readyPromise = new Promise((resolve, reject) => {
    _client = new Client({
      authStrategy: new LocalAuth({ dataPath: paths.waAuth }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox'],
      },
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

/**
 * Send a message to the configured WhatsApp group.
 * @param {string} message
 */
export async function sendToGroup(message) {
  if (!_ready || !_client) {
    throw new Error('[whatsapp] Client not ready — call initWhatsApp() first');
  }

  const groupId = env.WHATSAPP_GROUP_ID;
  await _client.sendMessage(groupId, message);
  logger.info(`[whatsapp] Message sent to group ${groupId}`);
}

/**
 * List all groups the account is in — useful for finding WHATSAPP_GROUP_ID.
 * @returns {Promise<Array<{id:string, name:string}>>}
 */
export async function listGroups() {
  if (!_ready || !_client) throw new Error('[whatsapp] Client not ready');

  const chats = await _client.getChats();
  return chats
    .filter((c) => c.isGroup)
    .map((c) => ({ id: c.id._serialized, name: c.name }));
}

/**
 * Gracefully destroy the WhatsApp client.
 */
export async function closeWhatsApp() {
  await _client?.destroy();
  _client = null;
  _ready  = false;
  logger.info('[whatsapp] Client closed');
}
