/**
 * prompts.js — all Claude prompt templates
 */

// ── Schema discovery ──────────────────────────────────────────────────────────

export const DISCOVERY_SYSTEM = `You are an expert web scraper analyst.
You look at ticket website screenshots and HTML, and return precise CSS selectors
for extracting event listing data.
Always respond with valid JSON only — no markdown, no explanation, no preamble.`;

/**
 * Prompt Claude Vision to discover the selector schema for a ticket page.
 * @param {string} url
 * @param {string} htmlSnippet  — first ~8000 chars of page HTML
 */
export function discoveryPrompt(url, htmlSnippet) {
  return `Analyze this ticket listing page (${url}) and return a JSON schema for scraping it.

HTML snippet:
\`\`\`html
${htmlSnippet}
\`\`\`

Return this exact JSON structure (fill in real CSS selectors you find in the HTML):
{
  "listSelector": "CSS selector for each individual event/concert row",
  "fields": {
    "dateKey": "CSS selector for date text inside a row (day + month)",
    "time": "CSS selector for time inside a row, or null if not present",
    "venue": "CSS selector for venue/location inside a row",
    "name": "CSS selector for event/artist name inside a row, or null"
  },
  "soldOut": {
    "classContains": "CSS class name that indicates sold-out on the row element, or null",
    "textContains": "text content of a badge/chip that means sold-out (e.g. Tükendi), or null"
  },
  "available": {
    "classContains": "CSS class name that indicates available/on-sale, or null",
    "textContains": "text content of a badge/chip that means available (e.g. Satışta), or null"
  },
  "reserveSelector": "CSS selector of the link/button to click to go to the ticket purchase page, or null"
}

Rules:
- Use the most specific but stable selectors (prefer class names over tag positions)
- If a field is not visible in the HTML, set it to null
- listSelector is the most important — it must match exactly one element per event row
- soldOut and available: check for CSS classes on the row OR badge text content`;
}

// ── WhatsApp notification ─────────────────────────────────────────────────────

/**
 * Agreed layout (Option A):
 *
 *   🎫 BİLET ALARMI! by ticketops
 *
 *   Artist Name
 *   📅 3 Haziran 2025 · 21:00
 *   📍 KüçükÇiftlik Park, İstanbul
 *
 *   ✅ 10 bilet sepete eklendi   ← only when reserved
 *   ⏳ Sepet 15 dk geçerli      ← only when reserved
 *
 *   https://...
 */
export function notificationMessage(artistName, events, url, reservationAttempted, ticketsReserved = 10) {
  const lines = [
    `*🎫 BİLET ALARMI!* _by ticketops_`,
    '',
    `*${artistName}*`,
  ];

  for (const ev of events) {
    const timePart = ev.time  ? ` · ${ev.time}`  : '';
    const cityPart = ev.city  ? `, ${ev.city}`   : '';
    if (ev.dateKey) lines.push(`📅 *${ev.dateKey}*${timePart}`);
    if (ev.venue)   lines.push(`📍 ${ev.venue}${cityPart}`);
  }

  lines.push('');

  if (reservationAttempted) {
    lines.push(`✅ *${ticketsReserved} bilet sepete eklendi*`);
    lines.push('⏳ Sepet 15 dk geçerli');
    lines.push('');
  }

  lines.push(url);
  return lines.join('\n');
}
