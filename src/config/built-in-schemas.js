/**
 * built-in-schemas.js
 *
 * Known schemas confirmed from real devtools inspection.
 * These never require Claude — zero API cost.
 *
 * Adding a new known site: add an entry to BUILT_IN_SCHEMAS.
 * match() is tested against the target URL.
 */

export const BUILT_IN_SCHEMAS = [

  {
    name: 'biletix',
    match: (url) => url.includes('biletix.com'),
    schema: {
      listSelector: '.performance-listing',
      fields: {
        dateKey: '.date-box',
        time:    null,
        venue:   '.performance-listing-venue',
        name:    'span.event-name',
      },
      soldOut: {
        classContains: 'status-sold-out',
        textContains:  'Tükendi',
      },
      available: {
        classContains: 'status success',
        textContains:  'Satışta',
      },
      reserveSelector: 'a.chevron-right, .buy-button, a[href*="/etkinlik/"]',
    },
  },

];

/**
 * Find a built-in schema for a URL, or null if unknown.
 * @param {string} url
 * @returns {{ name: string, schema: object } | null}
 */
export function findBuiltInSchema(url) {
  return BUILT_IN_SCHEMAS.find((entry) => entry.match(url)) ?? null;
}
