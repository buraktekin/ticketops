/**
 * slugify.js
 *
 * Converts any string (including Turkish characters) to a clean URL/ID slug.
 *
 * Turkish → Latin transliteration:
 *   ş→s  ğ→g  ı→i  İ→i  ö→o  ü→u  ç→c  (and uppercase variants)
 *
 * Examples:
 *   "Şebnem Ferah"      → "sebnem-ferah"
 *   "Mahsun Kırmızıgül" → "mahsun-kirmizigul"
 *   "Fred Again.."      → "fred-again"
 */

const TR_MAP = {
  'ş': 's', 'Ş': 's',
  'ğ': 'g', 'Ğ': 'g',
  'ı': 'i', 'İ': 'i',
  'ö': 'o', 'Ö': 'o',
  'ü': 'u', 'Ü': 'u',
  'ç': 'c', 'Ç': 'c',
};

/**
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return str
    .split('').map((c) => TR_MAP[c] ?? c).join('')  // transliterate Turkish chars
    .toLowerCase()
    .replace(/\s+/g, '-')        // spaces → hyphens
    .replace(/[^a-z0-9-]/g, '') // strip anything not alphanumeric or hyphen
    .replace(/-+/g, '-')         // collapse multiple hyphens
    .replace(/^-|-$/g, '');      // trim leading/trailing hyphens
}
