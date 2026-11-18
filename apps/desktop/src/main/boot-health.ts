/**
 * The boot-health ledger (desktop resilient startup blueprint, D0; R12).
 *
 * Main keeps `<userData>/boot-health.json`: the furthest stage the previous launch reached, how it ended, and a count
 * of consecutive unhealthy launches of the running build. The next launch reads it, classifies the previous launch
 * as healthy, unhealthy or inconclusive, decides whether to start in safe mode, and writes its own record.
 *
 * Rules this module keeps:
 *
 * - A ledger that cannot be read or written counts as empty and never causes safe mode, and nothing here throws.
 * - Decisions use the count only. Nothing here reads the wall clock, so a wrong clock (B25) can neither trigger nor
 *   suppress safe mode; the launch deadline is timed by the watchdog on the process's monotonic clock and only its
 *   outcome (`deadlinePassed`) is written here.
 * - The count belongs to one build (version, source commit, packaged), so a development run never counts against the
 *   installed app that shares its profile name (B5).
 * - Main calls this only after it holds the single-instance lock, and never for a probe launch.
 */
import { closeSync, fstatSync, openSync, readSync, renameSync, writeFileSync } from 'node:fs';

/** The five stages of a launch, in order. */
export const bootStages = ['main-started', 'updater-started', 'window-loaded', 'shell-mounted', 'home-ready'] as const;
export type BootStage = (typeof bootStages)[number];

/** How a launch runs: as normal, in safe mode by the watchdog's count, or in safe mode because someone asked. */
export type LaunchMode = 'normal' | 'safe-auto' | 'safe-requested';

/** How a launch ended, when it ended in a way main saw. Absent means it never got to say. */
export type LaunchEnd = 'clean' | 'user-closed-window';

/** One launch's record. */
export type LaunchRecord = {
  readonly launchId: string;
  readonly mode: LaunchMode;
  /** The furthest stage reached. */
  readonly stage: BootStage;
  /** The launch ran past its 60 s deadline without `home-ready`. */
  readonly deadlinePassed: boolean;
  readonly ended?: LaunchEnd;
  /** The GPU process exited during the launch (B26). */
  readonly gpuProcessGone?: boolean;
};

/** An automatic install that was started, so it is tried only once for each target (WP7). */
export type AutoInstallRecord = { readonly fromBuild: string; readonly targetVersion: string };

/** The file's shape. */
export type BootHealthLedger = {
  readonly schemaVersion: 1;
  /** The build the count belongs to, from {@link buildIdentity}. */
  readonly build: string;
  readonly unhealthyCount: number;
  readonly autoInstall?: AutoInstallRecord;
  readonly last?: LaunchRecord;
};

/** What the previous launch counts as. */
export type LaunchOutcome = 'healthy' | 'unhealthy' | 'inconclusive';

/** The ledger's file name under `userData`. */
export const bootHealthFileName = 'boot-health.json';

/** A larger file is not a ledger this module wrote, and reads as empty. */
export const maxBootHealthBytes = 4096;

/** How many consecutive unhealthy launches of one build start the next in safe mode. */
export const safeModeThreshold = 2;

/**
 * The running build's identity, as the ledger keys its count.
 *
 * @param build - The version, the source commit (empty when the build stamped none) and whether it is packaged.
 * @returns `<version>+<commit>+<packaged|unpackaged>`.
 */
export const buildIdentity = (build: {
  readonly version: string;
  readonly sourceCommit: string;
  readonly packaged: boolean;
}): string =>
  `${build.version}+${build.sourceCommit === '' ? 'unknown' : build.sourceCommit}+${build.packaged ? 'packaged' : 'unpackaged'}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length < 256;

const parseLaunchRecord = (value: unknown): LaunchRecord | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const { launchId, mode, stage, deadlinePassed, ended, gpuProcessGone } = value;
  if (
    !isString(launchId) ||
    (mode !== 'normal' && mode !== 'safe-auto' && mode !== 'safe-requested') ||
    !bootStages.includes(stage as BootStage) ||
    typeof deadlinePassed !== 'boolean' ||
    (ended !== undefined && ended !== 'clean' && ended !== 'user-closed-window') ||
    (gpuProcessGone !== undefined && typeof gpuProcessGone !== 'boolean')
  ) {
    return undefined;
  }
  return {
    launchId,
    mode,
    stage: stage as BootStage,
    deadlinePassed,
    ...(ended === undefined ? {} : { ended }),
    ...(gpuProcessGone === true ? { gpuProcessGone } : {}),
  };
};

/**
 * Parse a ledger, or `undefined` when the value is not one this module wrote.
 *
 * @param value - The parsed JSON.
 * @returns The ledger.
 */
export const parseBootHealth = (value: unknown): BootHealthLedger | undefined => {
  if (!isRecord(value) || value['schemaVersion'] !== 1 || !isString(value['build'])) {
    return undefined;
  }
  const count = value['unhealthyCount'];
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    return undefined;
  }
  const last = value['last'] === undefined ? undefined : parseLaunchRecord(value['last']);
  if (value['last'] !== undefined && last === undefined) {
    return undefined;
  }
  const install = value['autoInstall'];
  const autoInstall =
    isRecord(install) && isString(install['fromBuild']) && isString(install['targetVersion'])
      ? { fromBuild: install['fromBuild'], targetVersion: install['targetVersion'] }
      : undefined;
  if (install !== undefined && autoInstall === undefined) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    build: value['build'],
    unhealthyCount: count,
    ...(autoInstall === undefined ? {} : { autoInstall }),
    ...(last === undefined ? {} : { last }),
  };
};

/**
 * Read the ledger with the same tolerance as `window-state.json`: missing, unreadable, oversized or misshapen reads as
 * empty.
 *
 * @param path - `<userData>/boot-health.json`.
 * @returns The ledger, or `undefined`.
 */
export const readBootHealth = (path: string): BootHealthLedger | undefined => {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    const { size } = fstatSync(descriptor);
    if (size > maxBootHealthBytes) {
      return undefined;
    }
    const buffer = Buffer.alloc(size);
    readSync(descriptor, buffer, 0, size, 0);
    return parseBootHealth(JSON.parse(buffer.toString('utf8')));
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        /* Nothing more to do with a descriptor that will not close. */
      }
    }
  }
};

/** Writes a file; replaced in tests to simulate an unwritable profile. */
export type WriteFile = (path: string, data: string, options: { readonly mode: number }) => void;

/**
 * Write the ledger by replacing a temporary file, mode `0600`.
 *
 * @param path - `<userData>/boot-health.json`.
 * @param ledger - What to write.
 * @param write - The file writer.
 * @returns Whether it was written. A failure is not an error: the ledger is advisory.
 */
export const writeBootHealth = (
  path: string,
  ledger: BootHealthLedger,
  write: WriteFile = (target, data, options) => {
    writeFileSync(target, data, options);
  },
): boolean => {
  const temporary = `${path}.tmp`;
  try {
    write(temporary, `${JSON.stringify(ledger)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Classify a launch with D0's outcome table.
 *
 * @param record - The launch's record.
 * @returns Healthy when `home-ready` arrived, however late; unhealthy on evidence (the deadline passed, no clean end,
 * or the GPU process exited); inconclusive otherwise (a clean quit or a closed window before the deadline).
 */
export const classifyLaunch = (record: LaunchRecord): LaunchOutcome => {
  if (record.stage === 'home-ready') {
    return 'healthy';
  }
  if (record.deadlinePassed || record.ended === undefined || record.gpuProcessGone === true) {
    return 'unhealthy';
  }
  return 'inconclusive';
};

/** What a launch decided when it began. */
export type LaunchBeginning = {
  /** The ledger to write now: this launch at `main-started`. */
  readonly ledger: BootHealthLedger;
  readonly mode: LaunchMode;
  /** How the previous launch counted, when there was one for this build. */
  readonly previousOutcome?: LaunchOutcome;
  /** The previous launch's record, as read. */
  readonly previous?: LaunchRecord;
  /** An automatic install that did not take: its target is not tried again (WP7). */
  readonly blockedAutoInstallTarget?: string;
};

/**
 * Apply the Specification's four steps for a launch.
 *
 * @param input - The previous ledger, the running build and version, whether `--safe-mode` was given, and this
 * launch's id.
 * @returns The decision and the ledger to write.
 */
export const beginLaunch = (input: {
  readonly previous: BootHealthLedger | undefined;
  readonly build: string;
  readonly version: string;
  readonly safeModeRequested: boolean;
  readonly launchId: string;
}): LaunchBeginning => {
  const { previous, build } = input;
  /* 1. Another build starts its own count; an automatic install whose target is not running did not take. */
  const sameBuild = previous?.build === build;
  let count = sameBuild ? previous.unhealthyCount : 0;
  const autoInstall = previous?.autoInstall;
  const blockedAutoInstallTarget =
    autoInstall !== undefined && autoInstall.targetVersion !== input.version ? autoInstall.targetVersion : undefined;
  /* 2. Classify the previous launch of this build. */
  const last = sameBuild ? previous.last : undefined;
  const previousOutcome = last === undefined ? undefined : classifyLaunch(last);
  if (previousOutcome === 'unhealthy') {
    count += 1;
  } else if (previousOutcome === 'healthy') {
    /* Probation: a healthy safe launch lowers the count to one, so one more bad launch returns to safe mode. */
    count = last?.mode === 'normal' ? 0 : Math.min(count, 1);
  }
  /* 3. Choose the mode. */
  const mode: LaunchMode = input.safeModeRequested
    ? 'safe-requested'
    : count >= safeModeThreshold
      ? 'safe-auto'
      : 'normal';
  /* 4. This launch, at `main-started`. */
  return {
    ledger: {
      schemaVersion: 1,
      build,
      unhealthyCount: count,
      ...(blockedAutoInstallTarget === undefined ? {} : { autoInstall: autoInstall! }),
      last: { launchId: input.launchId, mode, stage: 'main-started', deadlinePassed: false },
    },
    mode,
    ...(previousOutcome === undefined ? {} : { previousOutcome }),
    ...(last === undefined ? {} : { previous: last }),
    ...(blockedAutoInstallTarget === undefined ? {} : { blockedAutoInstallTarget }),
  };
};

/** The running launch's ledger: what it decided, and how it advances. */
export type BootHealth = {
  readonly mode: LaunchMode;
  /** The count of consecutive unhealthy launches this launch started with. */
  readonly unhealthyCount: number;
  readonly previousOutcome: LaunchOutcome | undefined;
  readonly previous: LaunchRecord | undefined;
  readonly blockedAutoInstallTarget: string | undefined;
  /** The stage reached so far. */
  readonly stage: () => BootStage;
  /** Record a later stage; an earlier one is ignored. */
  readonly advance: (stage: BootStage) => void;
  /** The launch ran past its deadline without `home-ready`. */
  readonly markDeadlinePassed: () => void;
  /** The GPU process exited (B26). */
  readonly noteGpuProcessGone: () => void;
  /** How the launch ended; the first ending is kept. */
  readonly end: (ended: LaunchEnd) => void;
  /** An automatic install is about to start (WP7). */
  readonly noteAutoInstall: (targetVersion: string) => void;
  /** The ledger as it stands. */
  readonly snapshot: () => BootHealthLedger;
};

/**
 * Read the previous ledger, decide this launch, and write it at `main-started`.
 *
 * @param input - Where the ledger lives, the running build and version, whether `--safe-mode` was given, this launch's
 * id, and optionally the file writer.
 * @returns The running launch's ledger. It never throws.
 */
export const startBootHealth = (input: {
  readonly path: string;
  readonly build: string;
  readonly version: string;
  readonly safeModeRequested: boolean;
  readonly launchId: string;
  readonly writeFile?: WriteFile;
}): BootHealth => {
  let begun = beginLaunch({ ...input, previous: readBootHealth(input.path) });
  let { ledger } = begun;
  let record = ledger.last!;
  const persist = (): boolean => {
    ledger = { ...ledger, last: record };
    return writeBootHealth(input.path, ledger, input.writeFile);
  };
  if (!persist()) {
    /* A ledger this launch cannot write would never record it reaching home-ready, so it must not cause safe mode:
     * the launch decides as for an empty ledger, and only an explicit `--safe-mode` still applies. */
    begun = beginLaunch({ ...input, previous: undefined });
    ({ ledger } = begun);
    record = ledger.last!;
  }
  return {
    mode: begun.mode,
    unhealthyCount: ledger.unhealthyCount,
    previousOutcome: begun.previousOutcome,
    previous: begun.previous,
    blockedAutoInstallTarget: begun.blockedAutoInstallTarget,
    stage: () => record.stage,
    advance: (stage) => {
      if (bootStages.indexOf(stage) <= bootStages.indexOf(record.stage)) {
        return;
      }
      record = { ...record, stage };
      persist();
    },
    markDeadlinePassed: () => {
      if (record.deadlinePassed || record.stage === 'home-ready') {
        return;
      }
      record = { ...record, deadlinePassed: true };
      persist();
    },
    noteGpuProcessGone: () => {
      if (record.gpuProcessGone === true) {
        return;
      }
      record = { ...record, gpuProcessGone: true };
      persist();
    },
    end: (ended) => {
      if (record.ended !== undefined) {
        return;
      }
      record = { ...record, ended };
      persist();
    },
    noteAutoInstall: (targetVersion) => {
      ledger = { ...ledger, autoInstall: { fromBuild: input.build, targetVersion } };
      persist();
    },
    snapshot: () => ledger,
  };
};
