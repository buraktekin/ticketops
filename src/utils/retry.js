import logger from './logger.js';

/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn          - async function to retry
 * @param {object}   opts
 * @param {number}   opts.maxAttempts  - total attempts (default 3)
 * @param {number}   opts.baseDelayMs  - initial delay in ms (default 2000)
 * @param {string}   opts.label        - label for log messages
 */
export async function retry(fn, { maxAttempts = 3, baseDelayMs = 2000, label = 'operation' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`[retry] ${label} failed (attempt ${attempt}/${maxAttempts}) — retrying in ${delay}ms`, {
        error: err.message,
      });
      if (attempt < maxAttempts) await sleep(delay);
    }
  }

  throw new Error(`[retry] ${label} failed after ${maxAttempts} attempts: ${lastError?.message}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
