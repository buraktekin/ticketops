/**
 * scripts/inspect.js
 *
 * Debug tool — loads a page, discovers its schema (or uses built-in),
 * and shows exactly what the scraper extracts.
 *
 * Run this on any new URL before adding it to targets.json.
 *
 * Usage:
 *   node scripts/inspect.js <url>
 *   node scripts/inspect.js https://www.eventim.de/artist/coldplay/
 */

import 'dotenv/config';
import chalk from 'chalk';
import { loadPage, closeBrowser, getBrowser } from '../src/monitor/poller.js';
import { extractListings }    from '../src/monitor/detector.js';
import { discoverSchema }     from '../src/ai/discover.js';
import { findBuiltInSchema }  from '../src/config/built-in-schemas.js';
import { loadSchema, saveSchema } from '../src/config/schema-store.js';
import { slugify }            from '../src/utils/slugify.js';

const url = process.argv[2];
if (!url) { console.error(chalk.red('\nUsage: node scripts/inspect.js <url>\n')); process.exit(1); }

console.log(chalk.cyan(`\n🔍 ticketops inspector\n   ${url}\n`));

// ── Get or discover schema ────────────────────────────────────────────────────

let schema;
let source;

const builtIn = findBuiltInSchema(url);
if (builtIn) {
  schema = builtIn.schema;
  source = `built-in (${builtIn.name})`;
} else {
  const targetId = slugify(url.split('/').filter(Boolean).pop() || 'unknown');
  const cached   = await loadSchema(targetId);

  if (cached) {
    schema = cached;
    source = 'cached';
  } else {
    console.log('Loading page...');
    const { html } = await loadPage(url);

    console.log('Asking Claude Haiku to discover schema (text-only, ~$0.0003)...\n');
    schema = await discoverSchema({ url, html });
    await saveSchema(targetId, schema);
    source = 'claude haiku (just discovered + cached)';
  }
}

console.log(chalk.bold(`Schema source: ${chalk.green(source)}`));
console.log(chalk.bold('listSelector :'), chalk.cyan(schema.listSelector));
console.log(chalk.bold('soldOut      :'), JSON.stringify(schema.soldOut));
console.log(chalk.bold('available    :'), JSON.stringify(schema.available));
console.log('');

// ── Extract listings ──────────────────────────────────────────────────────────

console.log('Extracting listings...\n');
const { context } = await getBrowser();
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
await new Promise(r => setTimeout(r, 2500));

const listings = await extractListings(page, schema);
await page.close();

if (listings.length === 0) {
  console.log(chalk.red('✗ No listings found.'));
  console.log(chalk.gray('  The selector may need adjusting. Check the schema above.\n'));
} else {
  console.log(chalk.green(`✓ Found ${listings.length} listing(s):\n`));
  listings.forEach((l, i) => {
    const status = l.isSoldOut ? chalk.red('SOLD OUT') : chalk.green('AVAILABLE');
    console.log(`  ${chalk.bold(String(i + 1).padStart(2))}. [${status}] ${chalk.cyan(l.dateKey || '(no date)')}`);
    if (l.time)  console.log(`       time  : ${l.time}`);
    if (l.venue) console.log(`       venue : ${l.venue}`);
    console.log('');
  });
}

await closeBrowser();
