/**
 * T-B22.4 (desktop resilient startup blueprint, I2): the route-qualification recovery scenario.
 *
 * Version A starts with a renderer that cannot load and must reach version B through the recovery window alone, by the
 * guarded automatic install (decision N1): the launch never reaches `home-ready`, the boot watchdog opens the recovery
 * window, the updater has B downloaded and verified, and after the ten-second countdown A installs B and restarts.
 * Nothing touches the app: no click, no probe, no command file.
 *
 * The scenario runs as its own row on its own disposable host, one for each of `windows-nsis`, `linux-apt` and
 * `linux-appimage`, because the route probe (`route-qualification-probe.ts`) turns boot health and the automatic install
 * off by design. So A is an ordinary launch: the only harness inputs are the installed bytes and the update source.
 *
 * - A's renderer is broken by replacing its installed entry document, `resources/ui/client/index.html`, with one that
 *   loads and can never mount the app. A managed AppImage keeps that file inside its image, so the image is rebuilt
 *   around the replaced document with its own runtime and squashfs compressor ({@link rebuildAppImageWithEntry}).
 * - Windows takes B from the run's loopback mirror through the shipping updater (`TAU_DESKTOP_UPDATE_FEED`, a managed
 *   mirror setting release builds honour). APT and the managed AppImage take B as a completed system upgrade: B's
 *   authenticated runtime and selector are installed, and A is started from its own retained generation, as the
 *   launcher does, so its launch check finds B selected.
 * - The verdict is read from what the app itself writes: `logs/desktop.log` (launch boundaries, the recovery window,
 *   the countdown and the install) and `boot-health.json` (B's healthy launch). See {@link assessRecovery}.
 */
import { open, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export type QualificationScenario = 'chain' | 'recovery';

/**
 * The scenario a qualification row runs, from `TAU_QUALIFICATION_SCENARIO`.
 *
 * @param value - The variable's value; absent or empty is the A→B→C chain.
 * @returns The scenario.
 */
export const qualificationScenario = (value: string | undefined): QualificationScenario => {
  if (value === undefined || value === '' || value === 'chain') {
    return 'chain';
  }
  if (value === 'recovery') {
    return 'recovery';
  }
  throw new Error(`Unknown qualification scenario ${JSON.stringify(value)}`);
};

export type RecoveryRoute = 'windows-nsis' | 'linux-apt' | 'linux-appimage';
export type RecoveryScope = 'all' | 'linux' | 'macos' | 'windows';
type RecoveryRow = { readonly id: string; readonly route: RecoveryRoute; readonly target: 'win32-x64' | 'linux-x64' };

/** One recovery row for each route that can install without a renderer (B22). Mac routes have their own updater. */
const rows: readonly RecoveryRow[] = [
  { id: 'windows-nsis-recovery-x64', route: 'windows-nsis', target: 'win32-x64' },
  { id: 'ubuntu-apt-recovery-x11', route: 'linux-apt', target: 'linux-x64' },
  { id: 'ubuntu-appimage-recovery-x11', route: 'linux-appimage', target: 'linux-x64' },
];

/**
 * The recovery rows a qualification scope must produce.
 *
 * @param scope - The dispatch's scope.
 * @returns The rows, in matrix order.
 */
export const recoveryRows = (scope: RecoveryScope): readonly RecoveryRow[] =>
  scope === 'all' ? rows : rows.filter((row) => row.route.startsWith(`${scope}-`));

/** The module that carries decision N1; a baseline without it has no automatic install to qualify. */
export const autoInstallModulePath = 'apps/desktop/src/main/update-auto-install.ts';

/**
 * Refuse a baseline A built before the guarded automatic install. Such a build cannot install without a renderer at
 * all (the B22 defect), so the row would only re-prove the bug; the operator picks a baseline built after it.
 *
 * @param sourceCommit - A's source commit.
 * @param hasFile - Whether `path` exists in `commit` (the runner asks its full-history checkout).
 */
export const assertBaselineShipsAutoInstall = (
  sourceCommit: string,
  hasFile: (commit: string, path: string) => boolean,
): void => {
  if (!/^[a-f\d]{40}$/u.test(sourceCommit)) {
    throw new Error('The recovery baseline must name a full source commit');
  }
  if (!hasFile(sourceCommit, autoInstallModulePath)) {
    throw new Error(
      `Baseline A (${sourceCommit}) predates the guarded automatic install (${autoInstallModulePath}); choose a baseline candidate built after it`,
    );
  }
};

/** A document that loads and can never mount the app: no script, no stylesheet, nothing it could fetch. */
export const brokenRendererDocument =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Tau</title></head><body></body></html>\n';

/**
 * The renderer's entry document inside an installed app's resources (`main.ts` serves `app://tau` from `ui/client`).
 *
 * @param resourcesPath - The installed `resources` directory.
 * @returns The entry document's path.
 */
export const rendererEntryPath = (resourcesPath: string): string => `${resourcesPath}/ui/client/index.html`;

const squashfsCompressors = { 1: 'gzip', 2: 'lzma', 3: 'lzo', 4: 'xz', 5: 'lz4', 6: 'zstd' } as const;
type SquashfsCompressor = (typeof squashfsCompressors)[keyof typeof squashfsCompressors];

/**
 * The compressor an AppImage's payload uses, so the rebuilt payload is one its runtime can mount.
 *
 * @param superblock - The payload's first bytes (at least 22).
 * @returns The `mksquashfs -comp` name.
 */
export const squashfsCompressor = (superblock: Uint8Array<ArrayBuffer>): SquashfsCompressor => {
  if (superblock.length < 22 || Buffer.from(superblock.subarray(0, 4)).toString('latin1') !== 'hsqs') {
    throw new Error('AppImage payload is not a little-endian squashfs');
  }
  const id = new DataView(superblock.buffer, superblock.byteOffset, superblock.byteLength).getUint16(20, true);
  const name = squashfsCompressors[id as keyof typeof squashfsCompressors] as SquashfsCompressor | undefined;
  if (name === undefined) {
    throw new Error(`Unknown squashfs compressor ${String(id)}`);
  }
  return name;
};

export type RecoveryCommand = (
  file: string,
  args: readonly string[],
  options?: { readonly cwd?: string },
) => Promise<string>;

/**
 * Rebuild a root-owned managed AppImage with its renderer entry document replaced, keeping its own runtime bytes and
 * compressor, and install it in place root-owned and mode 0755, as its package left it (`isManagedAppImage`).
 *
 * @param options - The image, the replacement document, an absent scratch directory and how to run a command.
 */
export const rebuildAppImageWithEntry = async (options: {
  readonly image: string;
  readonly document: string;
  readonly workDirectory: string;
  readonly run: RecoveryCommand;
}): Promise<void> => {
  const { image, document, workDirectory, run } = options;
  await mkdir(workDirectory, { recursive: false });
  try {
    const reported = await run(image, ['--appimage-offset']);
    const offset = Number(reported.trim());
    if (!Number.isSafeInteger(offset) || offset <= 0) {
      throw new Error('AppImage runtime reported no payload offset');
    }
    const handle = await open(image, 'r');
    const runtime: Uint8Array<ArrayBuffer> = Buffer.alloc(offset);
    const superblock: Uint8Array<ArrayBuffer> = Buffer.alloc(96);
    try {
      await handle.read(runtime, 0, offset, 0);
      await handle.read(superblock, 0, superblock.length, offset);
    } finally {
      await handle.close();
    }
    const compressor = squashfsCompressor(superblock);
    await run(image, ['--appimage-extract'], { cwd: workDirectory });
    const root = join(workDirectory, 'squashfs-root');
    const entry = rendererEntryPath(join(root, 'resources'));
    if (
      !(await stat(entry).then(
        (info) => info.isFile(),
        () => false,
      ))
    ) {
      throw new Error('Extracted AppImage has no renderer entry document');
    }
    await writeFile(entry, document);
    const payload = join(workDirectory, 'payload.squashfs');
    await run('mksquashfs', [root, payload, '-noappend', '-root-owned', '-comp', compressor, '-no-progress']);
    const rebuilt = join(workDirectory, 'Tau.AppImage');
    await writeFile(rebuilt, Buffer.concat([runtime, await readFile(payload)]));
    await run('sudo', ['-n', 'install', '-o', 'root', '-g', 'root', '-m', '0755', rebuilt, image]);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
};

type Identity = { readonly tag: string; readonly version: string; readonly sourceCommit: string };
type LogEvent = { readonly at: number; readonly event: string; readonly detail: Record<string, unknown> };
type Launch = { readonly version: string; readonly pid: number; readonly events: LogEvent[] };

const logLine = /^(\S+) [A-Z]+ (\S+)(?: (.*))?$/u;
/** N1's countdown (`autoInstallCountdownMilliseconds` in `update-auto-install.ts`): Cancel stays offered this long. */
export const autoInstallCountdownMilliseconds = 10_000;
/** Main logs the countdown just after scheduling it and Node's cached loop clock can run a few ms behind the log clock. */
const countdownToleranceMilliseconds = 50;
const readySchema = z.object({ version: z.string(), pid: z.number().int().positive() });

/** Each line of `desktop.log` with its time, event name and JSON detail; lines that are not log records are skipped. */
const eventsOf = (log: string): Array<LogEvent & { readonly time: string }> => {
  const events: Array<LogEvent & { readonly time: string }> = [];
  for (const text of log.split('\n')) {
    const match = logLine.exec(text);
    if (!match) {
      continue;
    }
    let detail: Record<string, unknown> = {};
    try {
      const parsed: unknown = match[3] === undefined ? {} : JSON.parse(match[3]);
      detail = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      /* A stack trace or other non-JSON detail: the event name is all the assessment reads. */
    }
    events.push({ time: match[1]!, at: Date.parse(match[1]!), event: match[2]!, detail });
  }
  return events;
};

/** Split `desktop.log` into launches at each `main.ready`, keeping each event's JSON detail. */
const launchesOf = (log: string): Launch[] => {
  const launches: Launch[] = [];
  for (const { at, event, detail } of eventsOf(log)) {
    if (event === 'main.ready') {
      const ready = readySchema.safeParse(detail);
      if (ready.success) {
        launches.push({ version: ready.data.version, pid: ready.data.pid, events: [] });
      }
      continue;
    }
    launches.at(-1)?.events.push({ at, event, detail });
  }
  return launches;
};

/** The detail fields a recovery trail keeps: versions, stages, triggers, modes, phases, counts and failure reasons. */
const trailFields = new Set([
  'version',
  'pid',
  'stage',
  'trigger',
  'mode',
  'reason',
  'targetVersion',
  'phase',
  'count',
  'from',
  'message',
]);
/** The most events a trail keeps, the latest ones. */
const trailLength = 200;
const pathLike = /(?:\\\\\?\\)?[A-Za-z]:\\[^\s"']*|\/(?:home|Users|tmp|var|root|private|opt|usr)\/[^\s"']*/gu;

export type RecoveryTrailEntry = {
  readonly at: string;
  readonly event: string;
  readonly detail: Readonly<Record<string, string | number | boolean>>;
};

/**
 * What a recovery row keeps of the app's log when it fails: every `main.*` and `updater.*` event, with only the
 * scalar fields that say how the launch, the recovery window and the updater went. A message has its paths replaced,
 * so the trail carries no profile or installation directory and can be uploaded beside the row's other observations.
 *
 * @param log - `desktop.log` as text, oldest first.
 * @returns The latest {@link trailLength} events.
 */
export const recoveryTrail = (log: string): RecoveryTrailEntry[] =>
  eventsOf(log)
    .filter(({ event }) => event.startsWith('main.') || event.startsWith('updater.'))
    .slice(-trailLength)
    .map(({ time, event, detail }) => ({
      at: time,
      event,
      detail: Object.fromEntries(
        Object.entries(detail).flatMap(([key, value]): Array<[string, string | number | boolean]> => {
          if (!trailFields.has(key)) {
            return [];
          }
          if (typeof value === 'string') {
            return [[key, value.replaceAll(pathLike, '<path>').slice(0, 300)]];
          }
          return typeof value === 'number' || typeof value === 'boolean' ? [[key, value]] : [];
        }),
      ),
    }));

const ledgerSummarySchema = z.object({
  build: z.string().optional(),
  unhealthyCount: z.number().optional(),
  last: z
    .object({ stage: z.string().optional(), mode: z.string().optional(), deadlinePassed: z.boolean().optional() })
    .optional(),
  autoInstall: z.object({ targetVersion: z.string().optional() }).optional(),
});
export type RecoveryLedgerSummary = z.infer<typeof ledgerSummarySchema>;
/**
 * What a failed recovery row keeps of the boot-health ledger: the build, the count, the last launch's stage and mode,
 * and the automatic-install target. Launch ids and anything else stay in the profile.
 *
 * @param ledger - The parsed `boot-health.json`, or `undefined`.
 * @returns The summary, or `undefined` when there is no readable ledger.
 */
export const recoveryLedgerSummary = (ledger: unknown): RecoveryLedgerSummary | undefined =>
  ledgerSummarySchema.safeParse(ledger).data;

/**
 * What a recovery row that ran out of time reports: the record it uploads beside its other observations, and an error
 * that says in the job log whether A was still running, how far its ledger got, whether it asked the mirror for
 * anything, and its last updater events.
 *
 * @param input - The verdict's last reason, `desktop.log` as text, `boot-health.json` as text (empty when absent),
 * whether A's process was alive, and the mirror's requests.
 * @returns The record and the error.
 */
export const recoveryFailure = (input: {
  readonly reason: string;
  readonly log: string;
  readonly ledgerText: string;
  readonly aAlive: boolean;
  readonly mirrorRequests: readonly unknown[];
}): { readonly record: Record<string, unknown>; readonly error: Error } => {
  const trail = recoveryTrail(input.log);
  let parsed: unknown;
  try {
    parsed = input.ledgerText === '' ? undefined : JSON.parse(input.ledgerText);
  } catch {
    parsed = undefined;
  }
  const ledger = recoveryLedgerSummary(parsed);
  const updaterEvents = trail
    .filter(({ event }) => event.startsWith('updater.'))
    .slice(-5)
    .map(({ event, detail }) => `${event} ${JSON.stringify(detail)}`);
  return {
    record: {
      status: 'failed',
      reason: input.reason,
      aAlive: input.aAlive,
      ledger,
      trail,
      mirrorRequests: input.mirrorRequests,
    },
    error: new Error(
      `T-B22.4 recovery did not complete: ${input.reason} (A alive: ${String(input.aAlive)}; ledger stage: ${
        ledger?.last?.stage ?? 'none'
      }; mirror requests: ${input.mirrorRequests.length}; last updater events: ${
        updaterEvents.length === 0 ? 'none' : updaterEvents.join('; ')
      })`,
    ),
  };
};

const recoveryEvents = new Set(['main.recovery-opened', 'main.recovery-offered', 'main.recovery-shown']);

export type RecoveryAssessment = {
  readonly a: {
    readonly pid: number;
    readonly recoveryTriggers: readonly string[];
    readonly countdown: true;
    readonly started: true;
    readonly furthestStage: string;
  };
  readonly b: { readonly pid: number; readonly build: string; readonly stage: 'home-ready' };
};

/**
 * Decide from the app's own records whether A recovered into B by the guarded automatic install. Throws, naming the
 * first thing missing, until it has; the runner polls it and reports the last reason at its deadline.
 *
 * @param input - `desktop.log` as text, the parsed `boot-health.json` (or `undefined`), and A's and B's identities.
 * @returns What A and B did.
 */
export const assessRecovery = (input: {
  readonly log: string;
  readonly ledger: unknown;
  readonly a: Identity;
  readonly b: Identity;
}): RecoveryAssessment => {
  const { a, b } = input;
  const launches = launchesOf(input.log);
  const aIndex = launches.findIndex((launch) => launch.version === a.version);
  if (aIndex === -1) {
    throw new Error(`The app never started version ${a.version}`);
  }
  const first = launches[aIndex]!;
  const stages = first.events
    .filter(({ event }) => event === 'main.boot-stage')
    .map(({ detail }) => String(detail['stage']));
  if (stages.includes('home-ready')) {
    throw new Error(`Version ${a.version} reached home-ready, so its renderer was not broken`);
  }
  const triggers = first.events
    .filter(({ event }) => recoveryEvents.has(event))
    .map(({ detail }) => String(detail['trigger']));
  const forB = ({ detail }: LogEvent): boolean => detail['targetVersion'] === b.version;
  const countdown = first.events.findIndex((event) => event.event === 'updater.auto-install-countdown' && forB(event));
  if (countdown === -1) {
    if (triggers.length === 0) {
      throw new Error(`Version ${a.version} has run without the recovery window yet`);
    }
    throw new Error(`Version ${a.version} logged no automatic-install countdown for ${b.version}`);
  }
  const started = first.events.findIndex((event) => event.event === 'updater.auto-install-started' && forB(event));
  const stopped = first.events.find(
    (event, index) =>
      event.event === 'updater.auto-install-stopped' && index > countdown && (started === -1 || index < started),
  );
  if (stopped) {
    throw new Error(`The automatic-install countdown was stopped (${String(stopped.detail['reason'])})`);
  }
  if (started === -1) {
    throw new Error(`Version ${a.version} did not start the automatic install of ${b.version}`);
  }
  if (triggers.length === 0) {
    throw new Error(`Version ${a.version} installed ${b.version} without the recovery window`);
  }
  const waited = first.events[started]!.at - first.events[countdown]!.at;
  if (!Number.isFinite(waited)) {
    throw new TypeError(`Version ${a.version}'s automatic-install countdown or start has no readable timestamp`);
  }
  if (waited < autoInstallCountdownMilliseconds - countdownToleranceMilliseconds) {
    throw new Error(
      `Version ${a.version} started the automatic install ${waited} ms after its countdown, before the ${autoInstallCountdownMilliseconds / 1000} s Cancel window ran out`,
    );
  }
  const next = launches.slice(aIndex + 1).find((launch) => launch.version === b.version);
  if (!next) {
    throw new Error(`Version ${b.version} has not started after the automatic install`);
  }
  if (input.ledger === undefined) {
    throw new Error('The profile has no boot-health ledger');
  }
  const ledger = z.object({ build: z.string(), last: z.object({ stage: z.string() }).optional() }).parse(input.ledger);
  const build = `${b.version}+${b.sourceCommit}+packaged`;
  if (ledger.build !== build) {
    throw new Error(`The boot-health ledger belongs to ${ledger.build}, not ${build}`);
  }
  if (ledger.last?.stage !== 'home-ready') {
    throw new Error(`Version ${b.version} has not reached home-ready`);
  }
  return {
    a: {
      pid: first.pid,
      recoveryTriggers: [...new Set(triggers)],
      countdown: true,
      started: true,
      furthestStage: stages.at(-1) ?? 'main-started',
    },
    b: { pid: next.pid, build, stage: 'home-ready' },
  };
};

const identitySchema = z.strictObject({
  tag: z.string().min(1),
  version: z.string().min(1),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
});
const receiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scenario: z.literal('T-B22.4'),
  id: z.string(),
  status: z.literal('passed'),
  route: z.enum(['windows-nsis', 'linux-apt', 'linux-appimage']),
  target: z.enum(['win32-x64', 'linux-x64']),
  channel: z.enum(['staging', 'production']),
  a: identitySchema,
  b: identitySchema,
  evidence: z.strictObject({
    a: z.strictObject({
      pid: z.number().int().positive(),
      recoveryTriggers: z.array(z.string()).min(1),
      countdown: z.literal(true),
      started: z.literal(true),
      furthestStage: z.string(),
    }),
    b: z.strictObject({ pid: z.number().int().positive(), build: z.string(), stage: z.literal('home-ready') }),
    installed: z.strictObject({
      executableSha256: z.string().regex(/^[a-f\d]{64}$/u),
      asarSha256: z.string().regex(/^[a-f\d]{64}$/u),
    }),
  }),
  logs: z.url(),
});
export type RecoveryReceipt = z.infer<typeof receiptSchema>;

/**
 * Admit a scope's recovery receipts: exactly its rows, each passed on its own route and target, all on one A and B.
 *
 * @param scope - The dispatch's scope.
 * @param receipts - One parsed `recovery-receipt.json` per downloaded row.
 * @returns The receipts in row order.
 */
export const assertRecoveryReceipts = (scope: RecoveryScope, receipts: readonly unknown[]): RecoveryReceipt[] => {
  const parsed = receipts.map((receipt) => {
    const result = receiptSchema.safeParse(receipt);
    if (!result.success) {
      throw new Error(`Invalid recovery receipt: ${result.error.message}`);
    }
    return result.data;
  });
  const expected = recoveryRows(scope);
  for (const receipt of parsed) {
    const row = expected.find((item) => item.id === receipt.id);
    if (!row) {
      throw new Error(`${receipt.id} is not a ${scope} recovery row`);
    }
    if (row.route !== receipt.route || row.target !== receipt.target) {
      throw new Error(`${receipt.id} runs another route or target than its row`);
    }
  }
  const ordered = expected.map((row) => {
    const matching = parsed.filter((receipt) => receipt.id === row.id);
    if (matching.length !== 1) {
      throw new Error(`Recovery receipts are missing ${row.id} or repeat it`);
    }
    return matching[0]!;
  });
  if (ordered.some((receipt) => receipt.a.version === receipt.b.version)) {
    throw new Error('The recovery scenario needs A and B to be distinct versions');
  }
  const [head] = ordered;
  if (head) {
    const key = (receipt: RecoveryReceipt): string => JSON.stringify([receipt.channel, receipt.a, receipt.b]);
    if (ordered.some((receipt) => key(receipt) !== key(head))) {
      throw new Error('Recovery rows ran on a different A or B');
    }
  }
  return ordered;
};
