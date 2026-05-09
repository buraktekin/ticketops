/**
 * scripts/login.js
 *
 * Opens a visible browser at the target site so you can log in manually.
 * Session is saved per-domain — biletix.com and eventim.de are separate.
 *
 * Usage:
 *   npm run login                          ← uses first enabled target in targets.json
 *   node scripts/login.js <url>            ← opens that specific site
 *   node scripts/login.js eventim.de       ← finds that target in targets.json
 */

import 'dotenv/config';
import fs      from 'fs/promises';
import path    from 'path';
import chalk   from 'chalk';
import { fileURLToPath } from 'url';
import { runLogin } from '../src/utils/login-helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── Resolve which URL to log into ────────────────────────────────────────────

let targetUrl = process.argv[2];

if (!targetUrl) {
  // No arg — use first enabled target from targets.json
  let targets = [];
  try {
    targets = JSON.parse(await fs.readFile(path.join(ROOT, 'targets.json'), 'utf-8'));
  } catch {
    console.error(chalk.red('\nNo targets.json found. Run `npm run setup` first or pass a URL:\n'));
    console.error('  node scripts/login.js https://www.eventim.de/...\n');
    process.exit(1);
  }

  const active = targets.filter((t) => t.enabled);
  if (active.length === 0) {
    console.error(chalk.red('\nNo enabled targets in targets.json.\n'));
    process.exit(1);
  }

  if (active.length === 1) {
    targetUrl = active[0].url;
  } else {
    // Multiple targets — show a pick list
    const readline = (await import('readline')).default;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log(chalk.cyan('\nWhich site do you want to log into?\n'));
    active.forEach((t, i) => {
      const hostname = new URL(t.url).hostname;
      console.log(`  ${chalk.bold(i + 1)}. ${t.name}  ${chalk.gray(hostname)}`);
    });
    console.log('');

    targetUrl = await new Promise((resolve) => {
      const retry = () => rl.question(`Pick (1–${active.length}): `, (ans) => {
        const n = parseInt(ans.trim(), 10);
        if (n >= 1 && n <= active.length) { rl.close(); return resolve(active[n - 1].url); }
        console.log(chalk.red(`  Enter a number between 1 and ${active.length}.`));
        retry();
      });
      retry();
    });
  }
}

// Handle shorthand like "eventim.de" — find in targets.json
if (!targetUrl.startsWith('http')) {
  let targets = [];
  try { targets = JSON.parse(await fs.readFile(path.join(ROOT, 'targets.json'), 'utf-8')); } catch {}
  const match = targets.find((t) => t.url.includes(targetUrl));
  if (match) {
    targetUrl = match.url;
  } else {
    console.error(chalk.red(`\nNo target found matching "${targetUrl}".\n`));
    process.exit(1);
  }
}

await runLogin(targetUrl);
console.log('\nYou can now run `npm start` to begin monitoring.\n');
