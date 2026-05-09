/**
 * prompts.js
 *
 * All Claude prompt templates live here so they're easy to tweak
 * without digging through logic files.
 */

/**
 * System prompt for the ticket availability confirmation task.
 */
export const CONFIRMATION_SYSTEM = `You are an expert at reading Turkish concert ticket website screenshots.
You help determine whether a ticket availability change is real or a false positive.
Always respond with valid JSON only — no markdown, no preamble.`;

/**
 * Build the user prompt for Claude Vision to confirm a detected change.
 *
 * @param {string} artistName
 * @param {import('../monitor/detector.js').EventSnapshot[]} changedEvents
 * @param {'newlyAvailable'|'newEvent'} changeType
 */
export function confirmationPrompt(artistName, changedEvents, changeType) {
  const eventList = changedEvents
    .map((e) => `- ${e.dateKey} ${e.time} @ ${e.venue || 'unknown venue'}`)
    .join('\n');

  const changeDesc =
    changeType === 'newlyAvailable'
      ? 'previously sold-out events that now appear to be available'
      : 'new event dates that were not on the page before';

  return `The monitoring bot detected ${changeDesc} for artist "${artistName}" on Biletix.

Detected events:
${eventList}

Look at the attached screenshot of the Biletix page and answer:

1. Are there genuinely available (not sold-out) tickets visible for any of these events?
2. What exact date, time, and venue do you see?
3. Is there any indication of price or ticket category?

Respond with this exact JSON structure:
{
  "confirmed": true | false,
  "reason": "brief explanation",
  "events": [
    {
      "dateKey": "...",
      "date": "human readable date",
      "time": "...",
      "venue": "...",
      "priceHint": "e.g. 850 TL or null if not visible",
      "available": true | false
    }
  ]
}`;
}

/**
 * Build a WhatsApp notification message for confirmed availability.
 *
 * Layout (Option A — agreed):
 *
 *   🎫 BİLET ALARMI! by ticketops
 *
 *   Mahsun Kırmızıgül
 *   📅 3 Haziran 2025 · 21:00
 *   📍 KüçükÇiftlik Park, İstanbul
 *   🏷 Biletix
 *
 *   ✅ 10 bilet sepete eklendi   ← only when reserved
 *   ⏳ Sepet 15 dk geçerli      ← only when reserved
 *
 *   https://biletix.com/...
 *
 * @param {string}  artistName
 * @param {import('../monitor/detector.js').EventSnapshot[]} events
 * @param {string}  url
 * @param {boolean} reservationAttempted
 * @param {number}  ticketsReserved
 */
export function notificationMessage(artistName, events, url, reservationAttempted, ticketsReserved = 10) {
  const lines = [
    `*🎫 BİLET ALARMI!* _by ticketops_`,
    '',
    `*${artistName}*`,
  ];

  for (const ev of events) {
    const timePart  = ev.time  ? ` · ${ev.time}`  : '';
    const cityPart  = ev.city  ? `, ${ev.city}`   : '';

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
