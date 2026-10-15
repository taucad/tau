/**
 * Prove that every URL a `tau-plugin.json` pins serves exactly the bytes its integrity and byte length declare.
 *
 * A published plugin manifest must never name a payload that is missing, moved or different (charter I13, go-live
 * DEL-20): `publish.yml` runs this through each native plugin's `check-payload-urls` target before the train. Every
 * URL is checked, not only the first, because hosts fall back through them in order.
 *
 * Usage: node scripts/src/check-payload-urls.ts <tau-plugin.json>…
 * Exit codes: 0 every URL verified; 1 a URL failed or a manifest is unreadable; 2 usage.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** One pinned URL and what it must serve. */
export type PinnedUrl = {
  readonly payload: string;
  readonly url: string;
  readonly integrity: string;
  readonly byteLength: number;
};

const sriPattern = /^(?<algorithm>sha256|sha384|sha512)-(?<digest>[A-Za-z\d+/]+={0,2})$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every `url` origin of every payload of every variant, in manifest order.
 * @param manifest - A parsed `tau-plugin.json`.
 * @returns The URLs with the pin each must satisfy.
 * @throws When the manifest is not schema v1 or a payload has no SRI integrity.
 */
export const pinnedUrls = (manifest: unknown): PinnedUrl[] => {
  if (!isRecord(manifest) || manifest['schemaVersion'] !== 1 || !isRecord(manifest['dependencies'])) {
    throw new Error('Not a tau-plugin.json schema v1 manifest.');
  }
  const pins: PinnedUrl[] = [];
  for (const [dependency, variants] of Object.entries(manifest['dependencies'])) {
    for (const variant of Array.isArray(variants) ? variants : []) {
      const payloads: unknown = isRecord(variant) ? variant['payloads'] : undefined;
      for (const payload of Array.isArray(payloads) ? payloads : []) {
        if (!isRecord(payload) || !isRecord(payload['origin']) || payload['origin']['kind'] !== 'url') {
          continue;
        }
        const { name, integrity, byteLength } = payload;
        const { urls } = payload['origin'];
        if (typeof integrity !== 'string' || !sriPattern.test(integrity) || typeof byteLength !== 'number') {
          throw new Error(`${dependency}/${String(name)} has no SRI integrity and byte length.`);
        }
        for (const url of Array.isArray(urls) ? urls : []) {
          pins.push({ payload: `${dependency}/${String(name)}`, url: String(url), integrity, byteLength });
        }
      }
    }
  }
  return pins;
};

/**
 * Download one pinned URL and compare its bytes with the pin.
 * @param pin - The URL and its pin.
 * @param transport - The `fetch` to use.
 * @returns `undefined` when the URL serves the pinned bytes, else why not.
 */
export const checkPinnedUrl = async (pin: PinnedUrl, transport: typeof fetch): Promise<string | undefined> => {
  const { algorithm, digest } = sriPattern.exec(pin.integrity)!.groups!;
  let response: Response;
  try {
    response = await transport(pin.url, { redirect: 'follow' });
  } catch (error) {
    return `${pin.url} could not be fetched: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!response.ok || response.body === null) {
    return `${pin.url} answered HTTP ${String(response.status)}`;
  }
  const hash = createHash(algorithm!);
  let byteLength = 0;
  // Leaving the loop early cancels the body, so an oversized payload is never read to its end.
  for await (const chunk of response.body) {
    byteLength += chunk.byteLength;
    if (byteLength > pin.byteLength) {
      break;
    }
    hash.update(chunk);
  }
  if (byteLength > pin.byteLength) {
    return `${pin.url} serves more than the pinned ${String(pin.byteLength)} bytes`;
  }
  if (byteLength !== pin.byteLength) {
    return `${pin.url} served ${String(byteLength)} bytes, not the pinned ${String(pin.byteLength)}`;
  }
  return hash.digest('base64') === digest ? undefined : `${pin.url} does not match ${pin.integrity}`;
};

/**
 * Check every pinned URL of some manifests.
 * @param paths - `tau-plugin.json` paths.
 * @param transport - The `fetch` to use.
 * @returns One line per URL that does not serve its pinned bytes.
 */
export const checkPayloadUrls = async (paths: readonly string[], transport: typeof fetch): Promise<string[]> => {
  const failures: string[] = [];
  for (const path of paths) {
    // oxlint-disable-next-line no-await-in-loop -- manifests are read and checked one at a time
    const pins = pinnedUrls(JSON.parse(await readFile(path, 'utf8')));
    // oxlint-disable-next-line no-await-in-loop -- each manifest's URLs are checked together
    const results = await Promise.all(pins.map(async (pin) => checkPinnedUrl(pin, transport)));
    failures.push(
      ...results.flatMap((failure, index) => (failure === undefined ? [] : [`${pins[index]!.payload}: ${failure}`])),
    );
  }
  return failures;
};

const main = async (): Promise<void> => {
  const paths = process.argv.slice(2).map((path) => resolve(path));
  if (paths.length === 0) {
    console.error('Usage: node scripts/src/check-payload-urls.ts <tau-plugin.json>…');
    process.exitCode = 2;
    return;
  }
  const failures = await checkPayloadUrls(paths, fetch);
  if (failures.length > 0) {
    console.error(`Pinned payload URLs that do not serve their bytes:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Every pinned payload URL serves its bytes (${paths.join(', ')}).`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
