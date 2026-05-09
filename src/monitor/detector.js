/**
 * detector.js
 *
 * Platform-aware event listing extractor + change detector.
 *
 * Supported platforms (auto-detected from URL):
 *   biletix.com  — Angular app, same structure on both /artist/ and /etkinlik/ pages.
 *
 * Real HTML structure (confirmed from devtools):
 *
 *   div.performance-listing
 *     div.date-box                        ← "3 Haziran", "22 Mayıs"
 *     div.divider
 *     div[fxlayout="column"]
 *       div.info-group[fxlayout="row"]
 *         span.event-name                 ← "Şebnem Ferah"
 *         mat-basic-chip.status.success          ← "Satışta"  (ON SALE)
 *         mat-basic-chip.status.status-sold-out  ← "Tükendi"  (SOLD OUT)
 *       div.performance-listing-venue     ← "KüçükÇiftlik Park, İstanbul"
 */

// ── Platform definitions ──────────────────────────────────────────────────────

const PLATFORMS = {

  biletix: {
    match: (url) => url.includes('biletix.com'),

    // Wait for at least one .performance-listing to appear.
    // Works on both /artist/ and /etkinlik/ — no btx-performance-list needed.
    waitSelector: '.performance-listing',

    listSelector: '.performance-listing',

    extractor: (els) => els.map((el) => {
      // ── Date ───────────────────────────────────────────────────────────────
      const dateBox = el.querySelector('.date-box');
      const dateKey = (dateBox?.textContent || '').replace(/\s+/g, ' ').trim();

      // ── Time ───────────────────────────────────────────────────────────────
      const timeEl = el.querySelector('[class*="time"], .time, .saat');
      const time   = (timeEl?.textContent || '').trim();

      // ── Event name ─────────────────────────────────────────────────────────
      const nameEl = el.querySelector('span.event-name, [class*="event-name"]');
      const name   = (nameEl?.textContent || '').trim();

      // ── Venue ──────────────────────────────────────────────────────────────
      const venueEl = el.querySelector('.performance-listing-venue, [class*="venue"]');
      const venue   = (venueEl?.textContent || '').replace(/\s+/g, ' ').trim();

      // ── Sold-out detection ─────────────────────────────────────────────────
      // On sale:   mat-basic-chip has class "status success"
      // Sold out:  mat-basic-chip has class "status-sold-out"
      const chip    = el.querySelector('mat-basic-chip, [class*="mat-basic-chip"]');
      const chipCls = chip?.className || '';
      const isSoldOut =
        chipCls.includes('status-sold-out') ||
        (chip?.textContent || '').trim().toLowerCase() === 'tükendi';

      return {
        dateKey,
        time,
        name,
        venue,
        isSoldOut,
        rawHtml: el.outerHTML.slice(0, 800),
      };
    }),
  },

};

// ── Fallback ──────────────────────────────────────────────────────────────────

const FALLBACK = {
  waitSelector: 'body',
  listSelector: '[class*="performance"], [class*="event-list"] li, [class*="listing"] li',
  extractor: (els) => els.map((el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      dateKey:   text.slice(0, 60),
      time:      '',
      name:      '',
      venue:     '',
      isSoldOut: text.toLowerCase().includes('tükendi') || text.toLowerCase().includes('sold out'),
      rawHtml:   el.outerHTML.slice(0, 400),
    };
  }),
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect platform from URL.
 * @param {string} url
 * @returns {{ name: string, platform: object }}
 */
export function detectPlatform(url) {
  for (const [name, platform] of Object.entries(PLATFORMS)) {
    if (platform.match(url)) return { name, platform };
  }
  return { name: 'generic', platform: FALLBACK };
}

/**
 * Get the wait selector appropriate for this URL.
 * @param {string} url
 * @returns {string}
 */
export function getWaitSelector(url) {
  return detectPlatform(url).platform.waitSelector;
}

/**
 * Extract event listings from a Playwright page.
 * @param {import('playwright').Page} page
 * @param {string} url
 * @returns {Promise<EventSnapshot[]>}
 */
export async function extractListings(page, url) {
  const { name, platform } = detectPlatform(url);

  const count = await page.$$(platform.listSelector).then((els) => els.length).catch(() => 0);

  if (count === 0) {
    return [];
  }

  const results = await page.$$eval(platform.listSelector, platform.extractor).catch(() => []);

  // Filter out empty rows (no date key = garbage element)
  const valid = results.filter((r) => r.dateKey.length > 0);

  return valid;
}

/**
 * Compare two snapshots and return what changed.
 * @param {EventSnapshot[]} previous
 * @param {EventSnapshot[]} current
 * @returns {DetectedChanges}
 */
export function detectChanges(previous, current) {
  const prevMap = new Map(previous.map((e) => [e.dateKey, e]));

  const newlyAvailable = [];
  const newEvents      = [];

  for (const curr of current) {
    if (!curr.dateKey) continue;
    const prev = prevMap.get(curr.dateKey);

    if (!prev) {
      // New date appeared and it's not sold out
      if (!curr.isSoldOut) newEvents.push(curr);
      continue;
    }

    // Was sold out, now it's not
    if (prev.isSoldOut && !curr.isSoldOut) {
      newlyAvailable.push(curr);
    }
  }

  return { newlyAvailable, newEvents };
}

/**
 * @typedef {Object} EventSnapshot
 * @property {string}  dateKey    — e.g. "3 Haziran"
 * @property {string}  time       — e.g. "21:00"
 * @property {string}  name       — artist/event name
 * @property {string}  venue      — e.g. "KüçükÇiftlik Park, İstanbul"
 * @property {boolean} isSoldOut
 * @property {string}  rawHtml
 */

/**
 * @typedef {Object} DetectedChanges
 * @property {EventSnapshot[]} newlyAvailable  — was sold-out, now available
 * @property {EventSnapshot[]} newEvents        — brand new date, not sold-out
 */
