import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const attempts = 3;
/** Milliseconds between successive attempts, multiplied by the completed attempt count. */
const retryDelay = 250;
const transientCodes = new Set([
  'UND_ERR_SOCKET',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
]);

async function readMirror(url: string): Promise<{ status: number; sha256?: string; size?: number }> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    return { status: response.status };
  }
  // Each attempt owns a new response and hash; partial bytes are never resumed or reused.
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    size += chunk.byteLength;
  }
  return { status: response.status, sha256: hash.digest('hex'), size };
}

/** Verify a public mirror artifact, retrying only interrupted transport from byte zero. */
export async function verifyMirrorReadback(options: {
  url: string;
  name: string;
  sha256: string;
  size: number;
}): Promise<void> {
  const name = basename(options.name).replaceAll(/[^a-zA-Z0-9._-]/gu, '_');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let result: Awaited<ReturnType<typeof readMirror>>;
    try {
      // oxlint-disable-next-line no-await-in-loop -- Retries depend on the preceding attempt failing.
      result = await readMirror(options.url);
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      const code = cause instanceof Error && 'code' in cause && typeof cause.code === 'string' ? cause.code : 'UNKNOWN';
      const transient = transientCodes.has(code);
      const diagnosticCode = /^[A-Z][A-Z0-9_]{0,63}$/u.test(code) ? code : 'UNKNOWN';
      // Do not print raw fetch errors, URLs, or socket details: they can carry credentials.
      const diagnostic = `Public mirror transport failed: ${name} (${diagnosticCode}, attempt ${attempt}/${attempts})`;
      if (!transient || attempt === attempts) {
        throw new Error(diagnostic);
      }
      console.warn(`${diagnostic}; retrying from byte zero`);
      // oxlint-disable-next-line no-await-in-loop -- Backoff must finish before the next attempt starts.
      await setTimeout(retryDelay * attempt);
      continue;
    }
    if (result.sha256 === undefined) {
      throw new Error(`Public mirror unavailable: ${name} (HTTP ${result.status})`);
    }
    if (result.size !== options.size || result.sha256 !== options.sha256) {
      throw new Error(`Public mirror bytes disagree: ${name}`);
    }
    return;
  }
}
