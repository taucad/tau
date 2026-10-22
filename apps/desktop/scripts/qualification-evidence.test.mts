#!/usr/bin/env node
/** Purpose: Exercise receipt decisions with synthetic observations; these tests create no native qualification evidence. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseDesktopArtifactManifest, desktopArtifactKinds, desktopArtifactName } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Test the actual collector decision boundary. */
import { collectQualificationReceipt } from './qualification-evidence.mjs';
import type { QualificationEvidence, QualificationStageEvidence } from './qualification-evidence.mjs';
/* oxlint-enable no-restricted-imports */
const hash = (value: number): string => value.toString(16).padStart(64, '0');
const fixture = (): QualificationEvidence => {
  const nonce = randomUUID();
  const profileSentinel = randomUUID();
  const candidates = [1, 2, 3].map((version) =>
    parseDesktopArtifactManifest({
      schemaVersion: 1,
      tag: `desktop-staging@0.1.0-staging.${version}`,
      channel: 'staging',
      version: `1.0.${version}`,
      sourceCommit: String(version).repeat(40),
      artifacts: [
        {
          target: 'win32-x64',
          kind: 'windows-nsis',
          name: 'Tau-win32-x64.exe',
          format: 'exe',
          roles: ['installer', 'update'],
          size: 10,
          sha256: hash(version),
          sha512: Buffer.alloc(64, version).toString('base64'),
        },
      ],
    }),
  );
  const identities = candidates.map(({ tag, version, sourceCommit }) => ({ tag, version, sourceCommit }));
  const stages = candidates.map((candidate, index): QualificationStageEvidence => {
    const pid = 100 + index * 10;
    const executableSha256 = hash(index + 10);
    const asarSha256 = hash(index + 20);
    return {
      candidate,
      installed: {
        route: 'windows-nsis',
        tag: candidate.tag,
        channel: 'staging',
        version: candidate.version,
        sourceCommit: candidate.sourceCommit,
        executablePath: '/installed/Tau.exe',
        installationPath: '/installed',
        executableSha256,
        asarSha256,
        measurements: { trust: 'release', expectedExecutableSha256: executableSha256, expectedAsarSha256: asarSha256 },
      },
      probe: {
        diagnosticOnly: true,
        schemaVersion: 1,
        nonce,
        profileSentinel,
        stage: index === 0 ? 'a' : index === 1 ? 'b' : 'c',
        action: index === 2 ? 'observe' : 'install',
        discovery: index === 0 ? 'candidate' : index === 1 ? 'latest' : 'none',
        ...(index === 0 ? { candidateTag: candidates[1]!.tag } : {}),
        pid,
        rendererPid: pid + 1,
        version: candidate.version,
        sourceCommit: candidate.sourceCommit,
        route: 'windows-nsis',
        target: 'win32-x64',
        channel: 'staging',
        profile: '/profile',
        installedPath: '/installed/Tau.exe',
        mirrorOrigin: 'https://127.0.0.1:4443',
        observedAt: (index + 1) * 1000,
        project: { path: 'projects/model.ts', sha256: hash(99) },
        projectSha256: hash(99),
        a: identities[0]!,
        b: identities[1]!,
        c: identities[2]!,
        children: [{ pid: pid + 2, type: 'Utility' }],
      },
      renderer: {
        pid: pid + 1,
        projectPath: '/profile/projects/model.ts',
        projectSha256: hash(99),
        nativePids: [pid + 3],
        nativeAncestry: [
          { pid: pid + 3, parent: pid + 2, command: 'python worker' },
          { pid: pid + 2, parent: pid, command: 'Tau Utility' },
        ],
        saveObservedAt: (index + 1) * 1000 - 1,
      },
      security: {
        platform: 'win32',
        architecture: 'AMD64',
        osVersion: 'Windows 11 x64',
        measurements: { uacEnabled: '1', runnerElevated: '0' },
        processes: [pid, pid + 1, pid + 3].map((observedPid) => ({
          pid: observedPid,
          executable: '/installed/Tau.exe',
          commandLine: '/installed/Tau.exe',
          measurements: { elevated: '0', integrityRid: observedPid === pid ? '8192' : '4096' },
        })),
      },
    };
  });
  const [a, b, c] = stages;
  assert.ok(a && b && c);
  const preserved = [
    { path: c.renderer.projectPath, sha256: c.renderer.projectSha256 },
    {
      path: join('/profile', 'route-qualification.sentinel'),
      sha256: createHash('sha256').update(profileSentinel).digest('hex'),
    },
  ];
  return {
    mode: 'release',
    route: 'windows-nsis',
    target: 'win32-x64',
    stages: [a, b, c],
    lifecycle: {
      reinstall: {
        installed: c.installed,
        files: preserved,
        mainPid: 999,
        projectPath: c.renderer.projectPath,
        projectSha256: c.renderer.projectSha256,
        exportSha256: hash(80),
      },
      ordinaryQuit: {
        probe: { ...a.probe, pid: 50, rendererPid: 51, action: 'observe', observedAt: 500 },
        before: { ...a.installed },
        after: { ...a.installed },
        exitedPid: 50,
      },
      uninstall: {
        before: preserved,
        after: [...preserved],
        removedInstallationPath: '/installed/Tau.exe',
        existsAfter: false,
      },
    },
    mirrorRequests: [{ path: '/latest/desktop-update-windows-nsis-x64.json', status: 200, at: 2500 }],
    logs: 'synthetic-unit-only',
    suite: 'synthetic-unit-only',
    trustIdentity: 'synthetic publisher',
  };
};
const platformFixture = (route: 'macos-zip' | 'macos-dmg' | 'linux-appimage' | 'linux-apt'): QualificationEvidence => {
  const input = fixture();
  const mac = route.startsWith('macos-');
  input.lifecycle.uninstall.removedInstallationPath = '/installed';
  input.route = route;
  input.target = mac ? 'darwin-x64' : 'linux-x64';
  for (const stage of input.stages) {
    const kinds =
      route === 'macos-dmg'
        ? (['macos-zip', 'macos-dmg'] as const)
        : route === 'linux-apt'
          ? (['linux-deb-runtime', 'linux-deb-selector'] as const)
          : route === 'linux-appimage'
            ? (['linux-appimage', 'linux-appimage-deb-runtime', 'linux-appimage-deb-selector'] as const)
            : [route];
    stage.candidate = parseDesktopArtifactManifest({
      ...stage.candidate,
      artifacts: kinds.map((kind) => ({
        ...stage.candidate.artifacts[0],
        kind,
        target: input.target,
        name: desktopArtifactName({ kind, channel: 'staging', version: stage.candidate.version, arch: 'x64' }),
        format: desktopArtifactKinds[kind].format,
        roles: desktopArtifactKinds[kind].roles,
      })),
    });
    stage.installed.route = route;
    if (mac) {
      stage.installed.installationPath = '/installed/Tau.app/Contents/Resources/app.asar';
      stage.installed.executablePath = '/installed/Tau.app/Contents/MacOS/Tau';
      stage.probe.installedPath = stage.installed.installationPath;
      for (const process of stage.security.processes) {
        process.executable = stage.installed.executablePath;
      }
      input.lifecycle.uninstall.removedInstallationPath = '/installed/Tau.app';
    }

    if (route === 'linux-apt') {
      stage.installed.installationPath = `/opt/tau-staging/releases/${stage.candidate.version}`;
      stage.installed.executablePath = `${stage.installed.installationPath}/Tau`;
      stage.probe.installedPath = '/usr/bin/tau-staging';
      for (const process of stage.security.processes) {
        process.executable = stage.installed.executablePath;
      }
      input.lifecycle.uninstall.removedInstallationPath = '/usr/bin/tau-staging';
    }
    stage.probe.route = route;
    stage.probe.target = input.target;
    stage.security.platform = mac ? 'darwin' : 'linux';
    stage.security.architecture = 'x64';
    stage.security.osVersion = mac ? 'Darwin 26' : 'Linux\nID=ubuntu\nVERSION_ID="24.04"';
    stage.security.measurements = mac
      ? { sip: 'enabled', gatekeeper: 'assessments enabled' }
      : {
          runnerUid: '1000',
          appArmorEnabled: 'Y',
          appArmorUsernsRestriction: '1',
          unprivilegedUserns: '1',
          maxUserNamespaces: '1000',
        };
    for (const process of stage.security.processes) {
      process.measurements = mac
        ? { sandboxCheck: process.pid === stage.probe.pid ? '0 0' : '1 0' }
        : {
            status: 'Seccomp:\t2\nNoNewPrivs:\t1',
            userNamespace: process.pid === stage.probe.pid ? 'user:[1]' : 'user:[2]',
            pidNamespace: process.pid === stage.probe.pid ? 'pid:[1]' : 'pid:[2]',
          };
    }
    if (route === 'linux-appimage') {
      stage.installed.installationPath = `/opt/tau-staging-appimage/releases/${stage.candidate.version}/Tau.AppImage`;
      stage.installed.executablePath = stage.installed.installationPath;
      stage.probe.installedPath = '/usr/bin/tau-staging-appimage';
      input.lifecycle.uninstall.removedInstallationPath = '/usr/bin/tau-staging-appimage';
      const expected = stage.installed.executableSha256;
      const artifact = stage.candidate.artifacts[0]!;
      stage.installed.measurements['extractedExecutableSha256'] = expected;
      stage.installed.executableSha256 = artifact.sha256;
      stage.installed.artifactSha256 = artifact.sha256;
      stage.security.processes[0]!.measurements['executableSha256'] = expected;
      stage.security.processes[0]!.measurements['mountedAsarSha256'] = stage.installed.asarSha256;
      stage.security.processes[0]!.measurements['mount'] = 'fuse.Tau.AppImage ro,nosuid,nodev';
      for (const process of stage.security.processes) {
        process.measurements['appArmor'] = 'tau-staging-appimage (unconfined)';
      }
    }
  }
  if (mac || route === 'linux-apt') {
    delete input.lifecycle.ordinaryQuit;
  } else {
    input.lifecycle.ordinaryQuit = {
      probe: { ...input.stages[0].probe, pid: 50, action: 'observe', observedAt: 500 },
      before: { ...input.stages[0].installed },
      after: { ...input.stages[0].installed },
      exitedPid: 50,
    };
  }
  input.mirrorRequests = [
    {
      path: mac ? '/latest/desktop-update-darwin-x64.json' : '/latest/desktop-update-linux-appimage-x64.json',
      status: 200,
      at: 2500,
    },
  ];
  if (route === 'linux-apt' || route === 'linux-appimage') {
    input.scheduler = [0, 1].map((index) => ({
      installation: input.stages[index + 1]!.installed,
      activeSession: {
        pid: input.stages[index]!.probe.pid,
        projectSha256: input.stages[index]!.renderer.projectSha256,
        exportSha256: hash(81),
        vertices: 48,
      },
      retained: {
        pid: input.stages[index]!.probe.pid,
        startTime: '12345',
        executable: input.stages[index]!.security.processes[0]!.executable,
        resourcePath: `${input.stages[index]!.installed.installationPath}/resources/app.asar`,
        resourceSha256: input.stages[index]!.installed.asarSha256,
      },
      scheduler: {
        beforeInvocation: `old${index}`,
        invocation: `new${index}`,
        result: 'success',
        journal: `new${index}`,
        packageLog: `upgraded ${input.stages[index + 1]!.candidate.version}`,
        policy: 'origin=Tau,label=TauStaging, APT::Periodic::Unattended-Upgrade "1";',
      },
    }));
  }
  return input;
};
const main = (): void => {
  const missingReinstall = fixture();
  missingReinstall.lifecycle.reinstall.projectSha256 = hash(100);
  assert.throws(() => collectQualificationReceipt(missingReinstall), /reinstall/u);
  const admitted = collectQualificationReceipt(fixture());
  assert.equal(admitted.version, '1.0.3');
  assert.equal(admitted.environment.kind, 'ci');
  assert.equal(admitted.baseline.version, '1.0.1');
  const changes: Array<[string, (input: QualificationEvidence) => void, RegExp]> = [
    [
      'fixture trust',
      (input) => {
        input.mode = 'fixture';
      },
      /fixture runs/u,
    ],
    [
      'same process',
      (input) => {
        input.stages[2].probe.pid = input.stages[1].probe.pid;
      },
      /main PID/u,
    ],
    [
      'wrong source',
      (input) => {
        input.stages[1].installed.sourceCommit = 'd'.repeat(40);
      },
      /source\/version/u,
    ],
    [
      'wrong payload',
      (input) => {
        input.stages[1].installed.asarSha256 = hash(77);
      },
      /ASAR/u,
    ],
    [
      'project loss',
      (input) => {
        input.stages[2].renderer.projectSha256 = hash(78);
      },
      /project/u,
    ],
    [
      'profile replacement',
      (input) => {
        input.stages[2].probe.profileSentinel = randomUUID();
      },
      /profile/u,
    ],
    [
      'unsandboxed child',
      (input) => {
        input.stages[1].security.processes[1]!.measurements['integrityRid'] = '8192';
      },
      /integrity/u,
    ],
    [
      'elevated app',
      (input) => {
        input.stages[0].security.processes[1]!.measurements['elevated'] = '1';
      },
      /elevated/u,
    ],
    [
      'no native work',
      (input) => {
        input.stages[2].renderer.nativePids = [];
      },
      /Too small/u,
    ],
    [
      'quit installed',
      (input) => {
        input.lifecycle.ordinaryQuit!.after.version = '1.0.2';
      },
      /ordinary quit/u,
    ],
    [
      'uninstall removed data',
      (input) => {
        input.lifecycle.uninstall.after = [];
      },
      /uninstall/u,
    ],
    [
      'missing normal feed',
      (input) => {
        input.mirrorRequests = [];
      },
      /normal latest/u,
    ],
    [
      'pinned C',
      (input) => {
        input.mirrorRequests = [
          ...input.mirrorRequests,
          {
            path: `/releases/${encodeURIComponent(input.stages[2].candidate.tag)}/desktop-update-windows-nsis-x64.json`,
            status: 200,
            at: 2501,
          },
        ];
      },
      /pinned candidate/u,
    ],
  ];
  for (const [name, change, message] of changes) {
    const input = fixture();
    change(input);
    assert.throws(() => collectQualificationReceipt(input), message, name);
  }
  const hosted = fixture();
  for (const stage of hosted.stages) {
    stage.security.measurements['uacEnabled'] = '0';
    stage.security.measurements['runnerElevated'] = '1';
    stage.security.processes[0]!.measurements['elevated'] = '1';
    stage.security.processes[0]!.measurements['integrityRid'] = '12288';
  }
  assert.equal(collectQualificationReceipt(hosted).environment.kind, 'ci');
  for (const route of ['macos-zip', 'macos-dmg', 'linux-appimage'] as const) {
    const input = platformFixture(route);
    assert.equal(collectQualificationReceipt(input).route, route);
    if (route.startsWith('macos-')) {
      input.mirrorRequests = [
        ...input.mirrorRequests,
        {
          path: `/releases/${encodeURIComponent(input.stages[2].candidate.tag)}/desktop-update-darwin-x64.json`,
          status: 200,
          at: 2600,
        },
      ];
      assert.equal(collectQualificationReceipt(input).route, route);
      input.stages[1].security.processes[1]!.measurements['sandboxCheck'] = '0 0';
      assert.throws(() => collectQualificationReceipt(input), /Mac native sandbox/u);
    } else {
      input.stages[1].security.processes[0]!.measurements['mountedAsarSha256'] = hash(88);
      assert.throws(() => collectQualificationReceipt(input), /mounted AppImage/u);
    }
  }
  for (const [key, value] of [
    ['appArmorEnabled', 'N'],
    ['appArmorUsernsRestriction', '0'],
    ['maxUserNamespaces', '0'],
  ]) {
    const input = platformFixture('linux-appimage');
    input.stages[1].security.measurements[key!] = value!;
    assert.throws(() => collectQualificationReceipt(input), /disabled/u);
  }
  for (const mount of [
    'ext4 ro,nosuid,nodev',
    'fuse.Tau.AppImage rw,nosuid,nodev',
    'fuse.Tau.AppImage ro,nodev',
    'fuse.Tau.AppImage ro,nosuid',
  ]) {
    const invalid = platformFixture('linux-appimage');
    invalid.stages[0].security.processes[0]!.measurements['mount'] = mount;
    assert.throws(() => collectQualificationReceipt(invalid), /FUSE mount/u);
  }
  const wrongProfile = platformFixture('linux-appimage');
  wrongProfile.stages[0].security.processes[0]!.measurements['appArmor'] = 'unconfined';
  assert.throws(() => collectQualificationReceipt(wrongProfile), /profile label/u);
  const debian = platformFixture('linux-appimage');
  for (const stage of debian.stages) {
    stage.security.osVersion = 'Linux\nID=debian\nVERSION_ID="13"';
    stage.security.measurements['appArmorUsernsRestriction'] = 'unavailable:ENOENT';
  }
  assert.equal(collectQualificationReceipt(debian).environment.kind, 'ci');
  const apt = platformFixture('linux-apt');
  assert.equal(collectQualificationReceipt(apt).route, 'linux-apt');
  apt.scheduler![0]!.scheduler['invocation'] = apt.scheduler![0]!.scheduler['beforeInvocation']!;
  assert.throws(() => collectQualificationReceipt(apt), /real unattended scheduler/u);
  const cycle = fixture();
  cycle.stages[1].renderer.nativeAncestry[0]!.parent = cycle.stages[1].renderer.nativeAncestry[0]!.pid;
  assert.throws(() => collectQualificationReceipt(cycle), /ancestry cycle/u);
  console.log(
    'PASS collector synthetic decisions: five route A/B/C receipts and trust/source/payload/process/security/lifecycle/feed refusals; no native qualification claimed',
  );
};
try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
