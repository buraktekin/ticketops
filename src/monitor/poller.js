import { chromium }           from 'playwright';
import path                   from 'path';
import fs                     from 'fs/promises';
import { paths, env }         from '../config/index.js';
import { extractListings, getWaitSelector, detectPlatform } from './detector.js';
import { retry, sleep }       from '../utils/retry.js';
import logger                 from '../utils/logger.js';

const SESSION_FILE = path.join(paths.sessions, 'biletix.json');

let _browser = null;
let _context = null;

// ── Browser lifecycle ────────────────────────────────────────────────────────

/**
 * Launch (or reuse) a persistent Playwright browser context.
 * Loads a saved session if one exists so Biletix sees you as logged in.
 */
export async function getBrowser() {
  if (_browser && _browser.isConnected()) return { browser: _browser, context: _context };

  logger.info('[poller] Launching Chromium...');

  _browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled', // reduce bot fingerprint
    ],
  });

  // Load saved session if it exists
  let storageState;
  try {
    await fs.access(SESSION_FILE);
    storageState = SESSION_FILE;
    logger.info('[poller] Loaded saved Biletix session');
  } catch {
    logger.warn('[poller] No saved session found — run `npm run login` first for best results');
  }

  _context = await _browser.newContext({
    storageState,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1280, height: 800 },
  });

  return { browser: _browser, context: _context };
}

/**
 * Save the current browser session to disk so the next launch stays logged in.
 */
export async function saveSession() {
  if (!_context) return;
  await fs.mkdir(paths.sessions, { recursive: true });
  await _context.storageState({ path: SESSION_FILE });
  logger.debug('[poller] Session saved');
}

/**
 * Gracefully close the browser.
 */
export async function closeBrowser() {
  try {
    await saveSession();
    await _browser?.close();
    _browser  = null;
    _context  = null;
    logger.info('[poller] Browser closed');
  } catch (err) {
    logger.warn('[poller] Error closing browser:', err.message);
  }
}

// ── Page polling ─────────────────────────────────────────────────────────────

/**
 * Open a target URL, wait for the Angular event list to render,
 * and return parsed listings + a base64 screenshot for AI confirmation.
 *
 * @param {import('../config/index.js').Target} target
 * @returns {Promise<PollResult>}
 */
export async function pollTarget(target) {
  return retry(
    async () => {
      const { context } = await getBrowser();
      const page = await context.newPage();

      try {
        const { name: platformName } = detectPlatform(target.url);
        logger.info(`[poller] [${target.id}] Platform: ${platformName}`);

        await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30_000 });

        // Angular needs extra settle time after networkidle
        await sleep(2500);

        const waitSel = getWaitSelector(target.url);
        await page.waitForSelector(waitSel, { timeout: 25_000 }).catch(() => {
          logger.warn(`[poller] [${target.id}] Wait selector ${waitSel} timed out — attempting extraction anyway`);
        });

        await sleep(1000);

        const listings   = await extractListings(page, target.url);
        const screenshot = await page.screenshot({ fullPage: true });

        logger.info(`[poller] [${target.id}] Found ${listings.length} listing(s) [platform: ${platformName}]`);

        return {
          listings,
          screenshotBase64: screenshot.toString('base64'),
          polledAt:         new Date().toISOString(),
        };
      } finally {
        await page.close();
      }
    },
    {
      maxAttempts: env.MAX_RETRIES,
      baseDelayMs: 3000,
      label:       `poll:${target.id}`,
    }
  );
}

/**
 * @typedef {Object} PollResult
 * @property {import('./detector.js').EventSnapshot[]} listings
 * @property {string} screenshotBase64
 * @property {string} polledAt
 */
