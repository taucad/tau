/**
 * Mirror the dependency files a `tau-plugin.json` pins by URL to the locked dependency hosts, under their SHA-256.
 *
 * A locked `tau prepare` (`TAU_ACQUISITION=locked`, `TAU_DEPENDENCY_MIRROR=<host>`) resolves a mirror key only from a
 * sha256 pin, `blobs/sha256/<hex>`, and never falls back to a file's origin URL. A file pinned to a third-party URL (the
 * PicoGK `dotnet` runtime archives, pinned from `builds.dotnet.microsoft.com` by the sha512 Microsoft publishes) is
 * therefore served only once these bytes are written to both dependency buckets: `tau-staging-au-dependencies` behind
 * `https://dependencies.taucad.dev` and `tau-prod-dependencies` behind `https://dependencies.tau.new`. The write itself
 * is `.github/actions/dependency-files-publish`, run by `.github/workflows/dependency-files-publish.yml`.
 *
 * `fetch` downloads every file of the given name from its pinned URLs, in order, and keeps the first download whose bytes
 * match the pinned integrity (sha256, sha384 or sha512) and byte length; a file no URL serves refuses the whole run. Each
 * verified file is written as `<out>/<sha256 hex>`, and `<out>/plan.tsv` lists `<sha256>\t<byteLength>\t<label>` rows.
 * The key, the first 16 hex of the SHA-256 of the sorted, newline-terminated SHA-256 hexes, names the bytes, not the
 * pins: re-pinning the same bytes by another algorithm keeps the key, and with it the tag
 * `dependency@<tag name>-<key>`. With `--tag`, `fetch` refuses unless the tag is that one.
 *
 * `check` proves that a host serves every planned blob with its digest and byte length, retrying a blob that is not served
 * yet (a cached miss right after the write) or was cut off.
 *
 * Usage: node scripts/src/mirror-dependency-files.ts <command> …
 *   fetch --manifest <tau-plugin.json> --name <file name> --tag-name <name> --out <dir> [--tag <tag>]
 *                                         `key=` and `tag=` lines for $GITHUB_OUTPUT
 *   check --plan <plan.tsv> --base <url>  prove `<url>blobs/sha256/<hex>` serves every planned blob
 * Exit codes: 0 success; 1 a refusal or failed check; 2 usage.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** One dependency file a manifest pins by URL. */
export type UrlPin = {
  readonly label: string;
  readonly integrity: string;
  readonly byteLength: number;
  readonly urls: readonly string[];
};

/** One write-once blob: its digest, its byte length and the dependency file it holds. */
export type PlanRow = { readonly sha256: string; readonly byteLength: number; readonly label: string };

/** How a download or a check retries a URL that is not served yet or was cut off. */
export type RetryPolicy = { readonly attempts: number; readonly wait: (attempt: number) => Promise<void> };

const sriPattern = /^(?<algorithm>sha256|sha384|sha512)-(?<digest>[A-Za-z\d+/]+={0,2})$/u;
const hex64 = /^[\da-f]{64}$/u;
const tagNamePattern = /^[a-z\d]+(?:-[a-z\d]+)*$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
};

const defaultRetry: RetryPolicy = {
  attempts: 3,
  wait: async (attempt) =>
    new Promise((resolve) => {
      setTimeout(resolve, attempt * 5000);
    }),
};

// A dependency file's URL pin, or undefined unless it has an SRI integrity, a positive byte length and https URLs.
const asUrlPin = (label: string, file: Readonly<Record<string, unknown>>): UrlPin | undefined => {
  const { integrity, byteLength, origin } = file;
  const urls: unknown = isRecord(origin) && origin['kind'] === 'url' ? origin['urls'] : undefined;
  const valid =
    typeof integrity === 'string' &&
    sriPattern.test(integrity) &&
    Number.isSafeInteger(byteLength) &&
    Number(byteLength) > 0 &&
    Array.isArray(urls) &&
    urls.length > 0 &&
    urls.every((url) => typeof url === 'string' && url.startsWith('https://'));
  return valid ? { label, integrity, byteLength: Number(byteLength), urls: urls as string[] } : undefined;
};

/**
 * Every dependency file of one name that a manifest pins by URL, in manifest order.
 * @param manifest - A parsed `tau-plugin.json`.
 * @param name - The dependency file name, such as `dotnet`.
 * @returns The pins, labelled `<dependency>/<name>@<os>-<arch>`.
 * @throws When the manifest is not schema v1, a pin has no SRI integrity, byte length or URL, or none is named so.
 */
export const urlPins = (manifest: unknown, name: string): UrlPin[] => {
  if (!isRecord(manifest) || manifest['schemaVersion'] !== 1 || !isRecord(manifest['dependencies'])) {
    throw new Error('Not a tau-plugin.json schema v1 manifest.');
  }
  const pins: UrlPin[] = [];
  for (const [dependency, variants] of Object.entries(manifest['dependencies'])) {
    for (const variant of Array.isArray(variants) ? variants : []) {
      const target: unknown = isRecord(variant) ? variant['target'] : undefined;
      const files: unknown = isRecord(variant) ? variant['files'] : undefined;
      for (const file of Array.isArray(files) ? files : []) {
        if (!isRecord(file) || file['name'] !== name) {
          continue;
        }
        const platform = isRecord(target) ? `${String(target['os'])}-${String(target['arch'])}` : 'any';
        const label = `${dependency}/${name}@${platform}`;
        const pin = asUrlPin(label, file);
        if (pin === undefined) {
          throw new Error(`${label} is not pinned by SRI integrity, a byte length and https URLs.`);
        }
        pins.push(pin);
      }
    }
  }
  if (pins.length === 0) {
    throw new Error(`The manifest pins no dependency file named ${name} by URL.`);
  }
  return pins;
};

/**
 * The key that names a set of blobs: the first 16 hex of the SHA-256 of their sorted, newline-terminated hexes.
 * @param digests - SHA-256 hexes.
 * @returns 16 lowercase hex characters.
 */
export const blobsKey = (digests: readonly string[]): string =>
  createHash('sha256')
    .update(
      [...new Set(digests)]
        .sort()
        .map((digest) => `${digest}\n`)
        .join(''),
    )
    .digest('hex')
    .slice(0, 16);

type Download = { readonly sha256?: string; readonly failure?: string; readonly final?: boolean };

// One download into `path`: hashed with the pinned algorithm and SHA-256, refused past the pinned length.
const downloadOnce = async (request: {
  readonly pin: UrlPin;
  readonly url: string;
  readonly path: string;
  readonly transport: typeof fetch;
}): Promise<Download> => {
  const { pin, url, path, transport } = request;
  const { algorithm, digest } = sriPattern.exec(pin.integrity)!.groups!;
  let response: Response;
  try {
    response = await transport(url, { redirect: 'follow' });
  } catch (error) {
    return { failure: `${url} could not be fetched: ${describeError(error)}` };
  }
  if (response.status !== 200 || response.body === null) {
    return { failure: `${url} answered HTTP ${String(response.status)}`, final: response.status === 404 };
  }
  const pinned = createHash(algorithm!);
  const sha256 = createHash('sha256');
  const handle = await open(path, 'w');
  let byteLength = 0;
  try {
    // Leaving the loop early cancels the body, so an oversized file is never read to its end.
    for await (const chunk of response.body) {
      byteLength += chunk.byteLength;
      if (byteLength > pin.byteLength) {
        return { failure: `${url} serves more than the pinned ${String(pin.byteLength)} bytes`, final: true };
      }
      pinned.update(chunk);
      sha256.update(chunk);
      // oxlint-disable-next-line no-await-in-loop -- chunks are written in order
      await handle.write(chunk);
    }
  } catch (error) {
    return { failure: `${url} was cut off after ${String(byteLength)} bytes: ${describeError(error)}` };
  } finally {
    await handle.close();
  }
  if (byteLength !== pin.byteLength) {
    return { failure: `${url} served ${String(byteLength)} bytes, not the pinned ${String(pin.byteLength)}` };
  }
  if (pinned.digest('base64') !== digest) {
    return { failure: `${url} does not match ${pin.integrity}`, final: true };
  }
  return { sha256: sha256.digest('hex') };
};

/**
 * Download one pinned file from the first of its URLs that serves the pinned bytes.
 * @param options - The pin, where to write it, the transport and the retry policy.
 * @param options.pin - The dependency file pin.
 * @param options.out - The directory the verified file is written to, as `<sha256 hex>`.
 * @param options.transport - The `fetch` to use.
 * @param options.retry - How often a URL that is not served whole is fetched again.
 * @returns The verified file's plan row.
 * @throws When no URL serves the pinned bytes.
 */
export const fetchPinned = async (options: {
  readonly pin: UrlPin;
  readonly out: string;
  readonly transport: typeof fetch;
  readonly retry?: RetryPolicy;
}): Promise<PlanRow> => {
  const { pin, out, transport } = options;
  const retry = options.retry ?? defaultRetry;
  const partial = join(out, `${createHash('sha256').update(pin.label).digest('hex').slice(0, 16)}.partial`);
  const failures: string[] = [];
  for (const url of pin.urls) {
    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      if (attempt > 1) {
        // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
        await retry.wait(attempt - 1);
      }
      // oxlint-disable-next-line no-await-in-loop -- URLs are tried in order, one download at a time
      const result = await downloadOnce({ pin, url, path: partial, transport });
      if (result.sha256 !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- the first verified download ends the search
        await rename(partial, join(out, result.sha256));
        return { sha256: result.sha256, byteLength: pin.byteLength, label: pin.label };
      }
      if (attempt === retry.attempts || result.final === true) {
        failures.push(result.failure!);
        break;
      }
    }
  }
  await rm(partial, { force: true });
  throw new Error(`${pin.label}: no pinned URL serves ${pin.integrity} (${failures.join('; ')}).`);
};

/**
 * Parse a plan written by `fetch`.
 * @param text - The `plan.tsv` contents.
 * @returns Its rows.
 * @throws When a row is not `<sha256>\t<byteLength>\t<label>`, or the plan is empty.
 */
export const parsePlan = (text: string): PlanRow[] => {
  const rows = text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [sha256, length, label, ...rest] = line.split('\t');
      const byteLength = Number(length);
      if (
        !hex64.test(sha256 ?? '') ||
        !Number.isSafeInteger(byteLength) ||
        byteLength <= 0 ||
        !label ||
        rest.length > 0
      ) {
        throw new Error(`Not a plan row: ${JSON.stringify(line)}.`);
      }
      return { sha256: sha256!, byteLength, label };
    });
  if (rows.length === 0) {
    throw new Error('The plan lists no blob.');
  }
  return rows;
};

const checkOnce = async (row: PlanRow, url: string, transport: typeof fetch): Promise<Download> => {
  let response: Response;
  try {
    response = await transport(url, { redirect: 'error' });
  } catch (error) {
    return { failure: `${url} could not be fetched: ${describeError(error)}` };
  }
  if (response.status !== 200 || response.body === null) {
    return { failure: `${url} answered HTTP ${String(response.status)}` };
  }
  const hash = createHash('sha256');
  let byteLength = 0;
  try {
    for await (const chunk of response.body) {
      byteLength += chunk.byteLength;
      if (byteLength > row.byteLength) {
        return { failure: `${url} serves more than ${String(row.byteLength)} bytes`, final: true };
      }
      hash.update(chunk);
    }
  } catch (error) {
    return { failure: `${url} was cut off after ${String(byteLength)} bytes: ${describeError(error)}` };
  }
  if (byteLength !== row.byteLength) {
    return { failure: `${url} served ${String(byteLength)} bytes, not ${String(row.byteLength)}` };
  }
  return hash.digest('hex') === row.sha256 ? {} : { failure: `${url} does not hash to ${row.sha256}`, final: true };
};

/**
 * Prove that a host serves every planned blob at `<base>blobs/sha256/<hex>` with its digest and byte length.
 * @param options - The plan, the host base, the transport and the retry policy.
 * @param options.rows - The planned blobs.
 * @param options.base - The host, ending in `/`.
 * @param options.transport - The `fetch` to use.
 * @param options.retry - How often a blob that is not served yet or was cut off is fetched again.
 * @returns One line per blob the host does not serve with its digest.
 */
export const checkServed = async (options: {
  readonly rows: readonly PlanRow[];
  readonly base: string;
  readonly transport: typeof fetch;
  readonly retry?: RetryPolicy;
}): Promise<string[]> => {
  const { rows, base, transport } = options;
  const retry = options.retry ?? defaultRetry;
  const failures: string[] = [];
  for (const row of rows) {
    const url = `${base}blobs/sha256/${row.sha256}`;
    let result: Download = {};
    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      if (attempt > 1) {
        // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
        await retry.wait(attempt - 1);
      }
      // oxlint-disable-next-line no-await-in-loop -- blobs are proven one at a time
      result = await checkOnce(row, url, transport);
      if (result.failure === undefined || result.final === true) {
        break;
      }
    }
    if (result.failure !== undefined) {
      failures.push(`${row.label}: ${result.failure}`);
    }
  }
  return failures;
};

/** Where the command line writes. */
export type Io = { readonly out: (line: string) => void; readonly err: (line: string) => void };

const usage =
  'Usage: node scripts/src/mirror-dependency-files.ts fetch --manifest <tau-plugin.json> --name <file name> --tag-name <name> --out <dir> [--tag <tag>] | check --plan <plan.tsv> --base <url>';

const flags = (args: readonly string[], names: readonly string[], optional: readonly string[] = []) => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!.replace(/^--/u, '');
    const value = args[index + 1];
    if (!args[index]!.startsWith('--') || ![...names, ...optional].includes(name) || value === undefined) {
      return undefined;
    }
    values.set(name, value);
  }
  return names.every((name) => values.has(name)) ? values : undefined;
};

/**
 * Run one command.
 * @param argv - The arguments after the script path.
 * @param io - Where to write results and diagnostics.
 * @param network - The `fetch` to use and how it retries; by default the global `fetch` with three attempts.
 * @param network.transport - The `fetch` to use.
 * @param network.retry - The retry policy.
 * @returns The exit code.
 */
export const run = async (
  argv: readonly string[],
  io: Io,
  network?: { readonly transport: typeof fetch; readonly retry: RetryPolicy },
): Promise<number> => {
  const [command, ...args] = argv;
  const { transport, retry } = network ?? { transport: fetch, retry: defaultRetry };
  const options =
    command === 'fetch'
      ? flags(args, ['manifest', 'name', 'tag-name', 'out'], ['tag'])
      : command === 'check'
        ? flags(args, ['plan', 'base'])
        : undefined;
  const base = options?.get('base');
  if (
    options === undefined ||
    (command === 'fetch' && !tagNamePattern.test(options.get('tag-name')!)) ||
    (base !== undefined && !/^https:\/\/[^/]+\/$/u.test(base))
  ) {
    io.err(usage);
    return 2;
  }
  const value = (name: string): string => options.get(name)!;
  try {
    if (command === 'check') {
      const rows = parsePlan(await readFile(value('plan'), 'utf8'));
      const failures = await checkServed({ rows, base: value('base'), transport, retry });
      if (failures.length > 0) {
        io.err(`Planned blobs not served with their digest at ${value('base')}:\n  ${failures.join('\n  ')}`);
        return 1;
      }
      io.out(`Every planned blob (${String(rows.length)}) is served with its digest at ${value('base')}blobs/sha256/.`);
      return 0;
    }
    const pins = urlPins(JSON.parse(await readFile(value('manifest'), 'utf8')), value('name'));
    await mkdir(value('out'), { recursive: true });
    const rows: PlanRow[] = [];
    for (const pin of pins) {
      // oxlint-disable-next-line no-await-in-loop -- archives are downloaded one at a time
      const row = await fetchPinned({ pin, out: value('out'), transport, retry });
      io.err(`${row.label}: ${String(row.byteLength)} bytes match ${pin.integrity}; sha256 ${row.sha256}.`);
      rows.push(row);
    }
    const key = blobsKey(rows.map((row) => row.sha256));
    const tag = `dependency@${value('tag-name')}-${key}`;
    if (options.has('tag') && value('tag') !== tag) {
      io.err(`The tag ${value('tag')} does not name these bytes; they are ${tag}. Nothing is published.`);
      return 1;
    }
    const unique = [...new Map(rows.map((row) => [row.sha256, row])).values()];
    await writeFile(
      join(value('out'), 'plan.tsv'),
      unique.map((row) => `${row.sha256}\t${String(row.byteLength)}\t${row.label}\n`).join(''),
    );
    io.out(`key=${key}`);
    io.out(`tag=${tag}`);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2), {
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  });
}
