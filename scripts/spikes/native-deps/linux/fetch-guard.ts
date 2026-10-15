/**
 * Spike preload (S29, S33): log every global `fetch` and refuse any origin outside an allowlist, so a run proves
 * which origins a Tau command contacted. Loaded with `NODE_OPTIONS=--import=<file URL>`, so child Node processes
 * inherit it. Spike code only; nothing ships.
 *
 * Environment:
 *   SPIKE_FETCH_LOG          file that receives one JSON line per request (required)
 *   SPIKE_ALLOWED_ORIGINS    comma-separated origins; empty means record-only (every origin allowed)
 *   SPIKE_REWRITE_FROM/TO    optional URL prefix rewrite applied before the origin check (an emulated registry
 *                            prefix override); the log keeps both the requested and the rewritten URL
 */
import { appendFileSync } from 'node:fs';
import process from 'node:process';

const log = process.env['SPIKE_FETCH_LOG'];
if (log === undefined || log === '') {
  throw new Error('fetch-guard: SPIKE_FETCH_LOG is required');
}
const allowed = (process.env['SPIKE_ALLOWED_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');
const rewriteFrom = process.env['SPIKE_REWRITE_FROM'] ?? '';
const rewriteTo = process.env['SPIKE_REWRITE_TO'] ?? '';
const original = globalThis.fetch;

const guarded = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const requested = input instanceof Request ? input.url : String(input);
  const rewritten = rewriteFrom !== '' && rewriteTo !== '' && requested.startsWith(rewriteFrom);
  const target = rewritten ? `${rewriteTo}${requested.slice(rewriteFrom.length)}` : requested;
  const { origin } = new URL(target);
  const permitted = allowed.length === 0 || allowed.includes(origin);
  appendFileSync(
    log,
    `${JSON.stringify({ pid: process.pid, at: new Date().toISOString(), requested, target, origin, permitted, rewritten })}\n`,
  );
  if (!permitted) {
    throw new TypeError(`fetch-guard refused a request to ${origin} (allowed: ${allowed.join(', ')})`);
  }
  if (!rewritten) {
    return original(input, init);
  }
  return original(input instanceof Request ? new Request(target, input) : target, init);
};

globalThis.fetch = guarded;
