/** Convert independently collected native observations into one CI or clean-host receipt; fixture data never qualifies a release. */
import { z } from 'zod';
import { linuxInstallation } from '#shared/linux-installation.js';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import {
  desktopAcceptanceRoutes,
  macosQuarantinePattern,
  parseDesktopAcceptanceReceipt,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
import type {
  DesktopAcceptanceReceipt,
  DesktopArtifactManifest,
  DesktopAcceptanceRoute,
} from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- The collector consumes native driver observations, not caller-authored success flags. */
import type {
  QualificationInstallation,
  QualificationSecurity,
  QualificationPreservedFile,
} from './qualification-platform-types.mjs';
import type { LinuxAptQualificationDriver } from './qualification-linux.mjs';
/* oxlint-enable no-restricted-imports */
const digest = z.string().regex(/^[a-f\d]{64}$/u);
const identity = z.object({ tag: z.string(), version: z.string(), sourceCommit: z.string().regex(/^[a-f\d]{40}$/u) });
export const qualificationProbeObservationSchema = z.object({
  diagnosticOnly: z.literal(true),
  schemaVersion: z.literal(1),
  nonce: z.uuid(),
  stage: z.enum(['a', 'b', 'c']),
  action: z.enum(['observe', 'install']),
  discovery: z.enum(['candidate', 'latest', 'none']),
  candidateTag: z.string().optional(),
  pid: z.number().int().positive(),
  rendererPid: z.number().int().positive(),
  version: z.string(),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  route: z.string(),
  target: z.string(),
  channel: z.string(),
  profile: z.string().min(1),
  profileSentinel: z.uuid(),
  installedPath: z.string().min(1),
  mirrorOrigin: z.url(),
  observedAt: z.number().positive(),
  projectSha256: digest,
  project: z.object({ path: z.string().min(1), sha256: digest }),
  a: identity,
  b: identity,
  c: identity,
  children: z.array(z.object({ pid: z.number().int().positive(), type: z.string() })),
});
export type QualificationProbeObservation = z.infer<typeof qualificationProbeObservationSchema>;
export const qualificationRendererObservationSchema = z.strictObject({
  pid: z.number().int().positive(),
  projectPath: z.string().min(1),
  projectSha256: digest,
  nativePids: z.array(z.number().int().positive()).min(1),
  nativeAncestry: z
    .array(
      z.strictObject({
        pid: z.number().int().positive(),
        parent: z.number().int().nonnegative(),
        command: z.string().min(1),
      }),
    )
    .min(1),
  saveObservedAt: z.number().positive(),
  softwareRenderer: z.string().min(1).optional(),
});
export type QualificationRendererObservation = z.infer<typeof qualificationRendererObservationSchema>;
/** Raw Windows observations: null means unavailable, never an enabled default. */
export const windowsConsumerHostSchema = z.strictObject({
  runner: z.string().min(1),
  identity: digest,
  osVersion: z.string(),
  productType: z.number().int(),
  build: z.number().int(),
  nativeMachine: z.number().int(),
  processMachine: z.number().int(),
  elevated: z.number().int(),
  elevationType: z.number().int(),
  administrator: z.boolean(),
  uacEnabled: z.number().int().nullable(),
  defender: z
    .strictObject({
      service: z.boolean().nullable(),
      antivirus: z.boolean().nullable(),
      realTime: z.boolean().nullable(),
      mode: z.string().nullable(),
    })
    .nullable(),
  existing: z.array(z.string()),
});
export type WindowsConsumerHost = z.infer<typeof windowsConsumerHostSchema>;
const windowsManualBindingSchema = z.strictObject({
  nonce: z.uuid(),
  hostSha256: digest,
  stage: z.enum(['initial', 'reinstall']),
  artifactSha256: digest,
  requestedAt: z.number().positive(),
});
export const windowsConsumerManualSchema = windowsManualBindingSchema.extend({
  observedAt: z.number().positive(),
  observer: z.string().min(1),
  launchedFrom: z.enum(['explorer', 'browser-downloads']),
  defaultDestination: z.literal(true),
  freshCapturesForRequest: z.literal(true),
  smartScreen: z.strictObject({
    checkAppsAndFiles: z.enum(['enabled', 'disabled', 'unknown']),
    result: z.enum(['not-shown', 'warning-approved', 'blocked', 'unknown']),
    publisher: z.string().nullable(),
  }),
  uac: z.enum(['not-shown', 'credentials-requested', 'unknown']),
  installer: z.enum(['completed', 'refused', 'unknown']),
  screenshots: z
    .array(
      z.strictObject({
        kind: z.enum(['security-settings', 'installer-result', 'smart-screen']),
        name: z.string().regex(/^[a-zA-Z0-9_-]+\.(?:png|jpg)$/u),
        capturedAt: z.number().positive(),
        sha256: digest,
        size: z.number().int().positive(),
      }),
    )
    .min(2),
});
export type WindowsConsumerManual = z.infer<typeof windowsConsumerManualSchema>;
export const windowsConsumerInstallSchema = z.strictObject({
  stage: z.enum(['initial', 'reinstall']),
  artifact: z.strictObject({ name: z.string().min(1), sha256: digest, size: z.number().int().positive() }),
  download: z.strictObject({
    browser: z.string().min(1),
    url: z.url(),
    sha256: digest,
    size: z.number().int().positive(),
    zoneIdentifier: z.string(),
  }),
  installedPath: z.string().min(1),
  requestedAt: z.number().positive(),
  completedAt: z.number().positive(),
  manual: windowsConsumerManualSchema,
});
export type WindowsConsumerInstall = z.infer<typeof windowsConsumerInstallSchema>;
export type WindowsConsumerAcceptance = {
  kind: 'vm';
  host: WindowsConsumerHost;
  installs: readonly WindowsConsumerInstall[];
};

/** Require one unambiguous Internet-zone marker; never manufacture or repair MOTW. */
export const hasWindowsInternetZone = (value: string): boolean =>
  /^\[ZoneTransfer\]\r?$/mu.test(value) &&
  [...value.matchAll(/^ZoneId=(.*)\r?$/gmu)].map((match) => match[1]!.trim()).join(',') === '3';

/** Require native Windows 11 and a non-administrator token, not merely an unelevated administrator. */
export const assertWindowsConsumerHost = (input: unknown, requireClean = true): WindowsConsumerHost => {
  const host = windowsConsumerHostSchema.parse(input);
  if (
    host.productType !== 1 ||
    host.build < 22_000 ||
    !/^Microsoft Windows 11\b/u.test(host.osVersion) ||
    host.nativeMachine !== 0x86_64 ||
    host.processMachine !== 0 ||
    host.elevated !== 0 ||
    host.elevationType !== 1 ||
    host.administrator ||
    host.uacEnabled !== 1 ||
    host.defender?.service !== true ||
    host.defender.antivirus !== true ||
    host.defender.realTime !== true ||
    host.defender.mode !== 'Normal' ||
    (requireClean && host.existing.length > 0)
  ) {
    throw new Error('Qualification undecided: Windows consumer host is not native, standard-user, protected and clean');
  }
  return host;
};
/** Bind human observations to the exact machine/user snapshot without retaining their identifying source strings. */
export const windowsConsumerHostDigest = (input: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(windowsConsumerHostSchema.parse(input)))
    .digest('hex');
/** Validate testimony as testimony; file hashes bind screenshots but cannot prove what the human saw. */
export const assertWindowsConsumerManual = (
  input: unknown,
  binding: z.infer<typeof windowsManualBindingSchema>,
  publisher: string,
): WindowsConsumerManual => {
  const manual = windowsConsumerManualSchema.parse(input);
  const expected = windowsManualBindingSchema.parse(binding);
  if (
    Object.entries(expected).some(([key, value]) => Reflect.get(manual, key) !== value) ||
    manual.observedAt < expected.requestedAt ||
    manual.screenshots.some(
      (entry) => entry.capturedAt < expected.requestedAt || entry.capturedAt > manual.observedAt,
    ) ||
    manual.smartScreen.checkAppsAndFiles !== 'enabled' ||
    !['not-shown', 'warning-approved'].includes(manual.smartScreen.result) ||
    manual.uac !== 'not-shown' ||
    manual.installer !== 'completed' ||
    new Set(manual.screenshots.map((entry) => entry.name)).size !== manual.screenshots.length ||
    !['security-settings', 'installer-result'].every((kind) =>
      manual.screenshots.some((entry) => entry.kind === kind),
    ) ||
    (manual.smartScreen.result === 'warning-approved' &&
      (manual.smartScreen.publisher !== publisher ||
        !manual.screenshots.some((entry) => entry.kind === 'smart-screen'))) ||
    (manual.smartScreen.result === 'not-shown' && manual.smartScreen.publisher !== null)
  ) {
    throw new Error(
      'Qualification undecided: manual Windows installation observations are missing, refused or mismatched',
    );
  }
  return manual;
};

/** Raw host observations taken before the clean-host run touches the machine. */
export const macosCleanHostSchema = z.strictObject({
  runner: z.string().min(1),
  productVersion: z.string(),
  /** `uname -m`. */
  machine: z.string(),
  /** `sysctl -n hw.optional.arm64`, or `absent` when the OID does not exist. */
  arm64: z.string(),
  /** `sysctl -n sysctl.proc_translated`, or `absent` when the OID does not exist. */
  translated: z.string(),
  /** `csrutil status`. */
  sip: z.string(),
  /** `spctl --status`. */
  gatekeeper: z.string(),
  /** Prior Tau installations or profiles found at start; a clean host has none. */
  existing: z.array(z.string()),
});
export type MacosCleanHost = z.infer<typeof macosCleanHostSchema>;
/** One browser-downloaded, quarantined installation into /Applications. */
export const macosCleanInstallSchema = z.strictObject({
  stage: z.enum(['initial', 'reinstall']),
  format: z.enum(['zip', 'dmg']),
  artifact: z.strictObject({ name: z.string().min(1), sha256: digest, size: z.number().int().positive() }),
  download: z.strictObject({
    browser: z.string().min(1),
    url: z.url(),
    sha256: digest,
    size: z.number().int().positive(),
    quarantine: z.string(),
  }),
  installedPath: z.string(),
  installedQuarantine: z.string(),
  /** DMG only: the image was detached after the copy, so the app never runs from the mounted volume. */
  ejected: z.boolean().optional(),
  /** `spctl -a -vv -t exec` on the installed app. */
  assessment: z.string(),
  /** `stapler validate` on the installed app with network denied. */
  staple: z.string(),
});
export type MacosCleanInstall = z.infer<typeof macosCleanInstallSchema>;
/** One LaunchServices launch of the installed app through `open`, answering Gatekeeper's first-launch prompt as a user would. */
export const macosCleanLaunchSchema = z.strictObject({
  stage: z.enum(['initial', 'reinstall']),
  via: z.literal('open'),
  application: z.string(),
  pid: z.number().int().positive(),
  prompt: z.enum(['approved', 'absent']),
  quarantineBefore: z.string(),
  quarantineAfter: z.string(),
});
export type MacosCleanLaunch = z.infer<typeof macosCleanLaunchSchema>;
export type QualificationCleanHostAcceptance = {
  kind: 'vm';
  host: MacosCleanHost;
  installs: readonly MacosCleanInstall[];
  launches: readonly MacosCleanLaunch[];
};
export type QualificationStageEvidence = {
  candidate: DesktopArtifactManifest;
  installed: QualificationInstallation;
  probe: QualificationProbeObservation;
  renderer: QualificationRendererObservation;
  security: QualificationSecurity;
};
export type QualificationEvidence = {
  mode: 'release' | 'fixture' | 'software-ci';
  route: DesktopAcceptanceRoute;
  target: 'darwin-arm64' | 'darwin-x64' | 'win32-x64' | 'linux-x64';
  stages: readonly [QualificationStageEvidence, QualificationStageEvidence, QualificationStageEvidence];
  lifecycle: {
    ordinaryQuit?: {
      probe: QualificationProbeObservation;
      before: QualificationInstallation;
      after: QualificationInstallation;
      exitedPid: number;
    };
    reinstall: {
      installed: QualificationInstallation;
      files: readonly QualificationPreservedFile[];
      mainPid: number;
      projectPath: string;
      projectSha256: string;
      exportSha256: string;
    };
    uninstall: {
      before: readonly QualificationPreservedFile[];
      after: readonly QualificationPreservedFile[];
      removedInstallationPath: string;
      existsAfter: boolean;
    };
  };
  scheduler?: ReadonlyArray<
    Awaited<ReturnType<LinuxAptQualificationDriver['waitForScheduledUpgrade']>> & {
      activeSession: { pid: number; projectSha256: string; exportSha256: string; vertices: number };
    }
  >;
  mirrorRequests: ReadonlyArray<{ path: string; status: number; at: number }>;
  logs: string;
  suite: string;
  trustIdentity: string;
  /** Present only for a clean-host run; its receipt is `kind: 'vm'` and carries the observed host facts. */
  acceptance?: QualificationCleanHostAcceptance;
  windowsAcceptance?: WindowsConsumerAcceptance;
};
const requireEvidence = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Qualification undecided: ${message}`);
  }
};
export const macosCleanHostApplication = '/Applications/Tau.app';
const macosSipEnabled = 'System Integrity Protection status: enabled.';
const macosGatekeeperEnabled = 'assessments enabled';

/** Shared with the driver's preflight so a run on an unqualified host stops before it installs anything. */
export const assertMacosCleanHost = (input: MacosCleanHost, architecture: 'arm64' | 'x64'): MacosCleanHost => {
  const host = macosCleanHostSchema.parse(input);
  requireEvidence(host.sip.trim() === macosSipEnabled, 'clean host requires System Integrity Protection enabled');
  requireEvidence(host.gatekeeper.trim() === macosGatekeeperEnabled, 'clean host requires Gatekeeper assessments');
  requireEvidence(
    architecture === 'arm64'
      ? host.machine.trim() === 'arm64' && host.arm64.trim() === '1' && host.translated.trim() === '0'
      : host.machine.trim() === 'x86_64' &&
          ['0', 'absent'].includes(host.arm64.trim()) &&
          ['0', 'absent'].includes(host.translated.trim()),
    'clean host is not the native architecture (Rosetta or mismatched hardware)',
  );
  requireEvidence(/^\d+(?:\.\d+){1,2}$/u.test(host.productVersion.trim()), 'macOS product version missing');
  requireEvidence(host.existing.length === 0, 'clean host already has a Tau installation or profile');
  return host;
};
const quarantined = (value: string): boolean => macosQuarantinePattern.test(value.trim());

/** Every clean-host fact the receipt claims is re-derived here from raw observations; nothing is caller-asserted. */
const cleanHostReceiptFacts = (
  input: QualificationEvidence,
  acceptance: QualificationCleanHostAcceptance,
): NonNullable<DesktopAcceptanceReceipt['environment']['host']> => {
  requireEvidence(
    input.route.startsWith('macos-') && input.target.startsWith('darwin-'),
    'clean-host acceptance is defined for Mac routes only',
  );
  const architecture = input.target === 'darwin-arm64' ? 'arm64' : 'x64';
  const host = assertMacosCleanHost(acceptance.host, architecture);
  const [a, , c] = input.stages;
  const format = input.route === 'macos-dmg' ? 'dmg' : 'zip';
  const installs = acceptance.installs.map((entry) => macosCleanInstallSchema.parse(entry));
  const launches = acceptance.launches.map((entry) => macosCleanLaunchSchema.parse(entry));
  requireEvidence(
    installs.length === 2 && installs[0]?.stage === 'initial' && installs[1]?.stage === 'reinstall',
    'clean-host initial and reinstall installations required',
  );
  for (const [install, stage] of [
    [installs[0]!, a],
    [installs[1]!, c],
  ] as const) {
    const artifact = stage.candidate.artifacts.find(
      (entry) => entry.target === input.target && entry.kind === `macos-${format}`,
    );
    requireEvidence(
      install.format === format &&
        artifact !== undefined &&
        install.artifact.name === artifact.name &&
        install.artifact.sha256 === artifact.sha256 &&
        install.artifact.size === artifact.size &&
        install.download.sha256 === artifact.sha256 &&
        install.download.size === artifact.size &&
        new URL(install.download.url).pathname ===
          `/releases/${encodeURIComponent(stage.candidate.tag)}/${artifact.name}`,
      'browser download is not the exact candidate artifact',
    );
    requireEvidence(quarantined(install.download.quarantine), 'browser download lacks com.apple.quarantine');
    requireEvidence(
      install.installedPath === macosCleanHostApplication && quarantined(install.installedQuarantine),
      'installed application lost quarantine or is outside /Applications',
    );
    requireEvidence(format === 'zip' || install.ejected === true, 'disk image was not ejected before launch');
    requireEvidence(
      /: accepted$/mu.test(install.assessment) && /^source=Notarized Developer ID$/mu.test(install.assessment),
      'Gatekeeper did not accept the installed app as Notarized Developer ID',
    );
    requireEvidence(/The validate action worked!/u.test(install.staple), 'offline stapled ticket validation missing');
  }
  requireEvidence(
    launches.length === 2 &&
      launches[0]?.stage === 'initial' &&
      launches[0].pid === a.probe.pid &&
      launches[1]?.stage === 'reinstall' &&
      launches[1].pid === input.lifecycle.reinstall.mainPid &&
      launches.every(
        (launch) => launch.application === macosCleanHostApplication && quarantined(launch.quarantineBefore),
      ),
    'installed app was not launched quarantined from /Applications through LaunchServices',
  );
  for (const stage of input.stages) {
    requireEvidence(
      stage.installed.executablePath === `${macosCleanHostApplication}/Contents/MacOS/Tau` &&
        (stage.security.measurements['sip'] ?? '').trim() === macosSipEnabled &&
        (stage.security.measurements['gatekeeper'] ?? '').trim() === macosGatekeeperEnabled,
      'clean-host security defaults changed during the run',
    );
  }
  return {
    platform: 'darwin',
    runner: host.runner,
    productVersion: host.productVersion.trim(),
    nativeArch: architecture,
    translated: false,
    sip: 'enabled',
    gatekeeper: 'enabled',
    quarantine: {
      downloaded: installs[0]!.download.quarantine.trim(),
      installed: installs[0]!.installedQuarantine.trim(),
    },
    assessment: 'Notarized Developer ID',
    staple: 'validated-offline',
    installedPath: macosCleanHostApplication,
    launch: 'open',
  };
};
/** Re-derive the Windows row from native readings and explicitly attributed manual observations. */
const windowsConsumerReceiptFacts = (
  input: QualificationEvidence,
  acceptance: WindowsConsumerAcceptance,
): NonNullable<DesktopAcceptanceReceipt['environment']['host']> => {
  requireEvidence(
    input.route === 'windows-nsis' && input.target === 'win32-x64' && input.suite === 'clean-host-route-a-b-c-v1',
    'Windows consumer route/suite differs',
  );
  const host = assertWindowsConsumerHost(acceptance.host);
  const installs = acceptance.installs.map((entry) => windowsConsumerInstallSchema.parse(entry));
  requireEvidence(
    installs.length === 2 && installs[0]?.stage === 'initial' && installs[1]?.stage === 'reinstall',
    'Windows initial and reinstall observations required',
  );
  for (const [install, stage] of [
    [installs[0]!, input.stages[0]],
    [installs[1]!, input.stages[2]],
  ] as const) {
    const artifact = stage.candidate.artifacts.find(
      (entry) => entry.kind === 'windows-nsis' && entry.target === 'win32-x64',
    );
    requireEvidence(
      install.artifact.name === artifact?.name &&
        install.artifact.sha256 === artifact.sha256 &&
        install.artifact.size === artifact.size &&
        install.download.sha256 === artifact.sha256 &&
        install.download.size === artifact.size &&
        new URL(install.download.url).origin === stage.probe.mirrorOrigin &&
        new URL(install.download.url).pathname ===
          `/releases/${encodeURIComponent(stage.candidate.tag)}/${artifact.name}` &&
        hasWindowsInternetZone(install.download.zoneIdentifier) &&
        install.installedPath === stage.installed.installationPath,
      'Windows browser artifact, Internet MOTW or installed location differs',
    );
    const manual = assertWindowsConsumerManual(
      install.manual,
      {
        nonce: stage.probe.nonce,
        hostSha256: windowsConsumerHostDigest(host),
        stage: install.stage,
        artifactSha256: install.artifact.sha256,
        requestedAt: install.requestedAt,
      },
      input.trustIdentity,
    );
    requireEvidence(manual.observedAt <= install.completedAt, 'manual observation is after installation capture');
  }
  for (const stage of input.stages) {
    const measured = assertWindowsConsumerHost(
      JSON.parse(stage.security.measurements['consumerHost'] ?? 'null'),
      false,
    );
    requireEvidence(
      measured.identity === host.identity && measured.runner === host.runner,
      'Windows consumer host changed',
    );
  }
  return {
    platform: 'win32',
    runner: host.runner,
    nativeArch: 'x64',
    osBuild: host.build,
    account: 'standard-user',
    uac: 'enabled',
    defender: 'enabled',
    download: 'browser-internet-zone',
    reputationScope: 'qualification-mirror',
    manualEvidence: installs.map((entry) => ({
      stage: entry.stage,
      nonce: entry.manual.nonce,
      artifactSha256: entry.artifact.sha256,
      hostSha256: entry.manual.hostSha256,
      observedAt: entry.manual.observedAt,
      smartScreen: z.enum(['not-shown', 'warning-approved']).parse(entry.manual.smartScreen.result),
      screenshots: entry.manual.screenshots,
    })),
  };
};
const equalInstallation = (left: QualificationInstallation, right: QualificationInstallation): boolean =>
  left.route === right.route &&
  left.tag === right.tag &&
  left.version === right.version &&
  left.sourceCommit === right.sourceCommit &&
  left.executablePath === right.executablePath &&
  left.executableSha256 === right.executableSha256 &&
  left.asarSha256 === right.asarSha256 &&
  left.installationPath === right.installationPath;
const checkSecurity = (stage: QualificationStageEvidence, target: QualificationEvidence['target']): void => {
  const { security, probe, renderer } = stage;
  const platform = target.split('-')[0]!;
  const architecture = target.endsWith('arm64') ? 'arm64' : 'x64';
  requireEvidence(
    security.platform === platform &&
      (security.architecture === 'AMD64' ? 'x64' : security.architecture) === architecture &&
      security.osVersion.length > 0,
    'native OS/architecture observation missing',
  );
  const ids = [probe.pid, renderer.pid, ...renderer.nativePids];
  requireEvidence(
    new Set(ids).size === ids.length && renderer.nativePids.length > 0,
    'distinct live main/renderer/native processes required',
  );
  requireEvidence(renderer.pid === probe.rendererPid, 'renderer PID differs from running probe');
  requireEvidence(
    new Set(renderer.nativeAncestry.map((entry) => entry.pid)).size === renderer.nativeAncestry.length,
    'ambiguous native process ancestry',
  );
  const ancestry = new Map(renderer.nativeAncestry.map((entry) => [entry.pid, entry]));
  const utilities = new Set(probe.children.filter((child) => child.type === 'Utility').map((child) => child.pid));
  for (const pid of renderer.nativePids) {
    const seen = new Set<number>();
    let current = pid;
    let utilityAncestor = false;
    while (current !== probe.pid) {
      requireEvidence(!seen.has(current), 'native process ancestry cycle');
      seen.add(current);
      const entry = ancestry.get(current);
      requireEvidence(entry !== undefined, 'native process ancestry unavailable');
      if (!entry) {
        break;
      }
      current = entry.parent;
      utilityAncestor ||= utilities.has(current);
    }
    requireEvidence(current === probe.pid && utilityAncestor, 'native PID does not descend from a live utility child');
  }
  const main = security.processes.find((entry) => entry.pid === probe.pid);
  requireEvidence(main !== undefined, 'main process security unavailable');
  if (stage.installed.route === 'linux-appimage') {
    const profile = `${linuxInstallation(stage.candidate.channel, true).name} (unconfined)`;
    const [filesystem, options] = (main?.measurements['mount'] ?? '').split(/\s+/u);
    requireEvidence(
      Boolean(filesystem?.startsWith('fuse')) &&
        ['ro', 'nosuid', 'nodev'].every((flag) => options?.split(',').includes(flag)),
      'managed AppImage is not a read-only nosuid/nodev FUSE mount',
    );
    requireEvidence(
      main?.measurements['appArmor'] === profile &&
        security.processes.find((entry) => entry.pid === renderer.pid)?.measurements['appArmor'] === profile,
      'managed AppImage profile label differs',
    );
    requireEvidence(
      main?.measurements['executableSha256'] === stage.installed.measurements['expectedExecutableSha256'] &&
        main?.measurements['mountedAsarSha256'] === stage.installed.asarSha256,
      'running mounted AppImage differs from candidate payload',
    );
  } else {
    requireEvidence(
      main?.executable === stage.installed.executablePath,
      'running executable path differs from installation',
    );
  }
  for (const pid of ids) {
    const process = security.processes.find((entry) => entry.pid === pid);
    requireEvidence(
      process !== undefined && process.executable.length > 0 && process.commandLine.length > 0,
      'process path/command observation unavailable',
    );
    if (!process) {
      continue;
    }
    requireEvidence(
      !/--no-sandbox|--disable-setuid-sandbox|--disable-gpu-sandbox/u.test(process.commandLine),
      'sandbox bypass command line',
    );
    requireEvidence(
      !Object.values(process.measurements).some((value) => value.startsWith('unavailable:')),
      'security measurement unavailable',
    );
    if (platform === 'win32') {
      requireEvidence(
        ['0', '1'].includes(process.measurements['elevated'] ?? ''),
        'Windows elevation observation missing',
      );
      if (pid !== probe.pid) {
        requireEvidence(process.measurements['elevated'] === '0', 'elevated Windows child');
      }
      const integrity = Number(process.measurements['integrityRid']);
      requireEvidence(
        Number.isInteger(integrity) && integrity >= 0 && (pid === probe.pid || integrity <= 4096),
        'Windows child token integrity is not restricted',
      );
    } else if (pid !== probe.pid && platform === 'linux') {
      const status = process.measurements['status'] ?? '';
      requireEvidence(
        /^Seccomp:\s+2$/mu.test(status) && /^NoNewPrivs:\s+1$/mu.test(status),
        'Linux seccomp/NoNewPrivs missing',
      );
      requireEvidence(
        /^user:\[\d+\]$/u.test(process.measurements['userNamespace'] ?? '') &&
          process.measurements['userNamespace'] !== main?.measurements['userNamespace'] &&
          /^pid:\[\d+\]$/u.test(process.measurements['pidNamespace'] ?? '') &&
          process.measurements['pidNamespace'] !== main?.measurements['pidNamespace'],
        'Linux child namespaces are not isolated',
      );
    } else if (pid !== probe.pid && platform === 'darwin') {
      requireEvidence(
        /^1\s+0$/u.test(process.measurements['sandboxCheck'] ?? ''),
        'Mac native sandbox SPI did not observe sandboxed process',
      );
    }
  }
  if (platform === 'win32') {
    requireEvidence(
      ['0', '1'].includes(security.measurements['uacEnabled'] ?? '') &&
        ['0', '1'].includes(security.measurements['runnerElevated'] ?? ''),
      'Windows host UAC/elevation observation missing',
    );
  }
  if (platform === 'linux') {
    const os = security.osVersion;
    requireEvidence(
      (/ID=ubuntu/u.test(os) && /VERSION_ID="?24\.04/u.test(os)) ||
        (/ID=debian/u.test(os) && /VERSION_ID="?13/u.test(os)),
      'Linux stock distro is outside qualified support matrix',
    );
    requireEvidence(security.measurements['appArmorEnabled'] === 'Y', 'stock Linux AppArmor is disabled');
    if (/ID=ubuntu/u.test(os)) {
      requireEvidence(
        security.measurements['appArmorUsernsRestriction'] === '1',
        'Ubuntu stock AppArmor user namespace restriction is disabled',
      );
    }
    if (/ID=debian/u.test(os)) {
      requireEvidence(
        security.measurements['unprivilegedUserns'] === '1',
        'Debian stock unprivileged namespace policy differs',
      );
    }
    requireEvidence(
      Number(security.measurements['maxUserNamespaces']) > 0,
      'Linux user namespace capacity is disabled',
    );

    requireEvidence(
      security.measurements['runnerUid'] !== '0' && /^\d+$/u.test(security.measurements['runnerUid'] ?? ''),
      'Linux standard-user observation missing',
    );
    requireEvidence(
      !Object.entries(security.measurements).some(
        ([key, value]) =>
          value.startsWith('unavailable:') &&
          !(key === 'appArmorUsernsRestriction' && /ID=debian/u.test(os) && /ENOENT/u.test(value)),
      ),
      'Linux stock-security measurements unavailable',
    );
  }
};

/** Called by the native runner after independently reading OS processes, installed bytes and retained project files. */
const validateQualificationEvidence = (input: QualificationEvidence): DesktopAcceptanceReceipt => {
  const [a, b, c] = input.stages;
  const stages = input.stages.map((stage) => ({
    ...stage,
    candidate: parseDesktopArtifactManifest(stage.candidate),
    probe: qualificationProbeObservationSchema.parse(stage.probe),
    renderer: qualificationRendererObservationSchema.parse(stage.renderer),
  }));
  requireEvidence(new Set(stages.map((stage) => stage.probe.pid)).size === 3, 'replacement did not change main PID');
  requireEvidence(
    new Set(stages.map((stage) => stage.candidate.version)).size === 3,
    'three independent versions required',
  );
  for (const [index, stage] of stages.entries()) {
    const { candidate, installed, probe, renderer } = stage;
    requireEvidence(
      probe.stage === ['a', 'b', 'c'][index] && probe.action === (index === 2 ? 'observe' : 'install'),
      'stage action differs',
    );
    requireEvidence(
      installed.route === input.route &&
        probe.route === input.route &&
        probe.target === input.target &&
        installed.tag === candidate.tag &&
        installed.version === candidate.version &&
        installed.sourceCommit === candidate.sourceCommit &&
        installed.channel === candidate.channel &&
        probe.version === candidate.version &&
        probe.sourceCommit === candidate.sourceCommit &&
        probe.channel === candidate.channel,
      'installed source/version/route differs from candidate',
    );
    requireEvidence(installed.measurements['trust'] === 'release', 'installed release trust missing');
    const expectedExecutable = installed.measurements['expectedExecutableSha256'];
    requireEvidence(
      digest.safeParse(expectedExecutable).success &&
        digest.safeParse(installed.measurements['expectedAsarSha256']).success &&
        installed.asarSha256 === installed.measurements['expectedAsarSha256'],
      'installed ASAR differs from candidate payload',
    );
    if (input.route === 'linux-appimage') {
      const artifact = candidate.artifacts.find(
        (entry) => entry.kind === 'linux-appimage' && entry.target === input.target,
      );
      requireEvidence(
        installed.executableSha256 === artifact?.sha256 &&
          installed.artifactSha256 === artifact.sha256 &&
          installed.measurements['extractedExecutableSha256'] === expectedExecutable,
        'outer AppImage or extracted executable differs from candidate',
      );
    } else {
      requireEvidence(
        installed.executableSha256 === expectedExecutable,
        'installed executable differs from candidate payload',
      );
    }
    requireEvidence(
      probe.nonce === a.probe.nonce &&
        probe.profile === a.probe.profile &&
        probe.profileSentinel === a.probe.profileSentinel &&
        probe.installedPath === a.probe.installedPath &&
        probe.mirrorOrigin === a.probe.mirrorOrigin,
      'run/profile/stable installation identity changed',
    );
    requireEvidence(
      probe.project.path === a.probe.project.path &&
        probe.projectSha256 === a.probe.projectSha256 &&
        probe.project.sha256 === probe.projectSha256 &&
        renderer.projectSha256 === probe.projectSha256 &&
        renderer.projectPath === a.renderer.projectPath,
      'actual saved project was not retained',
    );
    requireEvidence(
      renderer.saveObservedAt <= probe.observedAt && renderer.saveObservedAt > 0,
      'shipping renderer save was not observed before update admission',
    );
    for (const [name, expected] of [
      ['a', a.candidate],
      ['b', b.candidate],
      ['c', c.candidate],
    ] as const) {
      requireEvidence(
        probe[name].tag === expected.tag &&
          probe[name].sourceCommit === expected.sourceCommit &&
          probe[name].version === expected.version,
        'probe candidate chain changed',
      );
    }
    requireEvidence(
      probe.discovery === ['candidate', 'latest', 'none'][index] &&
        (index === 0 ? probe.candidateTag === b.candidate.tag : probe.candidateTag === undefined),
      'probe used an explicit candidate for normal-feed replacement',
    );
    checkSecurity(stage, input.target);
  }
  requireEvidence(
    a.probe.observedAt < b.probe.observedAt && b.probe.observedAt < c.probe.observedAt,
    'replacement observation order differs',
  );
  if (input.route === 'windows-nsis' || input.route === 'linux-appimage') {
    const ordinary = input.lifecycle.ordinaryQuit;
    requireEvidence(ordinary !== undefined, 'ordinary quit observation missing');
    if (!ordinary) {
      throw new Error('Missing ordinary quit observation');
    }
    const ordinaryProbe = qualificationProbeObservationSchema.parse(ordinary.probe);
    requireEvidence(
      ordinaryProbe.action === 'observe' &&
        ordinaryProbe.stage === 'a' &&
        ordinaryProbe.nonce === a.probe.nonce &&
        ordinary.exitedPid === ordinaryProbe.pid &&
        ordinary.exitedPid !== a.probe.pid &&
        ordinaryProbe.observedAt < a.probe.observedAt &&
        equalInstallation(ordinary.before, ordinary.after) &&
        equalInstallation(ordinary.after, a.installed),
      'ordinary quit installed or failed to preserve baseline',
    );
  }
  const removed = input.lifecycle.uninstall;
  const removedEntry =
    input.route === 'linux-apt' ||
    (input.route === 'linux-appimage' &&
      c.candidate.artifacts.some((item) => item.kind === 'linux-appimage-deb-runtime'))
      ? linuxInstallation(c.candidate.channel, input.route === 'linux-appimage').launcher
      : input.route === 'windows-nsis'
        ? c.installed.executablePath
        : input.route.startsWith('macos-')
          ? dirname(dirname(dirname(c.installed.installationPath)))
          : c.installed.installationPath;
  const reinstalled = input.lifecycle.reinstall;
  requireEvidence(
    equalInstallation(reinstalled.installed, c.installed) &&
      reinstalled.mainPid !== c.probe.pid &&
      Number.isSafeInteger(reinstalled.mainPid) &&
      reinstalled.mainPid > 0 &&
      reinstalled.projectPath === c.renderer.projectPath &&
      reinstalled.projectSha256 === c.renderer.projectSha256 &&
      /^[a-f\d]{64}$/u.test(reinstalled.exportSha256) &&
      removed.before.every((file) =>
        reinstalled.files.some((after) => after.path === file.path && after.sha256 === file.sha256),
      ),
    'reinstall did not preserve the authenticated candidate and saved project',
  );
  const sentinelHash = createHash('sha256').update(c.probe.profileSentinel).digest('hex');
  requireEvidence(
    removed.removedInstallationPath === removedEntry,
    'uninstall observation concerns another installation',
  );
  requireEvidence(
    removed.before.some(
      (file) => file.path === join(c.probe.profile, 'route-qualification.sentinel') && file.sha256 === sentinelHash,
    ),
    'uninstall profile sentinel observation missing',
  );

  requireEvidence(
    !removed.existsAfter &&
      removed.removedInstallationPath.length > 0 &&
      removed.before.length > 0 &&
      removed.before.length === removed.after.length &&
      removed.before.every((file) =>
        removed.after.some((after) => after.path === file.path && after.sha256 === file.sha256),
      ) &&
      removed.before.some((file) => file.path === c.renderer.projectPath && file.sha256 === c.renderer.projectSha256),
    'uninstall preservation or removal was not observed',
  );
  if (
    input.route === 'linux-apt' ||
    (input.route === 'linux-appimage' &&
      c.candidate.artifacts.some((item) => item.kind === 'linux-appimage-deb-runtime'))
  ) {
    requireEvidence(input.scheduler?.length === 2, 'both real scheduler transitions required');
    for (const [index, event] of (input.scheduler ?? []).entries()) {
      const before = input.stages[index]!;
      const after = input.stages[index + 1]!;
      requireEvidence(
        event.retained.pid === before.probe.pid &&
          event.activeSession.pid === before.probe.pid &&
          event.activeSession.projectSha256 === before.renderer.projectSha256 &&
          /^[a-f\d]{64}$/u.test(event.activeSession.exportSha256) &&
          event.activeSession.vertices >= 3 &&
          event.retained.resourceSha256.length === 64 &&
          equalInstallation(event.installation, after.installed) &&
          event.retained.executable ===
            (input.route === 'linux-appimage'
              ? before.security.processes.find((process) => process.pid === before.probe.pid)?.executable
              : before.installed.executablePath) &&
          /^\d+$/u.test(event.retained.startTime) &&
          event.scheduler['result'] === 'success' &&
          Boolean(event.scheduler['invocation']) &&
          event.scheduler['beforeInvocation'] !== event.scheduler['invocation'] &&
          (event.scheduler['journal'] ?? '').includes(event.scheduler['invocation'] ?? '\0') &&
          (event.scheduler['packageLog'] ?? '').includes(after.candidate.version) &&
          (event.scheduler['policy'] ?? '').includes(
            `origin=Tau,label=Tau${after.candidate.channel === 'staging' ? 'Staging' : 'Production'},`,
          ) &&
          /APT::Periodic::Unattended-Upgrade "(?:1|always)";/u.test(event.scheduler['policy'] ?? ''),
        'real unattended scheduler or active runtime retention missing',
      );
    }
  } else {
    const descriptor = input.route.startsWith('macos-')
      ? `desktop-update-${input.target}.json`
      : `desktop-update-${input.route}-x64.json`;
    const discovery = input.mirrorRequests.filter(
      (request) => request.at >= b.probe.observedAt && request.at <= c.probe.observedAt,
    );
    requireEvidence(
      discovery.some((request) => request.path === `/latest/${descriptor}` && request.status === 200),
      'B to C did not discover the normal latest feed',
    );
    const pinned = discovery.filter(
      (request) => request.path === `/releases/${encodeURIComponent(c.candidate.tag)}/${descriptor}`,
    );
    if (input.route.startsWith('macos-')) {
      const latest = discovery.find((request) => request.path === `/latest/${descriptor}` && request.status === 200);
      requireEvidence(
        pinned.every((request) => latest !== undefined && request.at >= latest.at),
        'Mac native feed was pinned before latest discovery',
      );
    } else {
      requireEvidence(pinned.length === 0, 'B to C used a pinned candidate discovery');
    }
  }
  const kinds: readonly string[] = desktopAcceptanceRoutes[input.route];
  const artifacts = c.candidate.artifacts.filter(
    (artifact) => artifact.target === input.target && kinds.includes(artifact.kind),
  );
  const baseline = a.candidate.artifacts.find(
    (artifact) => artifact.target === input.target && kinds.includes(artifact.kind),
  );
  requireEvidence(baseline !== undefined, 'baseline artifact missing');
  requireEvidence(!(input.acceptance && input.windowsAcceptance), 'mixed consumer platforms');
  const host = input.windowsAcceptance
    ? windowsConsumerReceiptFacts(input, input.windowsAcceptance)
    : input.acceptance
      ? cleanHostReceiptFacts(input, input.acceptance)
      : undefined;
  return parseDesktopAcceptanceReceipt(
    {
      schemaVersion: 1,
      status: 'passed',
      tag: c.candidate.tag,
      channel: c.candidate.channel,
      version: c.candidate.version,
      sourceCommit: c.candidate.sourceCommit,
      target: input.target,
      route: input.route,
      artifacts: artifacts.map(({ name, sha256 }) => ({ name, sha256 })),
      baseline: { version: a.candidate.version, artifactSha256: baseline?.sha256 },
      installed: { version: c.installed.version, executableSha256: c.installed.executableSha256 },
      environment: {
        os: c.security.osVersion,
        arch: input.target.endsWith('arm64') ? 'arm64' : 'x64',
        kind: host ? 'vm' : 'ci',
        sandbox: 'enabled',
        ...(host ? { host } : {}),
      },
      trust: { kind: 'release', identity: input.trustIdentity },
      checks: { cleanInstall: true, upgrade: true, dataPreserved: true },
      suite: input.suite,
      logs: input.logs,
    },
    c.candidate,
  );
};

/** Release receipts require stock graphics; isolated software runs never produce acceptance receipts. */
export const collectQualificationReceipt = (input: QualificationEvidence): DesktopAcceptanceReceipt => {
  requireEvidence(input.mode === 'release', 'fixture runs and software runs cannot qualify releases');
  requireEvidence(
    input.stages.every(
      (stage) =>
        !stage.renderer.softwareRenderer &&
        stage.security.processes.every(
          (process) =>
            !/--enable-unsafe-swiftshader|--ignore-gpu-blocklist|--use-angle=swiftshader|--use-gl=swiftshader/u.test(
              process.commandLine,
            ),
        ),
    ),
    'software graphics cannot qualify stock GPU acceptance',
  );
  return validateQualificationEvidence(input);
};

/** Validate the same installed upgrade observations, retaining stock GPU acceptance as an open gate. */
export const validateSoftwareCiEvidence = (input: QualificationEvidence): void => {
  requireEvidence(
    input.mode === 'software-ci' &&
      input.target === 'linux-x64' &&
      input.route.startsWith('linux-') &&
      !input.acceptance &&
      !input.windowsAcceptance &&
      input.stages.every(
        (stage) => stage.candidate.channel === 'staging' && /SwiftShader/iu.test(stage.renderer.softwareRenderer ?? ''),
      ),
    'isolated software CI requires Linux staging SwiftShader observations',
  );
  validateQualificationEvidence(input);
};
