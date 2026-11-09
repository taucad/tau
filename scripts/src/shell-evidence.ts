/**
 * Shell conformance evidence under the Nx cache: the environment fingerprint a cached verdict is keyed on, the
 * verdict record a passing target leaves beside its receipt, and the stamp that says whether a row's receipt was
 * proven by this run or reused from an earlier one.
 *
 * A conformance receipt proves the code works on one machine: its OS, kernel, Bash, runner image, sandbox runtime and
 * (on Linux) bubblewrap and socat. None of that is in the Nx hash, so `fingerprint` puts it there as a `runtime`
 * input. It fails closed: unless the run asked for reuse (`TAU_SHELL_EVIDENCE=reuse`) on a GitHub-hosted conformance
 * row, and every probe answered, it prints a fresh random nonce, so the task hash matches nothing stored before and
 * nothing stored after. Nx hashes a runtime command's output whatever its exit status, so a probe that fails quietly
 * must never print something stable; a candidate, drift or promotion run therefore cannot hit the cache even if its
 * `--skip-nx-cache` is dropped. CF-1 of the CI program (tau-brain `research/artifacts/ci-throughput-review/handoff/
 * resume.md`, Wave 0M).
 *
 * Usage:
 *   node scripts/src/shell-evidence.ts fingerprint                     the runtime input of a cacheable conformance
 *                                                                      target; prints one line, always exits 0
 *   node scripts/src/shell-evidence.ts record                          the last command of such a target: writes
 *                                                                      `<receipt>.verdict.json` (cached with it)
 *   node scripts/src/shell-evidence.ts stamp <row dir> <receipt>...    an uncached workflow step after the targets
 * Env: TAU_SHELL_EVIDENCE (`reuse` or `fresh`), TAU_SHELL_CONFORMANCE_ROW, TAU_SHELL_TIER (`semantics` or `full`),
 * GITHUB_ACTIONS, ImageOS, ImageVersion, TAU_SHELL_CONFORMANCE_BWRAP (Linux), TAU_SHELL_GUEST_IMAGE (Linux guest
 * rows), TAU_SHELL_CONFORMANCE_RECEIPT and NX_TASK_HASH (record), GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY,
 * GITHUB_SERVER_URL, GITHUB_STEP_SUMMARY (stamp).
 * Exit codes: 0 ok (record without a CI identity writes nothing and still exits 0); 1 refused, or record found no
 * receipt after its suite passed (a reused receipt where fresh evidence is required, or one whose record does not match
 * this row's environment); 2 usage.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform, release, version } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const fingerprintSchema = 'tau.shell-environment-fingerprint/1';
const verdictSchema = 'tau.shell-conformance.verdict/1';
const stampSchema = 'tau.shell-conformance.stamp/1';

/** The command every cacheable conformance target names as its `runtime` input, verbatim. */
export const fingerprintCommand = 'node scripts/src/shell-evidence.ts fingerprint';
/** The command every cacheable conformance target runs after its suite passed. */
export const recordCommand = 'node "$NX_WORKSPACE_ROOT/scripts/src/shell-evidence.ts" record';

type Row = 'LNX-U' | 'LNX-U26' | 'LNX-D' | 'MAC-A' | 'MAC-X';

/** Each row's platform, architecture and (Linux) the one guest release it admits. */
const rows: Readonly<Record<Row, { platform: NodeJS.Platform; arch: string; os?: string }>> = {
  'LNX-U': { platform: 'linux', arch: 'x64', os: 'ubuntu 24.04' },
  'LNX-U26': { platform: 'linux', arch: 'x64', os: 'ubuntu 26.04' },
  'LNX-D': { platform: 'linux', arch: 'x64', os: 'debian 13' },
  'MAC-A': { platform: 'darwin', arch: 'arm64' },
  'MAC-X': { platform: 'darwin', arch: 'x64' },
};
const tiers = new Set(['semantics', 'full']);

const isRow = (value: string | undefined): value is Row => value !== undefined && Object.hasOwn(rows, value);

/** What the fingerprint reads from the machine, injectable so the fail-closed rules are testable anywhere. */
export type Probe = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly kernel: () => string;
  readonly node: () => string;
  /** The first line a command prints; throws on a nonzero exit, a timeout or empty output. */
  readonly run: (file: string, args: readonly string[]) => string;
  readonly readFile: (path: string) => string;
  /** The sha256 of one file; throws when it is missing. */
  readonly digest: (path: string) => string;
  /** The sha256 over every file under a directory, by sorted relative path. */
  readonly digestTree: (path: string) => string;
  /** The installed directory of a package as `native-process-core` resolves it. */
  readonly packageRoot: (name: string) => string;
};

export type Fingerprint =
  | { readonly ok: true; readonly fields: Readonly<Record<string, string>>; readonly digest: string }
  | { readonly ok: false; readonly reason: string };

const sha256 = (data: string): string => createHash('sha256').update(data).digest('hex');

/** Canonical JSON: sorted keys, so the same environment always prints the same bytes. */
const canonical = (fields: Readonly<Record<string, string>>): string =>
  JSON.stringify(Object.fromEntries(Object.entries(fields).toSorted(([a], [b]) => a.localeCompare(b))));

const osReleaseField = (text: string, name: string): string =>
  new RegExp(`^${name}="?([^"\\n]*)"?$`, 'mu').exec(text)?.[1] ?? '';

/**
 * Every identity a conformance verdict depends on beyond the source closure Nx already hashes, or the reason it
 * cannot be taken. Any probe that throws refuses the whole fingerprint.
 */
export const collectFingerprint = (probe: Probe): Fingerprint => {
  const { env } = probe;
  const refuse = (reason: string): Fingerprint => ({ ok: false, reason });
  if (env['TAU_SHELL_EVIDENCE'] !== 'reuse') {
    return refuse('this run requires fresh evidence (TAU_SHELL_EVIDENCE is not reuse)');
  }
  if (env['GITHUB_ACTIONS'] !== 'true') {
    return refuse('not a GitHub Actions conformance row');
  }
  const row = env['TAU_SHELL_CONFORMANCE_ROW'];
  if (!isRow(row)) {
    return refuse('TAU_SHELL_CONFORMANCE_ROW names no conformance row');
  }
  const tier = env['TAU_SHELL_TIER'] ?? '';
  if (!tiers.has(tier)) {
    return refuse('TAU_SHELL_TIER is neither semantics nor full');
  }
  const expected = rows[row];
  if (probe.platform !== expected.platform || probe.arch !== expected.arch) {
    return refuse(`${row} runs on ${expected.platform}-${expected.arch}, not ${probe.platform}-${probe.arch}`);
  }
  const imageOs = env['ImageOS'] ?? '';
  const imageVersion = env['ImageVersion'] ?? '';
  if (imageOs === '' || imageVersion === '') {
    return refuse('no hosted runner image identity (ImageOS, ImageVersion)');
  }
  try {
    const fields: Record<string, string> = {
      schema: fingerprintSchema,
      row,
      tier,
      runnerImage: `${imageOs} ${imageVersion}`,
      kernel: probe.kernel(),
      node: probe.node(),
      bash: `${probe.run('/bin/bash', ['--version'])} sha256:${probe.digest('/bin/bash')}`,
      ripgrep: probe.run('rg', ['--version']),
    };
    const runtime = probe.packageRoot('@anthropic-ai/sandbox-runtime');
    const runtimeVersion = (JSON.parse(probe.readFile(join(runtime, 'package.json'))) as { version?: string }).version;
    fields['sandboxRuntime'] = `${runtimeVersion ?? ''} sha256:${probe.digestTree(runtime)}`;
    const pty = probe.packageRoot('node-pty');
    const ptyVersion = (JSON.parse(probe.readFile(join(pty, 'package.json'))) as { version?: string }).version;
    const ptyBinary = [
      join(pty, 'build', 'Release', 'pty.node'),
      join(pty, 'prebuilds', `${probe.platform}-${probe.arch}`, 'pty.node'),
    ].flatMap((path) => {
      try {
        return [`sha256:${probe.digest(path)}`];
      } catch {
        return [];
      }
    });
    if (ptyBinary.length === 0) {
      return refuse('node-pty has no native binary');
    }
    fields['nodePty'] = `${ptyVersion ?? ''} ${ptyBinary[0]}`;
    if (expected.platform === 'darwin') {
      fields['os'] =
        `macOS ${probe.run('/usr/bin/sw_vers', ['-productVersion'])} ${probe.run('/usr/bin/sw_vers', ['-buildVersion'])}`;
      fields['seatbelt'] = `sha256:${probe.digest('/usr/bin/sandbox-exec')}`;
      fields['zsh'] = `sha256:${probe.digest('/bin/zsh')}`;
    } else {
      const osRelease = probe.readFile('/etc/os-release');
      const os = `${osReleaseField(osRelease, 'ID')} ${osReleaseField(osRelease, 'VERSION_ID')}`;
      if (os !== expected.os) {
        return refuse(`${row} admits ${expected.os ?? ''}, not ${os}`);
      }
      const guestImage = env['TAU_SHELL_GUEST_IMAGE'] ?? '';
      if (!/^sha(?:256|512):[0-9a-f]{64,128}$/u.test(guestImage)) {
        return refuse('no guest image digest (TAU_SHELL_GUEST_IMAGE)');
      }
      const bwrap = env['TAU_SHELL_CONFORMANCE_BWRAP'] ?? '';
      if (bwrap === '') {
        return refuse('no bubblewrap under test (TAU_SHELL_CONFORMANCE_BWRAP)');
      }
      fields['os'] = os;
      fields['guestImage'] = guestImage;
      fields['bwrap'] = `${probe.run(bwrap, ['--version'])} sha256:${probe.digest(bwrap)}`;
      fields['socat'] = probe.run('socat', ['-V']);
      fields['userns'] = probe.readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns').trim();
    }
    return { ok: true, fields, digest: sha256(canonical(fields)) };
  } catch (error) {
    return refuse(`a probe failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
};

/** The line Nx hashes: the canonical fields, or a nonce that never repeats. */
export const renderFingerprint = (fingerprint: Fingerprint, nonce: () => string = randomUUID): string =>
  fingerprint.ok
    ? `${fingerprintSchema} sha256:${fingerprint.digest} ${canonical(fingerprint.fields)}`
    : `${fingerprintSchema} unfingerprinted nonce:${nonce()} (${fingerprint.reason})`;

const firstLine = (output: string): string =>
  output
    .split('\n')
    .find((line) => line.trim() !== '')
    ?.trim() ?? '';

const fileDigest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const treeDigest = (root: string): string => {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  walk(root);
  return sha256(
    files
      .map((path) => relative(root, path))
      .toSorted()
      .map((path) => `${path}\0${fileDigest(join(root, path))}`)
      .join('\n'),
  );
};

const workspaceRoot = resolve(import.meta.dirname, '../..');

/** The machine this process runs on. */
export const hostProbe = (): Probe => {
  const resolveFrom = createRequire(join(workspaceRoot, 'packages/core/native-process/package.json'));
  return {
    env: process.env,
    platform: platform(),
    arch: arch(),
    kernel: () => `${release()} ${version()}`,
    node: () => `${process.version} abi ${process.versions.modules}`,
    run: (file, args) => {
      const line = firstLine(
        execFileSync(file, args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }),
      );
      if (line === '') {
        throw new Error(`${file} printed nothing`);
      }
      return line;
    },
    readFile: (path) => readFileSync(path, 'utf8'),
    digest: (path) => {
      if (!statSync(path).isFile()) {
        throw new Error(`${path} is not a file`);
      }
      return fileDigest(path);
    },
    digestTree: treeDigest,
    packageRoot: (name) => dirname(resolveFrom.resolve(`${name}/package.json`)),
  };
};

type Identity = { readonly sha: string; readonly run: string };

const runIdentity = (env: Readonly<Record<string, string | undefined>>): Identity | undefined => {
  const sha = env['GITHUB_SHA'] ?? '';
  const server = env['GITHUB_SERVER_URL'] ?? '';
  const repository = env['GITHUB_REPOSITORY'] ?? '';
  const runId = env['GITHUB_RUN_ID'] ?? '';
  if (!/^[0-9a-f]{40}$/u.test(sha) || server === '' || repository === '' || !/^\d+$/u.test(runId)) {
    return undefined;
  }
  return { sha, run: `${server}/${repository}/actions/runs/${runId}` };
};

export const verdictPath = (receipt: string): string => receipt.replace(/\.json$/u, '.verdict.json');
export const stampPath = (receipt: string): string => receipt.replace(/\.json$/u, '.stamp.json');

export type VerdictRecord = {
  readonly schema: string;
  readonly task: string;
  readonly taskHash: string;
  readonly row: string;
  readonly tier: string;
  readonly provenAt: Identity & { readonly recordedAt: string };
  readonly fingerprint: string;
};

/** The record a passing target leaves beside its receipt: what was proven, where, and under which fingerprint. */
export const verdictRecord = (
  env: Readonly<Record<string, string | undefined>>,
  fingerprint: Fingerprint,
  now: Date,
): VerdictRecord | { readonly refused: string } => {
  const identity = runIdentity(env);
  const taskHash = env['NX_TASK_HASH'] ?? '';
  const project = env['NX_TASK_TARGET_PROJECT'] ?? '';
  const target = env['NX_TASK_TARGET_TARGET'] ?? '';
  if (identity === undefined || taskHash === '' || project === '' || target === '') {
    return { refused: 'record runs inside an Nx task of a CI row (NX_TASK_HASH, GITHUB_SHA, GITHUB_RUN_ID)' };
  }
  return {
    schema: verdictSchema,
    task: `${project}:${target}`,
    taskHash,
    row: env['TAU_SHELL_CONFORMANCE_ROW'] ?? '',
    tier: env['TAU_SHELL_TIER'] ?? '',
    provenAt: { ...identity, recordedAt: now.toISOString() },
    fingerprint: fingerprint.ok ? `sha256:${fingerprint.digest}` : 'unfingerprinted',
  };
};

type Receipt = { readonly row?: unknown; readonly source?: { readonly sha?: unknown; readonly run?: unknown } };

export type StampResult =
  | { readonly ok: true; readonly stamp: Readonly<Record<string, unknown>>; readonly line: string }
  | { readonly ok: false; readonly line: string };

/**
 * Judge one receipt of this row. Fresh: written by this run on this commit. Reused: restored by an Nx cache hit, so
 * it carries the commit and run that first proved the verdict; accepted only when this run asked for reuse and the
 * restored record names this row, this tier and this machine's current fingerprint.
 */
export const judgeReceipt = (input: {
  readonly name: string;
  readonly receipt: Receipt | undefined;
  readonly verdict: VerdictRecord | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fingerprint: Fingerprint;
}): StampResult => {
  const { name, receipt, verdict, env, fingerprint } = input;
  const row = env['TAU_SHELL_CONFORMANCE_ROW'] ?? '';
  const tier = env['TAU_SHELL_TIER'] ?? '';
  const evidence = env['TAU_SHELL_EVIDENCE'] === 'reuse' ? 'reuse' : 'fresh';
  const current = runIdentity(env);
  const refuse = (why: string): StampResult => ({ ok: false, line: `${row} ${name}: refused, ${why}` });
  if (current === undefined) {
    return refuse('no run identity (GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY, GITHUB_SERVER_URL)');
  }
  if (receipt === undefined) {
    return refuse('no receipt');
  }
  if (receipt.row !== row) {
    return refuse(`the receipt is for row ${String(receipt.row)}`);
  }
  const base = { schema: stampSchema, receipt: name, row, tier, evidence, testedAt: current };
  if (receipt.source?.sha === current.sha && receipt.source.run === current.run) {
    return {
      ok: true,
      stamp: { ...base, verdict: 'fresh' },
      line: `${row} ${name}: fresh, proven at ${current.sha} in ${current.run}`,
    };
  }
  const provenSha = String(receipt.source?.sha);
  if (evidence !== 'reuse') {
    return refuse(`this run requires fresh evidence and the receipt was proven at ${provenSha}`);
  }
  if (verdict?.schema !== verdictSchema) {
    return refuse('a reused receipt has no verdict record');
  }
  if (verdict.provenAt.sha !== receipt.source?.sha || verdict.provenAt.run !== receipt.source.run) {
    return refuse('the verdict record and the receipt name different runs');
  }
  if (verdict.row !== row || verdict.tier !== tier) {
    return refuse(`the verdict was proven on ${verdict.row} ${verdict.tier}`);
  }
  if (!fingerprint.ok) {
    return refuse(`this machine has no fingerprint: ${fingerprint.reason}`);
  }
  if (verdict.fingerprint !== `sha256:${fingerprint.digest}`) {
    return refuse(`the verdict was proven under fingerprint ${verdict.fingerprint}, not sha256:${fingerprint.digest}`);
  }
  return {
    ok: true,
    stamp: {
      ...base,
      verdict: 'reused',
      taskHash: verdict.taskHash,
      task: verdict.task,
      fingerprint: verdict.fingerprint,
      provenAt: verdict.provenAt,
    },
    line: `${row} ${name}: verdict reused from hash ${verdict.taskHash}, first proven at ${verdict.provenAt.sha} in ${verdict.provenAt.run}`,
  };
};

const readJson = <T>(path: string): T | undefined => {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

/** A shell conformance or qualification target, by the names the workspace gives them. */
export const isConformanceTarget = (target: string): boolean =>
  /^test:[\w-]*conformance$|^test:shell-qualification$/u.test(target);

/** The slice of an Nx target configuration the cache guard reads. */
export type TargetConfiguration = {
  readonly cache?: boolean;
  readonly inputs?: readonly unknown[];
  readonly outputs?: readonly string[];
  readonly options?: { readonly command?: unknown; readonly env?: Readonly<Record<string, unknown>> };
};

const receiptOutputs = /^\{workspaceRoot\}\/out\/test-results\/shell-conformance\/\*\/[\w-]+(?:\.verdict)?\.json$/u;

/**
 * Why a conformance target could replay false evidence from the cache, or nothing. A target is either uncached, or
 * cacheable with the whole source closure (`default`, `^default`, every external dependency), the environment
 * fingerprint as a runtime input, outputs that are only its own receipt files, and the verdict record as its last
 * command; failures are never cached.
 */
export const cacheViolations = (target: string, configuration: TargetConfiguration): readonly string[] => {
  if (configuration.cache === false) {
    return [];
  }
  const inputs = configuration.inputs ?? [];
  const has = (input: string): boolean => inputs.includes(input);
  const problems: string[] = [];
  if (configuration.cache !== true) {
    problems.push(`${target}: cache is neither false nor an explicit true`);
  }
  if (!has('default') || !has('^default')) {
    problems.push(`${target}: inputs do not cover the source closure (default and ^default)`);
  }
  const fingerprints = inputs.filter(
    (input) =>
      typeof input === 'object' && input !== null && (input as { runtime?: unknown }).runtime === fingerprintCommand,
  );
  if (fingerprints.length !== 1) {
    problems.push(`${target}: no environment fingerprint input { runtime: '${fingerprintCommand}' }`);
  }
  for (const input of inputs) {
    if (typeof input === 'string' && input.startsWith('!')) {
      problems.push(`${target}: input ${input} narrows the source closure`);
    }
    if (typeof input === 'object' && input !== null && 'externalDependencies' in input) {
      problems.push(`${target}: an externalDependencies input drops the other external dependencies from the hash`);
    }
  }
  const outputs = configuration.outputs ?? [];
  if (outputs.length === 0 || !outputs.every((output) => receiptOutputs.test(output))) {
    problems.push(`${target}: outputs must be its receipt files under out/test-results/shell-conformance/*/`);
  }
  const command = configuration.options?.command;
  if (typeof command !== 'string' || !command.endsWith(` && ${recordCommand}`)) {
    problems.push(`${target}: the command does not end with the verdict record (&& ${recordCommand})`);
  }
  if (configuration.options?.env !== undefined && 'NX_CACHE_FAILURES' in configuration.options.env) {
    problems.push(`${target}: NX_CACHE_FAILURES would cache a failed row`);
  }
  return problems;
};

export const main = (argv: readonly string[], probe: Probe = hostProbe(), now: Date = new Date()): number => {
  const [command, ...rest] = argv;
  if (command === 'fingerprint') {
    console.log(renderFingerprint(collectFingerprint(probe)));
    return 0;
  }
  if (command === 'record') {
    const receipt = probe.env['TAU_SHELL_CONFORMANCE_RECEIPT'];
    if (receipt === undefined || receipt === '') {
      return 0;
    }
    if (!existsSync(receipt)) {
      console.error(`record: no receipt at ${receipt}`);
      return 1;
    }
    const record = verdictRecord(probe.env, collectFingerprint(probe), now);
    if ('refused' in record) {
      // Without a record the receipt can still be read as fresh evidence; a later cache hit on it is refused by stamp.
      console.error(`record: no verdict record written, ${record.refused}`);
      return 0;
    }
    writeFileSync(verdictPath(receipt), `${JSON.stringify(record, undefined, 2)}\n`);
    return 0;
  }
  if (command === 'stamp' && rest.length >= 2) {
    const [directory = '', ...names] = rest;
    const fingerprint = collectFingerprint(probe);
    let status = 0;
    const lines: string[] = [];
    for (const name of names) {
      const receipt = join(directory, name);
      const result = judgeReceipt({
        name,
        receipt: readJson<Receipt>(receipt),
        verdict: readJson<VerdictRecord>(verdictPath(receipt)),
        env: probe.env,
        fingerprint,
      });
      lines.push(result.line);
      if (result.ok) {
        writeFileSync(stampPath(receipt), `${JSON.stringify(result.stamp, undefined, 2)}\n`);
        console.log(result.line);
      } else {
        console.error(result.line);
        status = 1;
      }
    }
    const summary = probe.env['GITHUB_STEP_SUMMARY'];
    if (summary !== undefined && summary !== '') {
      appendFileSync(summary, `${lines.map((line) => `- ${line}`).join('\n')}\n`);
    }
    return status;
  }
  console.error('usage: shell-evidence.ts fingerprint | record | stamp <row directory> <receipt>...');
  return 2;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
