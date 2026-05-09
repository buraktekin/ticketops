/**
 * scripts/test-notify.js
 *
 * Sends a test message to your configured WhatsApp group.
 * Run this to confirm your WHATSAPP_GROUP_ID and connection work
 * before leaving the monitor running overnight.
 *
 * Usage: npm run test-notify
 */

import 'dotenv/config';
import { initWhatsApp, sendToGroup, closeWhatsApp } from '../src/notifier/whatsapp.js';
import chalk from 'chalk';

console.log(chalk.cyan('\n🧪  WhatsApp Test Notification\n'));

await initWhatsApp();

const message = [
  '🦅 *ticketops test message*',
  '',
  '✓ Connection working',
  '✓ Group ID configured',
  '✓ Ready to monitor',
  '',
  '_If you see this, setup is complete!_',
].join('\n');

try {
  await sendToGroup(message);
  console.log(chalk.green('✓ Test message sent successfully!\n'));
} catch (err) {
  console.error(chalk.red('✗ Failed to send message:'), err.message);
  console.log('\nCheck your WHATSAPP_GROUP_ID in .env');
  console.log('Run `npm run list-groups` to find the correct ID\n');
}

await closeWhatsApp();
process.exit(0);
