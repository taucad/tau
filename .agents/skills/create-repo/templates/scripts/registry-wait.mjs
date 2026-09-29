#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_INTERVAL_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;

/** Read one published version's metadata, or `null` while it is not served. */
export const npmView = (name, version) => {
  try {
    return JSON.parse(
      execFileSync('npm', ['view', `${name}@${version}`, '--json'], { encoding: 'utf8', timeout: 30_000 }),
    );
  } catch {
    return null;
  }
};

/**
 * Wait for the registry to serve every candidate package with an attestation
 * and the integrity recorded in the candidate manifest.
 *
 * npm scans packages at publish time, so a successful publish is invisible to
 * `npm view` for minutes. The wait is bounded rather than optimistic: each wait
 * doubles from `intervalMs` up to `maxIntervalMs`, never runs past `timeoutMs`,
 * and an integrity that disagrees with the tested bytes fails immediately
 * instead of being retried.
 */
export const waitForRegistry = async ({
  intervalMs = DEFAULT_INTERVAL_MS,
  log = (message) => process.stdout.write(`${message}\n`),
  manifest,
  maxIntervalMs = DEFAULT_MAX_INTERVAL_MS,
  now = Date.now,
  sleep = delay,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  view = npmView,
}) => {
  const candidates = manifest.packages;
  const start = now();
  const deadline = start + timeoutMs;
  const pending = new Map(candidates.map((candidate) => [candidate.name, candidate]));
  const unavailable = new Map();

  for (let attempt = 1; ; attempt += 1) {
    for (const [name, candidate] of pending) {
      const metadata = view(name, candidate.version);
      const integrity = metadata?.dist?.integrity;
      if (!integrity) {
        unavailable.set(name, 'not published');
        continue;
      }
      if (integrity !== candidate.integrity) {
        throw new Error(
          `${name}@${candidate.version}: registry integrity ${integrity} differs from the candidate ${candidate.integrity}`,
        );
      }
      if (!metadata.dist.attestations) {
        unavailable.set(name, 'no attestations');
        continue;
      }
      unavailable.delete(name);
      pending.delete(name);
    }

    const elapsedSeconds = Math.round((now() - start) / 1000);
    log(
      `attempt ${attempt} after ${elapsedSeconds}s: ${candidates.length - pending.size}/${candidates.length} packages available`,
    );
    if (pending.size === 0) {
      log(`all ${candidates.length} packages are visible with matching integrity`);
      return;
    }
    if (now() >= deadline) {
      const minutes = Number((timeoutMs / 60_000).toFixed(1));
      const detail = [...unavailable]
        .map(([name, reason]) => `${name} (${reason})`)
        .sort()
        .join(', ');
      throw new Error(`timed out after ${minutes} minutes; unavailable: ${detail}`);
    }
    // Double the wait, cap it, and never sleep past the deadline.
    await sleep(Math.min(intervalMs * 2 ** (attempt - 1), maxIntervalMs, deadline - now()));
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      'interval-seconds': { default: String(DEFAULT_INTERVAL_MS / 1000), type: 'string' },
      manifest: { type: 'string' },
      'max-interval-seconds': { default: String(DEFAULT_MAX_INTERVAL_MS / 1000), type: 'string' },
      'timeout-minutes': { default: String(DEFAULT_TIMEOUT_MS / 60_000), type: 'string' },
    },
  });
  try {
    if (!values.manifest) throw new Error('expected --manifest <candidate/manifest.json>');
    await waitForRegistry({
      intervalMs: Number(values['interval-seconds']) * 1000,
      manifest: JSON.parse(readFileSync(values.manifest, 'utf8')),
      maxIntervalMs: Number(values['max-interval-seconds']) * 1000,
      timeoutMs: Number(values['timeout-minutes']) * 60_000,
    });
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
