/**
 * scripts/setup.js
 *
 * Interactive setup wizard. Run once after cloning.
 *
 * Flow:
 *   1. Ask for basic config (artist, URL, poll interval, auto-reserve)
 *   2. Connect WhatsApp — show QR if first time
 *   3. List groups as a numbered menu — user picks one
 *   4. Write .env + targets.json
 */

import 'dotenv/config';
import readline from 'readline';
import fs       from 'fs/promises';
import path     from 'path';
import chalk    from 'chalk';
import { fileURLToPath } from 'url';

import { initWhatsApp, listGroups, closeWhatsApp } from '../src/notifier/whatsapp.js';
import { slugify } from '../src/utils/slugify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── Readline helper ───────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, fallback = '') {
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      const val = ans.trim();
      resolve(val === '' ? fallback : val);
    });
  });
}

function askRequired(question) {
  return new Promise((resolve) => {
    const retry = () => {
      rl.question(question, (ans) => {
        const val = ans.trim();
        if (val) return resolve(val);
        console.log(chalk.red('  This field is required.'));
        retry();
      });
    };
    retry();
  });
}

// ── Group picker ──────────────────────────────────────────────────────────────

async function pickWhatsAppGroup() {
  console.log('\n' + chalk.cyan('── WhatsApp ──────────────────────────────────────'));
  console.log('Connecting to WhatsApp...');
  console.log(chalk.gray('If this is your first time, a QR code will appear below.'));
  console.log(chalk.gray('Scan it with WhatsApp on your phone.\n'));

  await initWhatsApp();

  console.log('\nFetching your groups...');

  // Small delay to ensure chats are loaded after ready event
  await new Promise((r) => setTimeout(r, 3000));

  const groups = await listGroups();

  if (groups.length === 0) {
    console.log(chalk.yellow('\nNo groups found. Make sure your WhatsApp account is in at least one group.'));
    const manualId = await ask('Enter group ID manually (or press Enter to skip): ');
    return manualId || null;
  }

  console.log('\n' + chalk.bold('Your WhatsApp groups:\n'));
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

  console.log(chalk.green(`\n✓ Selected: ${pick.name}`));
  return pick;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(chalk.cyan('\n🎫  ticketops setup\n'));

// ── Step 1: Config ────────────────────────────────────────────────────────────

console.log(chalk.cyan('── Basic config ──────────────────────────────────'));

const anthropicKey = await ask(
  `Anthropic API key ${chalk.gray('(optional — only needed for AI mode)')} : `
);

const pollSecs = await ask(
  `Poll interval in seconds ${chalk.gray('[default: 45]')} : `,
  '45'
);

const autoReserveAns = await ask(
  `Auto-reserve tickets when available? ${chalk.gray('(y/n) [default: y]')} : `,
  'y'
);
const autoReserve = autoReserveAns.toLowerCase() !== 'n';

const maxTickets = await ask(
  `Max tickets to reserve ${chalk.gray('[default: 10]')} : `,
  '10'
);

// ── Step 2: First target ──────────────────────────────────────────────────────

console.log('\n' + chalk.cyan('── First target ──────────────────────────────────'));

const artistName = await askRequired('Artist name : ');
const artistUrl  = await askRequired('Biletix event page URL : ');
const artistTix  = await ask(`Tickets to reserve for this artist ${chalk.gray('[default: 10]')} : `, maxTickets);

// ── Step 3: WhatsApp group picker ─────────────────────────────────────────────

const picked = await pickWhatsAppGroup();
const groupId = picked?.id || '';

await closeWhatsApp();

// ── Step 4: Write files ───────────────────────────────────────────────────────

const envContent = [
  `# ── Anthropic (optional — set USE_AI_CONFIRMATION=true to enable) ───`,
  `ANTHROPIC_API_KEY=${anthropicKey}`,
  ``,
  `# ── WhatsApp ──────────────────────────────────────────────────────────`,
  `WHATSAPP_GROUP_ID=${groupId}`,
  ``,
  `# ── Monitor ───────────────────────────────────────────────────────────`,
  `POLL_INTERVAL_MS=${parseInt(pollSecs) * 1000}`,
  `MAX_RETRIES=3`,
  ``,
  `# ── Reservation ───────────────────────────────────────────────────────`,
  `AUTO_RESERVE=${autoReserve}`,
  `MAX_TICKETS=${maxTickets}`,
  ``,
  `# ── AI confirmation (off by default — costs Anthropic credits) ────────`,
  `USE_AI_CONFIRMATION=false`,
  ``,
  `# ── Logging ───────────────────────────────────────────────────────────`,
  `LOG_LEVEL=info`,
].join('\n');

const targets = [
  {
    id:               slugify(artistName),
    name:             artistName,
    url:              artistUrl,
    enabled:          true,
    ticketsToReserve: parseInt(artistTix),
    notes:            '',
  },
];

await fs.writeFile(path.join(ROOT, '.env'),          envContent);
await fs.writeFile(path.join(ROOT, 'targets.json'),  JSON.stringify(targets, null, 2));

console.log('\n' + chalk.green('✓ .env written'));
console.log(chalk.green('✓ targets.json written'));

if (!groupId) {
  console.log(chalk.yellow('\n⚠ No WhatsApp group selected. Edit .env and set WHATSAPP_GROUP_ID manually.'));
  console.log(chalk.gray('  Run `npm run pick-group` at any time to set it interactively.'));
}

rl.close();

console.log(chalk.cyan('\n── Next steps ────────────────────────────────────'));
console.log('1. Run `npm run login`       — save your Biletix browser session');
console.log('2. Run `npm run test-notify` — send a test WhatsApp message');
console.log('3. Run `npm start`           — begin monitoring\n');
