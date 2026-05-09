/**
 * login-helper.js
 *
 * Opens a visible browser window at the given URL so the user can log in manually.
 * Saves the session keyed by hostname — so biletix.com and eventim.de sessions
 * are stored separately and don't overwrite each other.
 *
 * @param {string} targetUrl  — the artist/event page URL (used to extract hostname)
 */

import { chromium } from 'playwright';
import readline     from 'readline';
import fs           from 'fs/promises';
import path         from 'path';
import chalk        from 'chalk';
import { paths }    from '../config/index.js';

export function sessionFileFor(url) {
  const hostname = new URL(url).hostname; // e.g. "www.eventim.de"
  return path.join(paths.sessions, `${hostname}.json`);
}

export async function runLogin(targetUrl) {
  const hostname    = new URL(targetUrl).hostname;
  const sessionFile = sessionFileFor(targetUrl);
  const rootUrl     = new URL(targetUrl).origin; // e.g. https://www.eventim.de

  await fs.mkdir(paths.sessions, { recursive: true });

  console.log(chalk.cyan(`\n🔑 Login — ${hostname}\n`));
  console.log(`A browser window will open at ${chalk.bold(rootUrl)}`);
  console.log(`Log into your account, then come back here and press ${chalk.green('Enter')} to save the session.\n`);

  const browser = await chromium.launch({
    headless: false,
    args:     ['--no-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    viewport:   { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });

  console.log(chalk.yellow(`→ Browser opened at ${rootUrl}`));
  console.log('  Log in, then press Enter here...\n');

  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Press Enter when logged in: ', () => { rl.close(); resolve(); });
  });

  await context.storageState({ path: sessionFile });
  await browser.close();

  console.log(chalk.green(`\n✓ Session saved for ${hostname}`));
  return sessionFile;
}
