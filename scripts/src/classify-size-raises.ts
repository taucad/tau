/**
 * Classify every raised `.size-limit.json` limit as one an agent may make or one the operator decides.
 *
 * The band is `docs/policy/npm-policy.md` § 7 "Changing a size budget": a code entry may grow by at most
 * 10 % of its base limit and 10 kB, a binary-asset entry by at most 5 %, and an entry by at most 20 % over
 * its limit at program start (`--program-base`). Reserved entries always go to the operator. Entries are
 * matched by `path`, so updating the `measured … on <date>` note in a name does not hide a raise. Limits
 * are parsed the way `size-limit` parses them (`bytes-iec`: `1 kB` is 1,000 bytes, `1 KiB` is 1,024).
 *
 * Usage: node scripts/src/classify-size-raises.ts [--base <ref>] [--program-base <ref>]
 *   --base <ref>           Ref to compare against (default `origin/main`).
 *   --program-base <ref>   Ref the current program started from, for the cumulative cap.
 * Exit codes: 0 every raise is within the band; 1 a raise needs the operator; 2 usage or git failure.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** One `size-limit` check, as `.size-limit.json` declares it. */
export type SizeLimitEntry = {
  readonly name?: string;
  readonly path: string | readonly string[];
  readonly limit: string;
};

/** One raised limit and who decides it. */
export type SizeRaise = {
  readonly config: string;
  readonly name: string;
  readonly kind: 'code' | 'asset';
  readonly from: number;
  readonly to: number;
  readonly decision: 'autonomous' | 'operator';
  readonly reasons: readonly string[];
};

export const codeRaiseRatio = 0.1;
export const codeRaiseBytes = 10_000;
export const assetRaiseRatio = 0.05;
export const programRaiseRatio = 0.2;

/** Entries whose every raise the operator decides, by config file and `path`. */
export const reservedEntries: ReadonlyArray<{ readonly config: string; readonly path: string }> = [
  { config: 'packages/runtime/.size-limit.json', path: '["dist/**/*.mjs","!dist/**/wasm/**","!dist/**/fonts/**"]' },
  { config: 'packages/runtime/.size-limit.json', path: '["dist/index.mjs"]' },
];

const units: Readonly<Record<string, number>> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  kib: 2 ** 10,
  mib: 2 ** 20,
  gib: 2 ** 30,
};

/**
 * Parse a `size-limit` limit into bytes.
 * @param limit - A limit such as `8 kB`, `2.5 MB` or `500 B`.
 * @returns The limit in bytes.
 */
export const parseLimit = (limit: string): number => {
  const match = /^(?<value>\d+(?:\.\d+)?)\s*(?<unit>[a-z]*)$/iu.exec(limit.trim());
  const unit = match?.groups?.['unit'];
  const factor = units[unit ? unit.toLowerCase() : 'b'];
  if (!match || factor === undefined) {
    throw new Error(`Unrecognized size limit '${limit}'`);
  }
  return Math.round(Number(match.groups!['value']) * factor);
};

const pathsOf = (entry: SizeLimitEntry): readonly string[] =>
  typeof entry.path === 'string' ? [entry.path] : entry.path;

/** The key an entry keeps across renames of its `name`. */
export const entryKey = (entry: SizeLimitEntry): string => JSON.stringify(pathsOf(entry));

/** Code measures JavaScript, HTML or CSS; everything else (WASM, fonts, images, models, maps) is an asset. */
export const entryKind = (entry: SizeLimitEntry): SizeRaise['kind'] =>
  pathsOf(entry).some((path) => !path.startsWith('!') && /\.(?:m|c)?js$|\.html$|\.css$/u.test(path)) ? 'code' : 'asset';

const percent = (ratio: number): string => `${(ratio * 100).toFixed(1)} %`;

/**
 * Classify the raised limits of one config file.
 * @param config - The config's repository-relative path.
 * @param head - The entries now.
 * @param baselines - The entries at the base ref (`undefined` for a new file) and at program start, when known.
 * @returns One row per raised limit.
 */
export const classifyConfig = (
  config: string,
  head: readonly SizeLimitEntry[],
  baselines: {
    readonly base: readonly SizeLimitEntry[] | undefined;
    readonly programBase?: readonly SizeLimitEntry[] | undefined;
  },
): SizeRaise[] => {
  const { base, programBase } = baselines;
  const byKey = (entries: readonly SizeLimitEntry[] | undefined) =>
    new Map((entries ?? []).map((entry) => [entryKey(entry), entry]));
  const baseEntries = byKey(base);
  const programEntries = byKey(programBase);
  const raises: SizeRaise[] = [];

  for (const entry of head) {
    const key = entryKey(entry);
    const before = baseEntries.get(key);
    if (before === undefined) {
      continue;
    }
    const from = parseLimit(before.limit);
    const to = parseLimit(entry.limit);
    if (to <= from) {
      continue;
    }
    const kind = entryKind(entry);
    const growth = to - from;
    const reasons: string[] = [];
    if (reservedEntries.some((reserved) => reserved.config === config && reserved.path === key)) {
      reasons.push('reserved entry');
    }
    if (kind === 'code' && growth > from * codeRaiseRatio) {
      reasons.push(`+${percent(growth / from)} exceeds ${percent(codeRaiseRatio)}`);
    }
    if (kind === 'code' && growth > codeRaiseBytes) {
      reasons.push(`+${String(growth)} B exceeds ${String(codeRaiseBytes)} B`);
    }
    if (kind === 'asset' && growth > from * assetRaiseRatio) {
      reasons.push(`+${percent(growth / from)} exceeds ${percent(assetRaiseRatio)} for an asset`);
    }
    const start = programEntries.get(key);
    if (start !== undefined) {
      const startLimit = parseLimit(start.limit);
      if (to - startLimit > startLimit * programRaiseRatio) {
        reasons.push(
          `+${percent((to - startLimit) / startLimit)} since program start exceeds ${percent(programRaiseRatio)}`,
        );
      }
    }
    raises.push({
      config,
      name: (entry.name ?? key).split(' — ')[0]!,
      kind,
      from,
      to,
      decision: reasons.length === 0 ? 'autonomous' : 'operator',
      reasons,
    });
  }
  return raises;
};

const git = (root: string, args: readonly string[]): string =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const configAt = (root: string, ref: string, config: string): SizeLimitEntry[] | undefined => {
  try {
    return JSON.parse(git(root, ['show', `${ref}:${config}`])) as SizeLimitEntry[];
  } catch {
    return undefined;
  }
};

/**
 * Classify every raised limit in the working tree against a base ref.
 * @param root - The repository root.
 * @param base - The ref to compare against.
 * @param programBase - The ref the program started from, when known.
 * @returns One row per raised limit.
 */
export const classifySizeRaises = (root: string, base: string, programBase?: string): SizeRaise[] =>
  git(root, ['ls-files', '--', '.size-limit.json', '**/.size-limit.json'])
    .split('\n')
    .filter(Boolean)
    .flatMap((config) =>
      classifyConfig(config, JSON.parse(readFileSync(join(root, config), 'utf8')) as SizeLimitEntry[], {
        base: configAt(root, base, config),
        programBase: programBase === undefined ? undefined : configAt(root, programBase, config),
      }),
    );

/** Render the rows as a Markdown table for a PR body or state log. */
export const sizeRaiseReport = (raises: readonly SizeRaise[]): string =>
  raises.length === 0
    ? 'No size budget raises.'
    : [
        '| Config | Entry | Kind | Limit | Decision |',
        '| --- | --- | --- | --- | --- |',
        ...raises.map(
          ({ config, name, kind, from, to, decision, reasons }) =>
            `| ${config} | ${name} | ${kind} | ${String(from)} → ${String(to)} B (+${percent((to - from) / from)}) | ${decision === 'autonomous' ? 'autonomous' : `operator: ${reasons.join('; ')}`} |`,
        ),
      ].join('\n');

const main = (): void => {
  const argv = process.argv.slice(2);
  let base = 'origin/main';
  let programBase: string | undefined;
  while (argv.length > 0) {
    const [flag, value] = argv.splice(0, 2);
    if (value === undefined || value === '' || (flag !== '--base' && flag !== '--program-base')) {
      console.error('Usage: node scripts/src/classify-size-raises.ts [--base <ref>] [--program-base <ref>]');
      process.exitCode = 2;
      return;
    }
    if (flag === '--base') {
      base = value;
    } else {
      programBase = value;
    }
  }
  const root = resolve(import.meta.dirname, '../..');
  for (const ref of [base, programBase].filter((ref) => ref !== undefined)) {
    try {
      git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    } catch {
      console.error(`Unknown ref '${ref}'`);
      process.exitCode = 2;
      return;
    }
  }
  const raises = classifySizeRaises(root, base, programBase);
  console.log(sizeRaiseReport(raises));
  process.exitCode = raises.some(({ decision }) => decision === 'operator') ? 1 : 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
