// Spike S29 helper (native-dependency-resolution charter): build a static mirror from a prepared store, compare the
// receipts of two stores (G5) and tally a fetch-guard log. Spike code only; nothing ships. Node 24 (type stripping).
//
// Usage:
//   node receipts.ts mirror <store> <mirror-dir> [--omit <n>]   copy the URL-origin blobs every receipt names
//   node receipts.ts compare <store-a> <store-b>                G5: files[], closureIntegrity, treeIntegrity
//   node receipts.ts tally <fetch-log> [<allowed-origin>]       requests per origin, refused and non-mirror counts
// Exit codes: 0 done (the verdict is in the JSON), 2 usage.
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Receipt = {
  readonly [key: string]: unknown;
  readonly package: string;
  readonly dependency: string;
  readonly closureIntegrity: string;
  readonly treeIntegrity: string;
  readonly files: unknown[];
  readonly payloads: ReadonlyArray<{
    readonly name: string;
    readonly sha256: string;
    readonly acquiredFrom: { readonly kind: string; readonly location: string };
  }>;
};

const receiptsOf = async (store: string): Promise<Array<{ readonly text: string; readonly receipt: Receipt }>> => {
  const closures = join(store, 'closures', 'sha256');
  const rows = [];
  const entries = await readdir(closures);
  for (const entry of entries.toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- receipts are few and read in a stable order
    const text = await readFile(join(closures, entry, 'receipt.json'), 'utf8');
    rows.push({ text, receipt: JSON.parse(text) as Receipt });
  }
  return rows;
};

const mirror = async (store: string, target: string, omit: number | undefined): Promise<void> => {
  const blobs = join(target, 'blobs', 'sha256');
  await mkdir(blobs, { recursive: true });
  const copied: string[] = [];
  const omitted: string[] = [];
  let index = 0;
  for (const { receipt } of await receiptsOf(store)) {
    for (const payload of receipt.payloads) {
      if (!/^https?:/u.test(payload.acquiredFrom.location)) {
        continue;
      }
      if (index === omit) {
        omitted.push(`${payload.name} ${payload.sha256}`);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- blobs are copied in receipt order so --omit is stable
        await copyFile(join(store, 'blobs', 'sha256', payload.sha256), join(blobs, payload.sha256));
        copied.push(payload.sha256);
      }
      index += 1;
    }
  }
  console.log(JSON.stringify({ kind: 'mirror', target, copied: copied.length, omitted }));
};

const differingKeys = (left: Record<string, unknown>, right: Record<string, unknown>): string[] =>
  [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .toSorted();

const compare = async (storeA: string, storeB: string): Promise<void> => {
  const left = await receiptsOf(storeA);
  const right = await receiptsOf(storeB);
  const byDependency = new Map(right.map((row) => [`${row.receipt.package} ${row.receipt.dependency}`, row]));
  const rows = left.map(({ receipt }) => {
    const key = `${receipt.package} ${receipt.dependency}`;
    const other = byDependency.get(key)?.receipt;
    if (other === undefined) {
      return { closure: key, present: false };
    }
    const sources = (value: Receipt): string[] =>
      [...new Set(value.payloads.map((p) => p.acquiredFrom.kind))].toSorted();
    return {
      closure: key,
      present: true,
      filesIdentical: JSON.stringify(receipt.files) === JSON.stringify(other.files),
      files: receipt.files.length,
      closureIntegrity: receipt.closureIntegrity === other.closureIntegrity ? receipt.closureIntegrity : 'DIFFERS',
      treeIntegrity: receipt.treeIntegrity === other.treeIntegrity ? receipt.treeIntegrity : 'DIFFERS',
      payloadPinsIdentical:
        JSON.stringify(receipt.payloads.map(({ name, sha256 }) => [name, sha256])) ===
        JSON.stringify(other.payloads.map(({ name, sha256 }) => [name, sha256])),
      differingReceiptFields: differingKeys(receipt, other),
      payloadSourcesA: sources(receipt),
      payloadSourcesB: sources(other),
    };
  });
  const pass =
    rows.length > 0 &&
    rows.length === right.length &&
    rows.every(
      (row) =>
        row.present &&
        row.filesIdentical &&
        row.closureIntegrity !== 'DIFFERS' &&
        row.treeIntegrity !== 'DIFFERS' &&
        row.payloadPinsIdentical,
    );
  console.log(
    JSON.stringify({
      kind: 'compare',
      g5: pass ? 'pass' : 'fail',
      closuresA: left.length,
      closuresB: right.length,
      rows,
    }),
  );
};

const tally = async (log: string, allowedOrigin: string | undefined): Promise<void> => {
  let text = '';
  try {
    text = await readFile(log, 'utf8');
  } catch {
    // No log means no request was made.
  }
  const entries = text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { origin: string; permitted: boolean });
  const perOrigin: Record<string, number> = {};
  for (const { origin } of entries) {
    perOrigin[origin] = (perOrigin[origin] ?? 0) + 1;
  }
  console.log(
    JSON.stringify({
      kind: 'tally',
      log,
      requests: entries.length,
      refused: entries.filter((entry) => !entry.permitted).length,
      nonMirror:
        allowedOrigin === undefined ? undefined : entries.filter((entry) => entry.origin !== allowedOrigin).length,
      perOrigin,
    }),
  );
};

const [command, ...rest] = process.argv.slice(2);
if (command === 'mirror' && rest.length >= 2) {
  const omitAt = rest.indexOf('--omit');
  await mirror(rest[0]!, rest[1]!, omitAt === -1 ? undefined : Number(rest[omitAt + 1]));
} else if (command === 'compare' && rest.length === 2) {
  await compare(rest[0]!, rest[1]!);
} else if (command === 'tally' && rest.length > 0) {
  await tally(rest[0]!, rest[1]);
} else {
  console.error('Usage: receipts.ts mirror <store> <dir> [--omit <n>] | compare <a> <b> | tally <log> [<origin>]');
  process.exit(2);
}
