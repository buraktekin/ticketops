/**
 * scripts/inspect.js
 *
 * Debug tool — loads a target URL and prints exactly what the scraper sees.
 * Run this whenever selectors seem wrong or listings come back empty.
 *
 * Usage:
 *   node scripts/inspect.js <url>
 *   node scripts/inspect.js https://www.ticketmaster.com.tr/artist/...
 */

import 'dotenv/config';
import chalk from 'chalk';
import { getBrowser, closeBrowser } from '../src/monitor/poller.js';
import { extractListings, detectPlatform, getWaitSelector } from '../src/monitor/detector.js';
import { sleep } from '../src/utils/retry.js';

const url = process.argv[2];

if (!url) {
  console.error(chalk.red('\nUsage: node scripts/inspect.js <url>\n'));
  process.exit(1);
}

const { name } = detectPlatform(url);
console.log(chalk.cyan(`\n🔍 ticketops inspector`));
console.log(`   Platform  : ${chalk.bold(name)}`);
console.log(`   URL       : ${url}`);
console.log(`   Selector  : ${getWaitSelector(url)}\n`);

const { context } = await getBrowser();
const page = await context.newPage();

console.log('Loading page...');
await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

const waitSel = getWaitSelector(url);
await page.waitForSelector(waitSel, { timeout: 15_000 }).catch(() => {
  console.log(chalk.yellow(`⚠  Wait selector not found: ${waitSel}`));
});

await sleep(2000);

const listings = await extractListings(page, url);

if (listings.length === 0) {
  console.log(chalk.red('\n✗ No listings extracted.\n'));
  console.log('Tip: Run with LOG_LEVEL=debug or check the page HTML manually.');
  console.log('The platform selector may need updating in src/monitor/detector.js\n');
} else {
  console.log(chalk.green(`\n✓ Found ${listings.length} listing(s):\n`));
  listings.forEach((l, i) => {
    console.log(`  ${chalk.bold(String(i + 1).padStart(2))}. dateKey  : ${chalk.cyan(l.dateKey || '(empty)')}`);
    if (l.time)  console.log(`      time    : ${l.time}`);
    if (l.venue) console.log(`      venue   : ${l.venue}`);
    console.log(`      soldOut : ${l.isSoldOut ? chalk.red('YES') : chalk.green('NO')}`);
    console.log('');
  });
}

await page.close();
await closeBrowser();
