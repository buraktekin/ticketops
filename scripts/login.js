/**
 * scripts/login.js
 *
 * Opens a visible Chromium window so you can log into Biletix manually.
 * Once you're logged in and see the homepage, press Enter in the terminal
 * and the session (cookies + localStorage) will be saved.
 *
 * After this, the main monitor will use the saved session and Biletix
 * will see you as a logged-in user.
 *
 * Usage: npm run login
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import readline      from 'readline';
import path          from 'path';
import fs            from 'fs/promises';
import { fileURLToPath } from 'url';
import chalk         from 'chalk';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.resolve(__dirname, '../storage/sessions/biletix.json');

await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });

console.log(chalk.cyan('\n🔑  Biletix Login Helper\n'));
console.log('A browser window will open. Log into your Biletix account.');
console.log('When you\'re done, come back here and press ' + chalk.green('Enter') + ' to save the session.\n');

const browser = await chromium.launch({
  headless: false, // visible window for manual login
  args: ['--no-sandbox'],
});

const context = await browser.newContext({
  userAgent:    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  locale:       'tr-TR',
  timezoneId:   'Europe/Istanbul',
  viewport:     { width: 1280, height: 800 },
});

const page = await context.newPage();
await page.goto('https://www.biletix.com/anasayfa/TURKIYE/tr', { waitUntil: 'domcontentloaded' });

console.log(chalk.yellow('→ Browser opened at biletix.com'));
console.log('  Log in, then press Enter here...\n');

// Wait for user to press Enter
await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Press Enter when logged in: ', () => { rl.close(); resolve(); });
});

// Save session
await context.storageState({ path: SESSION_FILE });
await browser.close();

console.log(chalk.green(`\n✓ Session saved to ${SESSION_FILE}`));
console.log('  You can now run `npm start` or `npm run pm2:start`\n');
