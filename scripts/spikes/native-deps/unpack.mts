#!/usr/bin/env node

/**
 * Purpose: Prototype Node-only unpack of a registry-native closure (tar.gz payloads plus wheels with
 *   RECORD checks) into a fresh staging directory, hashing every byte as it is written.
 * Why: Spike S13 measures the D23 unpack budgets; spike S3 reuses it for the hash-while-write cost.
 * Environment: Node 24+; payload files already downloaded and digest-checked by fetch-payloads.mts.
 *   Archive content is written as data only; nothing unpacked is executed.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/unpack.mts --plan <plan.json>
 *   --closure python|picogk --staging <dir> --label <name> [--hash write|none] [--concurrency <n>] [--out <file>]
 * Exit codes: 0 when every payload unpacks and every RECORD row matches; 1 otherwise.
 */

import { createHash } from 'node:crypto';
import { link, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

/* oxlint-disable no-restricted-imports -- spike-only scripts outside a package import their siblings and the kernel sessions, which are not public exports, by relative path; deleted with their W package. */
import { asArrayBufferView, readTarEntries, readZipEntries } from './archive.mts';
import { cpuMilliseconds, emit, parseFlags, requiredFlag } from './spike-common.mts';
/* oxlint-enable no-restricted-imports */

const gunzipAsync = promisify(gunzip);

type Payload =
  | { readonly kind: 'tar.gz'; readonly path: string; readonly stripComponents: number; readonly destination: string }
  | { readonly kind: 'wheel'; readonly path: string; readonly destination: string };
type Plan = { readonly closures: Record<string, readonly Payload[]> };
type Written = { readonly path: string; readonly byteLength: number; readonly sha256: string | undefined };

const pool: <T>(items: readonly T[], width: number, run: (item: T) => Promise<void>) => Promise<void> = async (
  items,
  width,
  run,
) => {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next]!;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- each lane is one bounded serial queue.
      await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, width) }, lane));
};

/** Parse RECORD (RFC 4180 CSV) into path → { hash, size }. */
const parseRecord = (body: string): Map<string, { hash: string; size: string }> => {
  const rows = new Map<string, { hash: string; size: string }>();
  for (const line of body.split(/\r?\n/u)) {
    if (line === '') {
      continue;
    }
    const fields: string[] = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;
      if (quoted) {
        if (character === '"' && line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === ',') {
        fields.push(field);
        field = '';
      } else {
        field += character;
      }
    }
    fields.push(field);
    rows.set(fields[0]!, { hash: fields[1] ?? '', size: fields[2] ?? '' });
  }
  return rows;
};

const main = async (): Promise<void> => {
  const flags = parseFlags(['plan', 'closure', 'staging', 'label', 'hash', 'concurrency', 'out']);
  const plan = JSON.parse(await readFile(requiredFlag(flags, 'plan'), 'utf8')) as Plan;
  const closure = requiredFlag(flags, 'closure');
  const payloads = plan.closures[closure];
  if (!payloads) {
    throw new Error(`plan has no closure ${closure}`);
  }
  const hashMode = flags.get('hash') ?? 'write';
  if (hashMode !== 'write' && hashMode !== 'none') {
    throw new TypeError('--hash must be write or none');
  }
  const concurrency = Number(flags.get('concurrency') ?? '4');
  const staging = resolve(requiredFlag(flags, 'staging'));
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  const madeDirectories = new Map<string, Promise<unknown>>();
  const ensureDirectory = async (path: string): Promise<void> => {
    let made = madeDirectories.get(path);
    if (made === undefined) {
      made = mkdir(path, { recursive: true });
      madeDirectories.set(path, made);
    }
    await made;
  };
  const inside = (path: string): string => {
    const normalized = normalize(path);
    if (isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`archive entry escapes the staging root: ${path}`);
    }
    return join(staging, normalized);
  };
  const written: Written[] = [];
  const writeMember = async (target: string, data: Uint8Array<ArrayBuffer>, mode: number): Promise<void> => {
    const sha256 = hashMode === 'write' ? createHash('sha256').update(data).digest('hex') : undefined;
    await ensureDirectory(dirname(target));
    await writeFile(target, data, { mode: mode === 0 ? 0o644 : mode });
    written.push({ path: relative(staging, target), byteLength: data.byteLength, sha256 });
  };

  let recordRowsChecked = 0;
  let compressedBytes = 0;
  let dataMembersSkipped = 0;
  const payloadTimings: Array<{ path: string; kind: string; milliseconds: number; members: number }> = [];
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  await pool(payloads, concurrency, async (payload) => {
    const payloadStarted = performance.now();
    const raw = await readFile(payload.path);
    compressedBytes += raw.byteLength;
    let members = 0;
    if (payload.kind === 'tar.gz') {
      const entries = readTarEntries(asArrayBufferView(await gunzipAsync(raw)));
      const links: Array<() => Promise<void>> = [];
      await pool(entries, 32, async (entry) => {
        const parts = entry.path.split('/').filter((part) => part !== '' && part !== '.');
        if (parts.length <= payload.stripComponents) {
          return;
        }
        const target = inside(join(payload.destination, ...parts.slice(payload.stripComponents)));
        members += 1;
        switch (entry.type) {
          case 'directory': {
            await ensureDirectory(target);
            break;
          }
          case 'file': {
            await writeMember(target, entry.data, entry.mode);
            break;
          }
          case 'symlink': {
            // Refuse any link that resolves outside the staging root (D20).
            inside(relative(staging, resolve(dirname(target), entry.linkTarget)));
            links.push(async () => {
              await ensureDirectory(dirname(target));
              await symlink(entry.linkTarget, target);
            });
            break;
          }
          case 'hardlink': {
            const source = inside(
              join(payload.destination, ...entry.linkTarget.split('/').slice(payload.stripComponents)),
            );
            links.push(async () => {
              await ensureDirectory(dirname(target));
              await link(source, target);
            });
            break;
          }
          default: {
            break;
          }
        }
      });
      for (const create of links) {
        // oxlint-disable-next-line no-await-in-loop -- links follow their targets, in order.
        await create();
      }
    } else {
      const entries = readZipEntries(asArrayBufferView(raw));
      const recordEntry = entries.find((entry) => /^[^/]+\.dist-info\/RECORD$/u.test(entry.path));
      if (!recordEntry) {
        throw new Error(`${payload.path} has no RECORD`);
      }
      const record = parseRecord(Buffer.from(await recordEntry.inflate()).toString('utf8'));
      await pool(entries, 16, async (entry) => {
        if (entry.path.endsWith('/')) {
          return;
        }
        let relativePath = entry.path;
        const dataMatch = /^[^/]+\.data\/([^/]+)\/(.*)$/u.exec(entry.path);
        if (dataMatch) {
          if (dataMatch[1] !== 'purelib' && dataMatch[1] !== 'platlib') {
            dataMembersSkipped += 1;
            return;
          }
          relativePath = dataMatch[2]!;
        }
        const data = await entry.inflate();
        const row = record.get(entry.path);
        if (!row) {
          throw new Error(`${payload.path}: ${entry.path} has no RECORD row`);
        }
        if (hashMode === 'write' && row.hash !== '') {
          const [algorithm, expected] = row.hash.split('=', 2);
          const actual = createHash(algorithm!).update(data).digest('base64url');
          if (actual !== expected || Number(row.size) !== data.byteLength) {
            throw new Error(`${payload.path}: ${entry.path} does not match its RECORD row`);
          }
          recordRowsChecked += 1;
        }
        members += 1;
        await writeMember(inside(join(payload.destination, relativePath)), data, entry.mode);
      });
    }
    payloadTimings.push({
      path: payload.path,
      kind: payload.kind,
      milliseconds: performance.now() - payloadStarted,
      members,
    });
  });
  const wallMilliseconds = performance.now() - started;
  const cpu = cpuMilliseconds(cpuStart);
  const sorted = written.sort((left, right) => (left.path < right.path ? -1 : 1));
  const treeIntegrity =
    hashMode === 'write'
      ? createHash('sha256')
          .update(sorted.map(({ path, sha256 }) => `${path}\0${String(sha256)}\n`).join(''))
          .digest('hex')
      : undefined;
  emit(flags.get('out'), {
    spike: 'unpack',
    label: requiredFlag(flags, 'label'),
    closure,
    hash: hashMode,
    concurrency,
    payloads: payloads.length,
    files: written.length,
    bytes: written.reduce((sum, { byteLength }) => sum + byteLength, 0),
    compressedBytes,
    recordRowsChecked,
    dataMembersSkipped,
    wallMilliseconds,
    cpuMilliseconds: cpu,
    treeIntegrity,
    slowestPayloads: payloadTimings.sort((left, right) => right.milliseconds - left.milliseconds).slice(0, 5),
  });
};

try {
  await main();
} catch (error) {
  console.error('unpack failed:', error);
  process.exit(1);
}
