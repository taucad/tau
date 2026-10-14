/**
 * Spike S7 child: the acquisition order a `tau prepare` child would follow (seed out of scope),
 * mirror then canonical origin, with the D25 no-fallback switch, using only Node's global `fetch`.
 * Spike code only (not W2). Usage: node prepare-probe.ts '<payloads JSON>'
 * Environment: TAU_PAYLOAD_MIRROR, TAU_PAYLOAD_MIRROR_NO_FALLBACK, and the parent's proxy variables.
 * Output: one JSON line per payload. Exit codes: 0 all verified, 1 a download failed, 3 a refusal.
 */

import { createHash } from 'node:crypto';
import process from 'node:process';

type Payload = { name: string; sha256: string; url: string };

class AcquisitionError extends Error {
  public readonly code: string;
  public readonly detail: Readonly<Record<string, unknown>>;

  public constructor(code: string, detail: Readonly<Record<string, unknown>>) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.code = code;
    this.detail = detail;
  }
}

const payloads = JSON.parse(process.argv[2] ?? '[]') as Payload[];
const mirror = process.env['TAU_PAYLOAD_MIRROR'];
const noFallback = process.env['TAU_PAYLOAD_MIRROR_NO_FALLBACK'] === '1';

const causeOf = (error: unknown): { cause: string; message: string } => {
  const outer = error instanceof Error ? error : new Error(String(error));
  const inner = outer.cause instanceof Error ? (outer.cause as Error & { code?: string }) : undefined;
  return { cause: inner?.code ?? inner?.name ?? outer.name, message: inner?.message ?? outer.message };
};

/** `requestTimeout` is in milliseconds. */
const fetchOrFail = async (
  url: string,
  attempt: { attempts: string[]; started: number; requestTimeout: number },
): Promise<Response> => {
  const { attempts, started, requestTimeout } = attempt;
  attempts.push(url);
  try {
    return await fetch(url, { signal: AbortSignal.timeout(requestTimeout) });
  } catch (error) {
    throw new AcquisitionError('DOWNLOAD_FAILED', {
      url,
      ...causeOf(error),
      attempts,
      ms: performance.now() - started,
    });
  }
};

const acquire = async (payload: Payload): Promise<Record<string, unknown>> => {
  const started = performance.now();
  const attempts: string[] = [];
  if (mirror !== undefined && mirror !== '') {
    const url = new URL(`blobs/sha256/${payload.sha256}`, mirror).href;
    const response = await fetchOrFail(url, { attempts, started, requestTimeout: 10_000 });
    if (response.ok) {
      const digest = createHash('sha256')
        .update(new Uint8Array(await response.arrayBuffer()))
        .digest('hex');
      if (digest !== payload.sha256) {
        throw new AcquisitionError('INTEGRITY_MISMATCH', { url, expected: payload.sha256, actual: digest });
      }
      return { name: payload.name, outcome: 'verified', from: 'mirror', attempts, ms: performance.now() - started };
    }
    await response.body?.cancel();
    if (noFallback) {
      throw new AcquisitionError('OFFLINE_MISS', {
        blocked: 'mirror-miss',
        name: payload.name,
        url,
        status: response.status,
        ms: performance.now() - started,
      });
    }
  }
  const response = await fetchOrFail(payload.url, { attempts, started, requestTimeout: 30_000 });
  await response.body?.cancel();
  return {
    name: payload.name,
    outcome: 'origin-reached',
    status: response.status,
    attempts,
    ms: performance.now() - started,
  };
};

let exit = 0;
for (const payload of payloads) {
  try {
    // oxlint-disable-next-line no-await-in-loop -- payload order is the reported order.
    process.stdout.write(`${JSON.stringify(await acquire(payload))}\n`);
  } catch (error) {
    const typed = error instanceof AcquisitionError ? error : undefined;
    process.stdout.write(
      `${JSON.stringify({ name: payload.name, outcome: 'error', code: typed?.code ?? 'UNTYPED', detail: typed?.detail ?? String(error) })}\n`,
    );
    exit = Math.max(exit, typed?.code === 'OFFLINE_MISS' ? 3 : 1);
  }
}
process.exitCode = exit;
