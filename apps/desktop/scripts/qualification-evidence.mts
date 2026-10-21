/** Convert independently collected native observations into one CI receipt; fixture data never qualifies a release. */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import {
  desktopAcceptanceRoutes,
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
});
export type QualificationRendererObservation = z.infer<typeof qualificationRendererObservationSchema>;
export type QualificationStageEvidence = {
  candidate: DesktopArtifactManifest;
  installed: QualificationInstallation;
  probe: QualificationProbeObservation;
  renderer: QualificationRendererObservation;
  security: QualificationSecurity;
};
export type QualificationEvidence = {
  mode: 'release' | 'fixture';
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
};
const requireEvidence = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Qualification undecided: ${message}`);
  }
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
    requireEvidence(!/--no-sandbox|--disable-setuid-sandbox/u.test(process.commandLine), 'sandbox bypass command line');
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
export const collectQualificationReceipt = (input: QualificationEvidence): DesktopAcceptanceReceipt => {
  requireEvidence(input.mode === 'release', 'fixture runs cannot qualify releases');
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
    input.route === 'linux-apt'
      ? `/usr/bin/tau${c.candidate.channel === 'staging' ? '-staging' : ''}`
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
  if (input.route === 'linux-apt') {
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
          event.retained.executable === before.installed.executablePath &&
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
        kind: 'ci',
        sandbox: 'enabled',
      },
      trust: { kind: 'release', identity: input.trustIdentity },
      checks: { cleanInstall: true, upgrade: true, dataPreserved: true },
      suite: input.suite,
      logs: input.logs,
    },
    c.candidate,
  );
};
