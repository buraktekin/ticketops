import { getBrowser } from '../monitor/poller.js';
import { sleep }       from '../utils/retry.js';
import logger          from '../utils/logger.js';

/**
 * Attempt to reserve tickets for a Biletix event.
 *
 * Strategy:
 *   1. Open the artist event page
 *   2. Click the first available (non-sold-out) listing
 *   3. On the ticket selection page, set quantity to maxTickets
 *   4. Click "Sepete Ekle" (Add to Cart) — does NOT proceed to payment
 *   5. Return success/failure
 *
 * NOTE: Biletix cart holds tickets for ~15 minutes. The human must
 *       complete the purchase within that window.
 *
 * @param {object} opts
 * @param {string} opts.url           - artist event page URL
 * @param {string} opts.artistName
 * @param {number} opts.maxTickets    - max tickets to reserve (default 10)
 * @param {import('../monitor/detector.js').EventSnapshot} opts.targetEvent
 * @returns {Promise<ReservationResult>}
 */
export async function reserveTickets({ url, artistName, maxTickets = 10, targetEvent }) {
  const { context } = await getBrowser();
  const page = await context.newPage();

  const result = { success: false, ticketsReserved: 0, cartUrl: null, error: null };

  try {
    logger.info(`[reserver] Starting reservation for ${artistName} — target: ${targetEvent.dateKey}`);

    // ── Step 1: Navigate to artist page ──────────────────────────────────────
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForSelector('.performance-listing:not(.sold-out)', { timeout: 15_000 });

    // ── Step 2: Find and click the correct available event ───────────────────
    // Try to match the specific date we detected, fall back to first available
    const clicked = await page.evaluate((dateKey) => {
      const listings = document.querySelectorAll('.performance-listing:not(.sold-out)');
      for (const el of listings) {
        const dateBox = el.querySelector('.date-box');
        const text    = (dateBox?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!dateKey || text.includes(dateKey.split(' ')[0])) {
          el.click();
          return text;
        }
      }
      // Fallback: click first available
      if (listings[0]) { listings[0].click(); return 'first available'; }
      return null;
    }, targetEvent?.dateKey || '');

    if (!clicked) {
      throw new Error('Could not find a clickable available event listing');
    }

    logger.debug(`[reserver] Clicked event: "${clicked}"`);

    // Wait for navigation to ticket selection page
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20_000 });
    await sleep(2000);

    // ── Step 3: Select ticket quantity ────────────────────────────────────────
    // Biletix typically has a quantity dropdown or +/- buttons
    const qtySet = await setQuantity(page, maxTickets);
    if (!qtySet) {
      logger.warn('[reserver] Could not set quantity — proceeding with default');
    }

    // ── Step 4: Add to cart ───────────────────────────────────────────────────
    const addedToCart = await clickAddToCart(page);
    if (!addedToCart) {
      throw new Error('Could not find or click "Sepete Ekle" button');
    }

    // Wait for cart confirmation
    await sleep(3000);

    result.success         = true;
    result.ticketsReserved = maxTickets;
    result.cartUrl         = page.url();

    logger.info(`[reserver] ✓ ${maxTickets} tickets added to cart. Cart URL: ${result.cartUrl}`);

  } catch (err) {
    result.error = err.message;
    logger.error(`[reserver] Reservation failed: ${err.message}`);
    // Take a screenshot for debugging
    try {
      await page.screenshot({ path: `storage/screenshots/reservation-error-${Date.now()}.png` });
    } catch {}
  } finally {
    await page.close();
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Try multiple strategies to set the ticket quantity on a Biletix page.
 * Returns true if any strategy succeeded.
 */
async function setQuantity(page, qty) {
  // Strategy A: select/dropdown with common selector patterns
  try {
    const dropdownSel = 'select[name*="quantity"], select[id*="quantity"], select[class*="quantity"], .ticket-quantity select';
    if (await page.$(dropdownSel)) {
      await page.selectOption(dropdownSel, String(Math.min(qty, 10)));
      logger.debug('[reserver] Quantity set via dropdown');
      return true;
    }
  } catch {}

  // Strategy B: + button click loop
  try {
    const plusSel = 'button[aria-label*="arttır"], button[class*="plus"], button[class*="increase"], .qty-plus';
    if (await page.$(plusSel)) {
      for (let i = 0; i < qty - 1; i++) {
        await page.click(plusSel);
        await sleep(300);
      }
      logger.debug('[reserver] Quantity set via + button');
      return true;
    }
  } catch {}

  // Strategy C: direct input field
  try {
    const inputSel = 'input[type="number"][name*="qty"], input[type="number"][class*="quantity"]';
    if (await page.$(inputSel)) {
      await page.fill(inputSel, String(Math.min(qty, 10)));
      logger.debug('[reserver] Quantity set via input field');
      return true;
    }
  } catch {}

  return false;
}

/**
 * Find and click the "Add to Cart" / "Sepete Ekle" button.
 */
async function clickAddToCart(page) {
  const selectors = [
    'button:has-text("Sepete Ekle")',
    'button:has-text("Sepete Ekle")',
    'a:has-text("Sepete Ekle")',
    'button[class*="add-to-cart"]',
    'button[class*="buy"]',
    '.add-to-basket',
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        logger.debug(`[reserver] Clicked add-to-cart via selector: ${sel}`);
        return true;
      }
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
