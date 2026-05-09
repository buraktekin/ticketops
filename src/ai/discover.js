/**
 * discover.js
 *
 * Discovers the CSS selector schema for any ticket listing page.
 *
 * Uses Claude Haiku (text-only, no images) — fast and extremely cheap.
 * Typical cost: ~$0.0003 per discovery. Runs once per new site, then cached.
 *
 * Sends only the visible text content of the page — no HTML tags, no screenshots.
 * Claude reads the text like a human would and identifies the patterns.
 */

import Anthropic   from '@anthropic-ai/sdk';
import { env }     from '../config/index.js';
import logger      from '../utils/logger.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM = `You are an expert at analysing ticket website HTML to find CSS selectors for event listings.
You always respond with valid JSON only — no markdown, no explanation, no preamble.`;

/**
 * Discover the selector schema for a ticket listing page.
 * Sends page HTML as text to Claude Haiku — no screenshot, no vision.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.html  — full page HTML from Playwright
 * @returns {Promise<Schema>}
 */
export async function discoverSchema({ url, html }) {
  logger.info(`[discover] Analysing page structure for ${url}`);

  // Extract only the body HTML to cut tokens — strip scripts/styles
  const bodyHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .slice(0, 12000); // ~3000 tokens — enough to see the event list pattern

  const prompt = `Analyse this HTML from a ticket listing page (${url}) and return CSS selectors for scraping events.

HTML:
${bodyHtml}

Return this exact JSON — fill in selectors you can actually see in the HTML above:
{
  "listSelector": "CSS selector matching each individual event/concert row",
  "fields": {
    "dateKey": "selector for date text inside a row",
    "time": "selector for time inside a row, or null",
    "venue": "selector for venue/location inside a row, or null",
    "name": "selector for event name inside a row, or null"
  },
  "soldOut": {
    "classContains": "CSS class on the row or a child that means sold-out, or null",
    "textContains": "badge/label text that means sold-out (e.g. Sold Out, Tükendi, Ausverkauft), or null"
  },
  "available": {
    "classContains": "CSS class that means on-sale/available, or null",
    "textContains": "badge/label text that means available (e.g. Satışta, Available, Verfügbar), or null"
  },
  "reserveSelector": "selector of the link or button to click to buy tickets, or null"
}

Rules:
- listSelector is the most important — must match exactly ONE element per event row
- Prefer stable class names over positional selectors (nth-child etc)
- If you cannot find a reliable selector for a field, set it to null`;

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001', // cheapest — text only, no vision needed
    max_tokens: 512,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw     = response.content[0]?.text || '{}';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  let schema;
  try {
    schema = JSON.parse(cleaned);
  } catch {
    throw new Error(`[discover] Invalid JSON from Claude: ${cleaned.slice(0, 200)}`);
  }

  if (!schema.listSelector) {
    throw new Error(`[discover] No listSelector found. Claude returned: ${cleaned.slice(0, 200)}`);
  }

  logger.info(`[discover] ✓ Schema found — listSelector: "${schema.listSelector}"`);
  return schema;
}

/**
 * @typedef {Object} Schema
 * @property {string} listSelector
 * @property {{ dateKey: string|null, time: string|null, venue: string|null, name: string|null }} fields
 * @property {{ classContains: string|null, textContains: string|null }} soldOut
 * @property {{ classContains: string|null, textContains: string|null }} available
 * @property {string|null} reserveSelector
 */
