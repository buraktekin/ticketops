/**
 * reserver/generic.js
 *
 * Schema-driven reservation flow.
 *
 * Uses the reserveSelector from the discovered schema to click through
 * to the ticket purchase page, then tries multiple strategies to set
 * quantity and add to cart.
 *
 * Works for any website — no site-specific code needed.
 */

import { getBrowser } from '../monitor/poller.js';
import { sleep }       from '../utils/retry.js';
import logger          from '../utils/logger.js';

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.artistName
 * @param {number} opts.maxTickets
 * @param {import('../monitor/detector.js').EventSnapshot} opts.targetEvent
 * @param {import('../ai/discover.js').Schema} opts.schema
 * @returns {Promise<ReservationResult>}
 */
export async function reserveTickets({ url, artistName, maxTickets = 10, targetEvent, schema }) {
  const { context } = await getBrowser();
  const page = await context.newPage();
  const result = { success: false, ticketsReserved: 0, cartUrl: null, error: null };

  try {
    logger.info(`[reserver] Starting for ${artistName} — ${targetEvent.dateKey}`);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await sleep(2000);

    // ── Step 1: click the correct event row ───────────────────────────────────
    const reserveSelector = schema.reserveSelector || schema.listSelector;

    const clicked = await page.evaluate(({ dateKey, sel }) => {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const text = (el.textContent || '').replace(/\s+/g, ' ');
        if (!dateKey || text.includes(dateKey.split(' ')[0])) {
          // Try clicking a link inside, or the element itself
          const link = el.querySelector('a') || el;
          link.click();
          return text.trim().slice(0, 60);
        }
      }
      return null;
    }, { dateKey: targetEvent.dateKey, sel: reserveSelector });

    if (!clicked) throw new Error('Could not find a clickable event row');
    logger.debug(`[reserver] Clicked: "${clicked}"`);

    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
    await sleep(2000);

    // ── Step 2: set quantity ─────────────────────────────────────────────────
    await setQuantity(page, maxTickets);

    // ── Step 3: add to cart ──────────────────────────────────────────────────
    const added = await clickAddToCart(page);
    if (!added) throw new Error('Could not find add-to-cart button');

    await sleep(3000);
    result.success         = true;
    result.ticketsReserved = maxTickets;
    result.cartUrl         = page.url();

    logger.info(`[reserver] ✓ ${maxTickets} tickets added to cart — ${result.cartUrl}`);

  } catch (err) {
    result.error = err.message;
    logger.error(`[reserver] Failed: ${err.message}`);
    try { await page.screenshot({ path: `storage/screenshots/reserver-error-${Date.now()}.png` }); } catch {}
  } finally {
    await page.close();
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setQuantity(page, qty) {
  const strategies = [
    // Dropdown
    async () => {
      const sel = 'select[name*="quantity"], select[id*="quantity"], select[class*="quantity"]';
      if (await page.$(sel)) {
        await page.selectOption(sel, String(Math.min(qty, 10)));
        return true;
      }
    },
    // + button
    async () => {
      const sel = 'button[class*="plus"], button[class*="increase"], .qty-plus, [aria-label*="arttır"]';
      if (await page.$(sel)) {
        for (let i = 0; i < qty - 1; i++) { await page.click(sel); await sleep(250); }
        return true;
      }
    },
    // Number input
    async () => {
      const sel = 'input[type="number"]';
      if (await page.$(sel)) {
        await page.fill(sel, String(Math.min(qty, 10)));
        return true;
      }
    },
  ];

  for (const strategy of strategies) {
    try { if (await strategy()) return true; } catch {}
  }
  logger.warn('[reserver] Could not set quantity — using default');
  return false;
}

async function clickAddToCart(page) {
  const selectors = [
    'button:has-text("Sepete Ekle")',
    'a:has-text("Sepete Ekle")',
    'button:has-text("Add to Cart")',
    'button:has-text("Buy")',
    '[class*="add-to-cart"]',
    '[class*="buy-button"]',
    '.add-to-basket',
    'button[type="submit"]',
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); logger.debug(`[reserver] Cart clicked: ${sel}`); return true; }
    } catch {}
  }
  return false;
}

/**
 * @typedef {Object} ReservationResult
 * @property {boolean}     success
 * @property {number}      ticketsReserved
 * @property {string|null} cartUrl
 * @property {string|null} error
 */
