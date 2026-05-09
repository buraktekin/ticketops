/**
 * scripts/setup.js
 *
 * Interactive setup wizard. Run once after cloning.
 *
 * Flow:
 *   1. Basic config (artist, URL, poll interval, auto-reserve)
 *   2. Connect WhatsApp — show QR if first time
 *   3. Choose: send to yourself OR pick a group
 *   4. Write .env + targets.json
 */

import 'dotenv/config';
import readline from 'readline';
import fs       from 'fs/promises';
import path     from 'path';
import chalk    from 'chalk';
import { fileURLToPath } from 'url';

import { initWhatsApp, listGroups, getMyId, closeWhatsApp } from '../src/notifier/whatsapp.js';
import { runLogin } from '../src/utils/login-helper.js';
import { slugify } from '../src/utils/slugify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── Readline helpers ──────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, fallback = '') {
  return new Promise((resolve) => {
    rl.question(question, (ans) => resolve(ans.trim() || fallback));
  });
}

function askRequired(question) {
  return new Promise((resolve) => {
    const retry = () => rl.question(question, (ans) => {
      if (ans.trim()) return resolve(ans.trim());
      console.log(chalk.red('  This field is required.'));
      retry();
    });
    retry();
  });
}

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

// ── WhatsApp recipient picker ─────────────────────────────────────────────────

async function pickRecipient() {
  console.log('\n' + chalk.cyan('── WhatsApp ──────────────────────────────────────'));
  console.log('Connecting to WhatsApp...');
  console.log(chalk.gray('Scan the QR code below if this is your first time.\n'));

  await initWhatsApp();
  await new Promise((r) => setTimeout(r, 3000));

  // ── Step A: self or group? ───────────────────────────────────────────────────
  const me = await getMyId();

  console.log('\n' + chalk.bold('Where should ticket alerts be sent?\n'));
  console.log(`   ${chalk.bold('1.')} Just me  ${chalk.gray(`(${me.name} — only you see the alerts)`)}`);
  console.log(`   ${chalk.bold('2.')} A group  ${chalk.gray('(everyone in the group sees the alerts)')}`);
  console.log('');

  const choice = await pickFromList('Pick (1 or 2): ', 2);

  // ── Option 1: myself ─────────────────────────────────────────────────────────
  if (choice === 1) {
    console.log(chalk.green(`\n✓ Alerts will be sent to yourself (${me.name})`));
    return { id: me.id, label: `yourself (${me.name})` };
  }

  // ── Option 2: group ──────────────────────────────────────────────────────────
  console.log('\nFetching your groups...');
  const groups = await listGroups();

  if (groups.length === 0) {
    console.log(chalk.yellow('\nNo groups found — falling back to sending to yourself.'));
    return { id: me.id, label: `yourself (${me.name})` };
  }

  console.log('\n' + chalk.bold('Your WhatsApp groups:\n'));
  groups.forEach((g, i) => {
    console.log(`   ${chalk.bold(String(i + 1).padStart(2))}. ${g.name}`);
  });
  console.log('');

  const n = await pickFromList(`Pick a group (1–${groups.length}): `, groups.length);
  const picked = groups[n - 1];

  console.log(chalk.green(`\n✓ Alerts will be sent to: ${picked.name}`));
  return { id: picked.id, label: picked.name };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(chalk.cyan('\n🎫  ticketops setup\n'));

// ── Step 1: Basic config ──────────────────────────────────────────────────────

console.log(chalk.cyan('── Basic config ──────────────────────────────────'));

const anthropicKey = await ask(
  `Anthropic API key ${chalk.gray('(optional — for AI schema discovery)')} : `
);
const pollSecs = await ask(
  `Poll interval in seconds ${chalk.gray('[default: 45]')} : `, '45'
);
const autoReserveAns = await ask(
  `Auto-reserve tickets when available? ${chalk.gray('(y/n) [default: y]')} : `, 'y'
);
const autoReserve = autoReserveAns.toLowerCase() !== 'n';
const maxTickets  = await ask(
  `Max tickets to reserve ${chalk.gray('[default: 10]')} : `, '10'
);

// ── Step 2: First target ──────────────────────────────────────────────────────

console.log('\n' + chalk.cyan('── First target ──────────────────────────────────'));

const artistName = await askRequired('Artist name : ');
const artistUrl  = await askRequired('Biletix event page URL : ');
const artistTix  = await ask(`Tickets to reserve for this artist ${chalk.gray('[default: 10]')} : `, maxTickets);

// ── Step 3: WhatsApp recipient ────────────────────────────────────────────────

const recipient = await pickRecipient();
await closeWhatsApp();

// ── Step 4: Write files ───────────────────────────────────────────────────────

const envContent = [
  `# ── Anthropic (required for schema discovery on new sites) ───────────`,
  `ANTHROPIC_API_KEY=${anthropicKey}`,
  ``,
  `# ── WhatsApp recipient ────────────────────────────────────────────────`,
  `# Can be a group ID (ends in @g.us) or your own ID (ends in @c.us)`,
  `WHATSAPP_RECIPIENT_ID=${recipient.id}`,
  ``,
  `# ── Monitor ───────────────────────────────────────────────────────────`,
  `POLL_INTERVAL_MS=${parseInt(pollSecs) * 1000}`,
  `MAX_RETRIES=3`,
  ``,
  `# ── Reservation ───────────────────────────────────────────────────────`,
  `AUTO_RESERVE=${autoReserve}`,
  `MAX_TICKETS=${maxTickets}`,
  ``,
  `# ── Logging ───────────────────────────────────────────────────────────`,
  `LOG_LEVEL=info`,
].join('\n');

const targets = [{
  id:               slugify(artistName),
  name:             artistName,
  url:              artistUrl,
  enabled:          true,
  ticketsToReserve: parseInt(artistTix),
  notes:            '',
}];

await fs.writeFile(path.join(ROOT, '.env'),         envContent);
await fs.writeFile(path.join(ROOT, 'targets.json'), JSON.stringify(targets, null, 2));

console.log('\n' + chalk.green('✓ .env written'));
console.log(chalk.green('✓ targets.json written'));

rl.close();

// ── Login (if auto-reserve enabled) ──────────────────────────────────────────
if (autoReserve) {
  console.log(chalk.cyan('\n── Login ─────────────────────────────────────────'));
  console.log(`Auto-reserve is on — you need to log into ${chalk.bold(new URL(artistUrl).hostname)}`);
  console.log('A browser window will open. Log in, then come back here.\n');
  try {
    await runLogin(artistUrl);
  } catch (err) {
    console.log(chalk.yellow(`\n⚠  Login failed: ${err.message}`));
    console.log(chalk.gray('   You can retry anytime with: npm run login\n'));
  }
} else {
  console.log(chalk.gray('\n  Skipping login — auto-reserve is off.'));
  console.log(chalk.gray('  To enable it later: set AUTO_RESERVE=true in .env and run npm run login\n'));
}

console.log(chalk.cyan('\n── Next steps ────────────────────────────────────'));
console.log('1. npm run test-notify — confirm the message reaches ' + chalk.bold(recipient.label));
console.log('2. npm start           — begin monitoring\n');
