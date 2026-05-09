import path from 'path';
import fs   from 'fs/promises';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '../../storage/screenshots');

await fs.mkdir(screenshotsDir, { recursive: true });

/**
 * Take a full-page screenshot and return { filePath, base64 }.
 * @param {import('playwright').Page} page
 * @param {string} label  - used in filename
 */
export async function takeScreenshot(page, label = 'page') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename  = `${label}-${timestamp}.png`;
  const filePath  = path.join(screenshotsDir, filename);

  const buffer = await page.screenshot({ fullPage: true });
  await fs.writeFile(filePath, buffer);

  logger.debug(`[screenshot] saved → ${filePath}`);

  return {
    filePath,
    base64: buffer.toString('base64'),
  };
}

/** Keep only the N most recent screenshots to save disk space. */
export async function pruneScreenshots(keepLast = 20) {
  const files = (await fs.readdir(screenshotsDir))
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({ name: f, path: path.join(screenshotsDir, f) }));

  if (files.length <= keepLast) return;

  // Sort oldest first
  files.sort((a, b) => a.name.localeCompare(b.name));
  const toDelete = files.slice(0, files.length - keepLast);

  await Promise.all(toDelete.map((f) => fs.unlink(f.path)));
  logger.debug(`[screenshot] pruned ${toDelete.length} old screenshots`);
}
