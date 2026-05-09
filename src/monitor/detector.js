/**
 * detector.js
 *
 * Schema-driven event listing extractor.
 *
 * Instead of hardcoded platform adapters, this module uses a Schema
 * object (discovered by Claude, cached per target) to extract listings
 * from any ticket website generically.
 *
 * Schema is discovered automatically on first run for any new URL.
 * Zero API calls on subsequent polls.
 */

/**
 * Extract event listings from a Playwright page using a discovered schema.
 *
 * @param {import('playwright').Page} page
 * @param {import('../ai/discover.js').Schema} schema
 * @returns {Promise<EventSnapshot[]>}
 */
export async function extractListings(page, schema) {
  const rows = await page.$$(schema.listSelector).catch(() => []);
  if (rows.length === 0) return [];

  const results = await page.$$eval(
    schema.listSelector,
    (els, sch) => els.map((el) => {

      // ── Field extraction ────────────────────────────────────────────────────
      function getText(selector) {
        if (!selector) return '';
        const node = el.querySelector(selector);
        return (node?.textContent || '').replace(/\s+/g, ' ').trim();
      }

      const dateKey = getText(sch.fields.dateKey);
      const time    = getText(sch.fields.time);
      const venue   = getText(sch.fields.venue);
      const name    = getText(sch.fields.name);

      // ── Sold-out detection ──────────────────────────────────────────────────
      // Strategy 1: check a CSS class on the row or any child element
      let isSoldOut = false;

      if (sch.soldOut.classContains) {
        const allEls = [el, ...el.querySelectorAll('*')];
        isSoldOut = allEls.some((e) =>
          e.className && typeof e.className === 'string' &&
          e.className.includes(sch.soldOut.classContains)
        );
      }

      // Strategy 2: check badge/chip text
      if (!isSoldOut && sch.soldOut.textContains) {
        isSoldOut = el.textContent.includes(sch.soldOut.textContains);
      }

      return { dateKey, time, venue, name, isSoldOut, rawHtml: el.outerHTML.slice(0, 600) };
    }),
    schema,
  ).catch(() => []);

  // Filter out empty rows (no date = garbage element)
  return results.filter((r) => r.dateKey.length > 0);
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
      if (!curr.isSoldOut) newEvents.push(curr);
      continue;
    }

    if (prev.isSoldOut && !curr.isSoldOut) newlyAvailable.push(curr);
  }

  return { newlyAvailable, newEvents };
}

/**
 * @typedef {Object} EventSnapshot
 * @property {string}  dateKey
 * @property {string}  time
 * @property {string}  venue
 * @property {string}  [name]
 * @property {boolean} isSoldOut
 * @property {string}  rawHtml
 */

/**
 * @typedef {Object} DetectedChanges
 * @property {EventSnapshot[]} newlyAvailable
 * @property {EventSnapshot[]} newEvents
 */
