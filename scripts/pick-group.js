/**
 * scripts/pick-group.js
 *
 * Change the target WhatsApp group without re-running full setup.
 * Shows a numbered list of all your groups, you pick one, WHATSAPP_GROUP_ID
 * is updated in .env automatically.
 *
 * Usage: npm run pick-group
 */

import 'dotenv/config';
import readline from 'readline';
import fs       from 'fs/promises';
import path     from 'path';
import chalk    from 'chalk';
import { fileURLToPath } from 'url';

import { initWhatsApp, listGroups, closeWhatsApp } from '../src/notifier/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = path.resolve(__dirname, '../.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(chalk.cyan('\n🎫  ticketops — pick WhatsApp group\n'));
console.log('Connecting to WhatsApp (scan QR if first time)...\n');

await initWhatsApp();
await new Promise((r) => setTimeout(r, 3000));

const groups = await listGroups();

if (groups.length === 0) {
  console.log(chalk.yellow('No groups found. Make sure your account is in at least one group.'));
  await closeWhatsApp();
  rl.close();
  process.exit(1);
}

console.log(chalk.bold('Your WhatsApp groups:\n'));
groups.forEach((g, i) => {
  console.log(`  ${chalk.bold(String(i + 1).padStart(2))}. ${g.name}`);
});
console.log('');

const pick = await new Promise((resolve) => {
  const retry = () => {
    rl.question(`Pick a group (1–${groups.length}): `, (ans) => {
      const n = parseInt(ans.trim(), 10);
      if (n >= 1 && n <= groups.length) return resolve(groups[n - 1]);
      console.log(chalk.red(`  Enter a number between 1 and ${groups.length}.`));
      retry();
    });
  };
  retry();
});

// Update WHATSAPP_GROUP_ID in .env
let envRaw = '';
try {
  envRaw = await fs.readFile(ENV_PATH, 'utf-8');
} catch {
  console.log(chalk.yellow('.env not found — creating it'));
}

if (envRaw.includes('WHATSAPP_GROUP_ID=')) {
  envRaw = envRaw.replace(/^WHATSAPP_GROUP_ID=.*/m, `WHATSAPP_GROUP_ID=${pick.id}`);
} else {
  envRaw += `\nWHATSAPP_GROUP_ID=${pick.id}\n`;
}

await fs.writeFile(ENV_PATH, envRaw);

console.log(chalk.green(`\n✓ Group set to: ${pick.name}`));
console.log(chalk.green(`✓ .env updated`));
console.log(chalk.gray('\nRun `npm run test-notify` to confirm it works.\n'));

await closeWhatsApp();
rl.close();
