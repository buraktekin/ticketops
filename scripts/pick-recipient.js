/**
 * scripts/pick-recipient.js
 *
 * Change where alerts are sent without re-running full setup.
 * Choose between sending to yourself or a group.
 * Updates WHATSAPP_RECIPIENT_ID in .env automatically.
 *
 * Usage: npm run pick-recipient
 */

import 'dotenv/config';
import readline from 'readline';
import fs       from 'fs/promises';
import path     from 'path';
import chalk    from 'chalk';
import { fileURLToPath } from 'url';

import { initWhatsApp, listGroups, getMyId, closeWhatsApp } from '../src/notifier/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = path.resolve(__dirname, '../.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function pickFromList(prompt, max) {
  return new Promise((resolve) => {
    const retry = () => rl.question(prompt, (ans) => {
      const n = parseInt(ans.trim(), 10);
      if (n >= 1 && n <= max) return resolve(n);
      console.log(chalk.red(`  Enter a number between 1 and ${max}.`));
      retry();
    });
    retry();
  });
}

console.log(chalk.cyan('\n🎫  ticketops — pick alert recipient\n'));
console.log('Connecting to WhatsApp (scan QR if first time)...\n');

await initWhatsApp();
await new Promise((r) => setTimeout(r, 3000));

const me = await getMyId();

console.log(chalk.bold('Where should ticket alerts be sent?\n'));
console.log(`   ${chalk.bold('1.')} Just me  ${chalk.gray(`(${me.name})`)}`);
console.log(`   ${chalk.bold('2.')} A group`);
console.log('');

const choice = await pickFromList('Pick (1 or 2): ', 2);

let recipient;

if (choice === 1) {
  recipient = { id: me.id, label: `yourself (${me.name})` };
} else {
  console.log('\nFetching your groups...');
  const groups = await listGroups();

  if (groups.length === 0) {
    console.log(chalk.yellow('No groups found — keeping current setting.'));
    await closeWhatsApp(); rl.close(); process.exit(0);
  }

  console.log('\n' + chalk.bold('Your WhatsApp groups:\n'));
  groups.forEach((g, i) => console.log(`   ${chalk.bold(String(i + 1).padStart(2))}. ${g.name}`));
  console.log('');

  const n = await pickFromList(`Pick a group (1–${groups.length}): `, groups.length);
  recipient = { id: groups[n - 1].id, label: groups[n - 1].name };
}

// Update .env
let envRaw = '';
try   { envRaw = await fs.readFile(ENV_PATH, 'utf-8'); }
catch { console.log(chalk.yellow('.env not found — creating it')); }

if (envRaw.includes('WHATSAPP_RECIPIENT_ID=')) {
  envRaw = envRaw.replace(/^WHATSAPP_RECIPIENT_ID=.*/m, `WHATSAPP_RECIPIENT_ID=${recipient.id}`);
} else if (envRaw.includes('WHATSAPP_GROUP_ID=')) {
  // migrate old key name
  envRaw = envRaw.replace(/^WHATSAPP_GROUP_ID=.*/m, `WHATSAPP_RECIPIENT_ID=${recipient.id}`);
} else {
  envRaw += `\nWHATSAPP_RECIPIENT_ID=${recipient.id}\n`;
}

await fs.writeFile(ENV_PATH, envRaw);

console.log(chalk.green(`\n✓ Alerts will go to: ${recipient.label}`));
console.log(chalk.green('✓ .env updated'));
console.log(chalk.gray('\nRun `npm run test-notify` to confirm.\n'));

await closeWhatsApp();
rl.close();
