/**
 * poller.js
 *
 * Playwright browser management and page polling.
 * Schema-agnostic — uses whatever schema the caller provides.
 */

import { chromium }    from 'playwright';
import path            from 'path';
import fs              from 'fs/promises';
import { paths, env }  from '../config/index.js';
import { sessionFileFor }  from '../utils/login-helper.js';
import { extractListings } from './detector.js';
import { retry, sleep }    from '../utils/retry.js';
import logger              from '../utils/logger.js';

// Session files are per-domain — resolved at runtime from the target URL

let _browser = null;
let _context = null;

// ── Browser lifecycle ─────────────────────────────────────────────────────────

export async function getBrowser(targetUrl) {
  if (_browser && _browser.isConnected()) return { browser: _browser, context: _context };

  logger.info('[poller] Launching Chromium...');

  _browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  let storageState;
  if (targetUrl) {
    const sessionFile = sessionFileFor(targetUrl);
    try {
      await fs.access(sessionFile);
      storageState = sessionFile;
      logger.info(`[poller] Loaded saved session for ${new URL(targetUrl).hostname}`);
    } catch {
      logger.warn(`[poller] No saved session for ${new URL(targetUrl).hostname} — run \`npm run login\` to enable auto-reserve`);
    }
  }

  _context = await _browser.newContext({
    storageState,
    userAgent:    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:       'tr-TR',
    timezoneId:   'Europe/Istanbul',
    viewport:     { width: 1280, height: 800 },
  });

  return { browser: _browser, context: _context };
}

export async function saveSession() {
  // Sessions are saved during login — nothing to do here
}

export async function closeBrowser() {
  try {
    await saveSession();
    await _browser?.close();
    _browser = null;
    _context = null;
    logger.info('[poller] Browser closed');
  } catch (err) {
    logger.warn('[poller] Error closing browser:', err.message);
  }
}

// ── Page loading ──────────────────────────────────────────────────────────────

/**
 * Load a page and return its full HTML + screenshot.
 * Used for schema discovery (before we know the listSelector).
 *
 * @param {string} url
 * @returns {Promise<{ html: string, screenshotBase64: string }>}
 */
export async function loadPage(url) {
  return retry(async () => {
    const { context } = await getBrowser(url);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      await sleep(2500); // Angular settle time

      const html             = await page.content();
      const screenshotBuffer = await page.screenshot({ fullPage: true });

      return {
        html,
        screenshotBase64: screenshotBuffer.toString('base64'),
      };
    } finally {
      await page.close();
    }
  }, { maxAttempts: env.MAX_RETRIES, baseDelayMs: 3000, label: `load:${url}` });
}

/**
 * Poll a target page using a known schema.
 * Returns extracted listings + screenshot for change detection.
 *
 * @param {import('../config/index.js').Target} target
 * @param {import('../ai/discover.js').Schema}  schema
 * @returns {Promise<PollResult>}
 */
export async function pollTarget(target, schema) {
  return retry(async () => {
    const { context } = await getBrowser(target.url);
    const page = await context.newPage();

    try {
      logger.debug(`[poller] Navigating → ${target.url}`);
      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30_000 });

      // Framework settle time
      await sleep(2500);

      // Wait for the list selector from the schema
      await page.waitForSelector(schema.listSelector, { timeout: 25_000 }).catch(() => {
        logger.warn(`[poller] [${target.id}] listSelector "${schema.listSelector}" timed out`);
      });

      await sleep(500);

      const listings         = await extractListings(page, schema);
      const screenshotBuffer = await page.screenshot({ fullPage: true });

      logger.info(`[poller] [${target.id}] Found ${listings.length} listing(s)`);

      return {
        listings,
        screenshotBase64: screenshotBuffer.toString('base64'),
        polledAt:         new Date().toISOString(),
      };
    } finally {
      await page.close();
    }
  }, { maxAttempts: env.MAX_RETRIES, baseDelayMs: 3000, label: `poll:${target.id}` });
}

/**
 * @typedef {Object} PollResult
 * @property {import('./detector.js').EventSnapshot[]} listings
 * @property {string} screenshotBase64
 * @property {string} polledAt
 */
