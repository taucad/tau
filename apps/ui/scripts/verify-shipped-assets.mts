/* oxlint-disable no-await-in-loop -- Hash one file at a time to bound memory on large WASM runtimes. */
/**
 * Prove that every file the UI build copied verbatim ships with the bytes it was built with.
 *
 * The build writes `tau-asset-receipt.json`, which lists every emitted file with its integrity and marks the files
 * it compiled with a source map. Deploy steps after the build may rewrite compiled files (Sentry and PostHog add
 * debug ids). They must not change any other file: WASM modules are fetched with Subresource Integrity, and the
 * PicoGK and C# hosts check every runtime file against their own manifests, so a changed byte reaches users as
 * "PicoGK runtime resource integrity mismatch". Run this after the last step that can rewrite `build/client`.
 *
 * Usage: node apps/ui/scripts/verify-shipped-assets.mts <client-dir>
 * Exit codes: 0 verified, 1 a file changed or is missing, 2 usage.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';

const receiptName = 'tau-asset-receipt.json';
const receiptSchema = z.object({
  schema: z.literal('tau-ui-asset-receipt-v1'),
  algorithm: z.literal('sha384'),
  assets: z.array(
    z.object({
      path: z.string().min(1),
      bytes: z.number().int().nonnegative(),
      integrity: z.string().startsWith('sha384-'),
      sourceMap: z.literal(true).optional(),
    }),
  ),
});

const readOptional = async (file: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  try {
    return Uint8Array.from(await readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

/**
 * Re-hash every receipt entry without a source map.
 * @param client - The built client directory, such as `apps/ui/build/client`.
 * @returns How many files were checked, and one line per file that changed or is missing, sorted.
 */
export const verifyShippedAssets = async (
  client: string,
): Promise<{ readonly checked: number; readonly problems: readonly string[] }> => {
  const receiptBytes = await readOptional(path.join(client, receiptName));
  if (!receiptBytes) {
    return { checked: 0, problems: [`${receiptName}: missing, so nothing the build copied verbatim can be checked`] };
  }
  const receipt = receiptSchema.parse(JSON.parse(new TextDecoder().decode(receiptBytes)));
  const problems: string[] = [];
  let checked = 0;
  for (const entry of receipt.assets) {
    if (entry.sourceMap) {
      continue;
    }
    checked += 1;
    const bytes = await readOptional(path.join(client, entry.path));
    if (!bytes) {
      // React Router removes Vite's build manifest after the build; it is never served.
      if (!entry.path.startsWith('.vite/')) {
        problems.push(`${entry.path}: missing`);
      }
      continue;
    }
    const integrity = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
    if (integrity !== entry.integrity) {
      problems.push(
        `${entry.path}: ${String(bytes.byteLength)} bytes with ${integrity}, ` +
          `but the build wrote ${String(entry.bytes)} bytes with ${entry.integrity}`,
      );
    }
  }
  return { checked, problems: problems.toSorted() };
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [client, ...extra] = process.argv.slice(2);
  if (!client || extra.length > 0) {
    console.error('Usage: node apps/ui/scripts/verify-shipped-assets.mts <client-dir>');
    process.exit(2);
  }
  const { checked, problems } = await verifyShippedAssets(client);
  for (const problem of problems) {
    console.error(`::error::A file the UI build copied verbatim changed after the build: ${problem}`);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
  console.log(`Verified ${String(checked)} file(s) the UI build copied verbatim under ${client}.`);
}
