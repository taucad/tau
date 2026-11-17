/**
 * NW01, the WIN-X64 conformance row for a native worker (`windows-sandbox/README.md`, "Native workers"), driven through
 * a direct helper session ({@link openWindowsHelperSession}) beneath the shell provider. The worker is the stand-in
 * probe (`windows-sandbox/examples/tau_worker_probe.rs`) copied into a runtime root of its own outside the fixed roots,
 * with a DLL beside it; it answers JSON lines on stdin. Every property is judged outside the sandbox: the refusals before
 * anything changes, the pin on the file, what the worker could and could not reach, its end of input, the network
 * canaries, and each path's ACL afterwards.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import type { Server } from 'node:net';
import { join } from 'node:path';

import { openWindowsHelperSession } from '#shell/windows-helper-session.fixture.js';
import { windowsExclusiveLaunchRequirement } from '#shell/windows-sandbox-protocol.js';
import type { WindowsHelperFrame, WindowsLaunchSpec } from '#shell/windows-sandbox-protocol.js';

/** What the row borrows from the conformance suite. */
export type NativeWorkerContext = Readonly<{
  /** The suite's private root; the row makes its folders inside it. */
  root: string;
  helperPath: string;
  /** The built probe. */
  workerProbe: string;
  systemRoot: string;
  recordHelperDiagnostic: (line: string) => void;
  sddlOf: (paths: readonly string[]) => Record<string, string>;
  interfaceAddress: () => string | undefined;
  tcpCanary: (address: string) => Promise<{ server: Server; port: number; connections: () => number }>;
  tcpControl: (address: string, port: number) => Promise<void>;
  waitUntil: (condition: () => boolean, milliseconds: number) => Promise<boolean>;
  /** Wait out a settling period. */
  pause: (milliseconds: number) => Promise<void>;
}>;

/** Each of `actual` has at least the fields its counterpart in `expected` names, with deeply equal values. */
const assertMatches = (actual: readonly unknown[], expected: ReadonlyArray<Record<string, unknown>>): void => {
  const picked = actual.map((item, index) => {
    const fields = Object.keys(expected[index] ?? {});
    const record = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return Object.fromEntries(fields.filter((field) => field in record).map((field) => [field, record[field]]));
  });
  assert.deepEqual(picked, expected, JSON.stringify(actual));
};

/**
 * Run NW01.
 *
 * @param context - The suite's root, helper, probe and outside observers.
 */
export const nativeWorkerConformance = async (context: NativeWorkerContext): Promise<void> => {
  const {
    root,
    helperPath,
    workerProbe,
    systemRoot,
    recordHelperDiagnostic,
    sddlOf,
    interfaceAddress,
    tcpCanary,
    tcpControl,
    waitUntil,
    pause,
  } = context;
  const runtime = join(root, 'native-runtime');
  const artifacts = join(root, 'native-artifacts');
  const elsewhere = join(root, 'native-elsewhere');
  const journals = join(root, 'native-journal');
  for (const directory of [runtime, artifacts, elsewhere, journals]) {
    mkdirSync(directory, { recursive: true });
  }
  /* The helper compares the opened file's final path with the one it is given: long names, no link. */
  const runtimeRoot = realpathSync.native(runtime);
  const worker = join(runtimeRoot, 'tau-worker-probe.exe');
  copyFileSync(workerProbe, worker);
  const library = join(runtimeRoot, 'tau-probe-library.dll');
  copyFileSync(join(systemRoot, 'System32', 'version.dll'), library);
  const data = join(runtimeRoot, 'runtime-data.txt');
  const nonce = randomUUID();
  writeFileSync(data, nonce);
  const digest = `sha256:${createHash('sha256').update(readFileSync(worker)).digest('hex')}`;
  const watched = [runtimeRoot, worker, library, data, artifacts, elsewhere];
  const before = sddlOf(watched);
  const journal = join(journals, 'nw01.acl.json');
  const specOf = (overrides: Partial<WindowsLaunchSpec> = {}): WindowsLaunchSpec => ({
    version: 1,
    executable: worker,
    executableDigest: digest,
    arguments: [],
    workingDirectory: artifacts,
    environment: Object.fromEntries([['SystemRoot', systemRoot]]),
    stdio: { kind: 'pipes', input: true },
    filesystem: { readable: [runtimeRoot], writable: [artifacts], readOnly: [], denied: [] },
    journal,
    ...overrides,
  });
  const open = () => openWindowsHelperSession(helperPath, recordHelperDiagnostic);
  const first = async (session: ReturnType<typeof open>): Promise<WindowsHelperFrame> =>
    session.frame((frame) => frame.type === 'ready' || frame.type === 'refused', 60_000);
  const refusalOf = async (spec: WindowsLaunchSpec): Promise<WindowsHelperFrame> => {
    const session = open();
    session.send({ type: 'spec', spec });
    const frame = await first(session);
    session.end();
    await session.closed;
    return frame;
  };

  /* Refused before anything changes: no digest, the wrong digest, a writable runtime root, an unreadable one. */
  const refusals = [
    await refusalOf(specOf({ executableDigest: undefined })),
    await refusalOf(specOf({ executableDigest: `sha256:${'0'.repeat(64)}` })),
    await refusalOf(
      specOf({
        filesystem: { readable: [runtimeRoot], writable: [artifacts, runtimeRoot], readOnly: [], denied: [] },
      }),
    ),
    await refusalOf(specOf({ filesystem: { readable: [], writable: [artifacts], readOnly: [], denied: [] } })),
  ];

  assertMatches(
    refusals.map((frame) => (frame.type === 'refused' ? frame.refusal : frame)),
    [
      { status: 'unsupported', requirement: 'executable' },
      { status: 'unsupported', requirement: 'executable-digest' },
      { status: 'unsupported', requirement: 'executable' },
      { status: 'unsupported', requirement: 'executable' },
    ],
  );
  assert.equal(existsSync(journal), false);
  assert.deepEqual(sddlOf(watched), before);

  const address = interfaceAddress();
  if (address === undefined) {
    throw new Error('this host has no non-loopback IPv4 interface to place the outbound canary on.');
  }
  const [remote, loopback] = await Promise.all([tcpCanary(address), tcpCanary('127.0.0.1')]);
  try {
    /* Controls: each listener counts a client from outside the sandbox. */
    await tcpControl(address, remote.port);
    await tcpControl('127.0.0.1', loopback.port);

    assert.deepEqual([remote.connections(), loopback.connections()], [1, 1]);
    const session = open();
    session.send({ type: 'spec', spec: specOf() });
    const ready = await first(session);

    assert.equal(ready.type, 'ready', JSON.stringify(ready));
    /* The worker does not exist yet, and the helper holds its file: nobody may open it for writing. */
    assert.throws(() => {
      closeSync(openSync(worker, 'r+'));
    });
    session.send({ type: 'start' });
    const started = await session.frame(
      (frame) => frame.type === 'started' || frame.type === 'refused' || frame.type === 'cleanup-failed',
      60_000,
    );

    assert.equal(started.type, 'started', JSON.stringify(started));
    const artifact = join(artifacts, 'artifact.txt');
    const requests = [
      { op: 'echo', value: { n: 1, text: 'é☃' } },
      { op: 'read', path: data },
      { op: 'load', path: library },
      { op: 'write', path: artifact, text: nonce },
      { op: 'write', path: join(runtimeRoot, 'planted.txt'), text: 'planted' },
      { op: 'write', path: join(elsewhere, 'planted.txt'), text: 'planted' },
      { op: 'connect', address: `${address}:${String(remote.port)}` },
      { op: 'connect', address: `127.0.0.1:${String(loopback.port)}` },
      { op: 'environment' },
    ];
    const bytes = new TextEncoder().encode(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
    /* Cut inside the first line: stdin is a byte stream, not a frame stream. */
    session.send({ type: 'input', bytes: bytes.slice(0, 7) });
    session.send({ type: 'input', bytes: bytes.slice(7) });
    const answers = (): Array<Record<string, unknown>> =>
      session
        .stdout()
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.equal(await waitUntil(() => answers().length === requests.length, 30_000), true, session.stdout());
    /* Every request is answered and the worker still waits: its stdin stays open until close-input. */
    assert.equal(
      session.frames().some((frame) => frame.type === 'exit'),
      false,
    );
    session.send({ type: 'close-input' });
    const exit = await session.frame((frame) => frame.type === 'exit' || frame.type === 'cleanup-failed', 60_000);
    await session.closed;

    assert.deepEqual(exit, { type: 'exit', exit: { exitCode: 0 } });
    const replies = answers();

    assertMatches(replies, [
      { op: 'echo', ok: true, value: { n: 1, text: 'é☃' } },
      { op: 'read', ok: true, text: nonce },
      { op: 'load', ok: true },
      { op: 'write', ok: true },
      { op: 'write', ok: false },
      { op: 'write', ok: false },
      { op: 'connect', ok: false },
      { op: 'connect', ok: false },
      { op: 'environment', ok: true },
      { op: 'eof', lines: requests.length },
    ]);
    /*
     * Exactly the launch's environment: Windows needs a LOCALAPPDATA to create the AppContainer process and derives
     * the package's LOCALAPPDATA, TEMP and TMP from it, and the runner takes all of them away again before it runs.
     */
    const seen = replies[8]!['value'] as Record<string, string>;
    assert.deepEqual(
      Object.fromEntries(Object.entries(seen).filter(([name]) => !name.startsWith('='))),
      Object.fromEntries([['SystemRoot', systemRoot]]),
    );
    /* The DLL the worker loaded is the one in its runtime root. */
    assert.equal(String(replies[2]!['module']).toLowerCase(), library.toLowerCase());
    assert.equal(readFileSync(artifact, 'utf8'), nonce);
    assert.deepEqual(
      [existsSync(join(runtimeRoot, 'planted.txt')), existsSync(join(elsewhere, 'planted.txt'))],
      [false, false],
    );
    await pause(1000);
    /* The listeners are the judge: still only the controls. */
    assert.deepEqual([remote.connections(), loopback.connections()], [1, 1]);
  } finally {
    remote.server.close();
    loopback.server.close();
  }
  /* Released with the launch, restored exactly, journal gone. */
  assert.doesNotThrow(() => {
    closeSync(openSync(worker, 'r+'));
  });
  assert.deepEqual(sddlOf(watched), before);
  assert.equal(existsSync(journal), false);

  /* Without input: true, pipes are as they were: stdin is NUL, and input frames go nowhere. */
  const quiet = open();
  quiet.send({ type: 'spec', spec: specOf({ stdio: { kind: 'pipes' } }) });
  const quietReady = await first(quiet);

  assert.equal(quietReady.type, 'ready', JSON.stringify(quietReady));
  quiet.send({ type: 'start' });
  quiet.send({ type: 'input', bytes: new TextEncoder().encode(`${JSON.stringify({ op: 'echo', value: 1 })}\n`) });
  const quietExit = await quiet.frame((frame) => frame.type === 'exit' || frame.type === 'cleanup-failed', 60_000);
  await quiet.closed;

  assert.deepEqual(quietExit, { type: 'exit', exit: { exitCode: 0 } });
  assert.deepEqual(JSON.parse(quiet.stdout().trim()), { op: 'eof', lines: 0 });
  assert.deepEqual(sddlOf(watched), before);
  assert.equal(existsSync(journal), false);
};

/**
 * Run NW02: the helper runs one launch at a time on the computer (`windows-sandbox/README.md`, "Sessions"). While a
 * worker is live, a second launch is refused before anything changes and `restore` keeps the journal it is given;
 * once the first has ended and restored, the second runs, and both leave every ACL exactly as it was.
 *
 * @param context - The suite's root, helper, probe and outside observers.
 */
export const launchExclusionConformance = async (context: NativeWorkerContext): Promise<void> => {
  const { root, helperPath, workerProbe, systemRoot, recordHelperDiagnostic, sddlOf, waitUntil } = context;
  const runtime = join(root, 'exclusion-runtime');
  const firstArtifacts = join(root, 'exclusion-first');
  const secondArtifacts = join(root, 'exclusion-second');
  const journals = join(root, 'exclusion-journal');
  for (const directory of [runtime, firstArtifacts, secondArtifacts, journals]) {
    mkdirSync(directory, { recursive: true });
  }
  const runtimeRoot = realpathSync.native(runtime);
  const worker = join(runtimeRoot, 'tau-worker-probe.exe');
  copyFileSync(workerProbe, worker);
  const digest = `sha256:${createHash('sha256').update(readFileSync(worker)).digest('hex')}`;
  const watched = [runtimeRoot, worker, firstArtifacts, secondArtifacts];
  const before = sddlOf(watched);
  const specOf = (artifacts: string, journal: string): WindowsLaunchSpec => ({
    version: 1,
    executable: worker,
    executableDigest: digest,
    arguments: [],
    workingDirectory: artifacts,
    environment: Object.fromEntries([['SystemRoot', systemRoot]]),
    stdio: { kind: 'pipes', input: true },
    filesystem: { readable: [runtimeRoot], writable: [artifacts], readOnly: [], denied: [] },
    journal,
  });
  const firstJournal = join(journals, 'first.acl.json');
  const secondJournal = join(journals, 'second.acl.json');
  const open = () => openWindowsHelperSession(helperPath, recordHelperDiagnostic);
  const settled = (frame: WindowsHelperFrame): boolean =>
    frame.type === 'ready' || frame.type === 'refused' || frame.type === 'cleanup-failed';
  const ended = (frame: WindowsHelperFrame): boolean => frame.type === 'exit' || frame.type === 'cleanup-failed';

  const first = open();
  first.send({ type: 'spec', spec: specOf(firstArtifacts, firstJournal) });
  const firstReady = await first.frame(settled, 60_000);

  assert.equal(firstReady.type, 'ready', JSON.stringify(firstReady));
  first.send({ type: 'start' });
  const firstStarted = await first.frame((frame) => frame.type === 'started' || ended(frame), 60_000);

  assert.equal(firstStarted.type, 'started', JSON.stringify(firstStarted));
  /* The first worker is live: its journal exists and its grant is on its folder. */
  assert.equal(existsSync(firstJournal), true);
  assert.notEqual(sddlOf([firstArtifacts])[firstArtifacts], before[firstArtifacts]);

  const secondSddl = sddlOf([secondArtifacts]);
  const refused = open();
  refused.send({ type: 'spec', spec: specOf(secondArtifacts, secondJournal) });
  const refusal = await refused.frame(settled, 60_000);
  refused.end();
  await refused.closed;

  assert.equal(refusal.type, 'refused', JSON.stringify(refusal));
  /* Machine-readable: a host matches the requirement, never the message. */
  assert.equal(refusal.refusal.status, 'sandbox-unavailable');
  assert.equal(refusal.refusal.requirement, windowsExclusiveLaunchRequirement);
  /* Refused before anything changed. */
  assert.equal(existsSync(secondJournal), false);
  assert.deepEqual(sddlOf([secondArtifacts]), secondSddl);

  /* `restore` waits for no one either: it keeps a journal while a launch is live. Its content is never read. */
  const stray = join(journals, 'stray.acl.json');
  writeFileSync(stray, '');
  const restore = spawnSync(helperPath, ['restore', '--journal', stray], { encoding: 'utf8', windowsHide: true });
  for (const line of restore.stderr.split(/\r?\n/u).filter((text) => text !== '')) {
    recordHelperDiagnostic(line);
  }

  assert.equal(restore.status, 1, restore.stdout);
  assert.equal((JSON.parse(restore.stdout) as { requirement?: string }).requirement, windowsExclusiveLaunchRequirement);
  assert.equal(existsSync(stray), true);
  rmSync(stray);

  /* The first worker is unaffected, and its end releases the computer: restored, journal gone. */
  first.send({ type: 'input', bytes: new TextEncoder().encode(`${JSON.stringify({ op: 'echo', value: 1 })}\n`) });
  assert.equal(await waitUntil(() => first.stdout().includes('"op":"echo"'), 30_000), true, first.stdout());
  first.send({ type: 'close-input' });
  const firstExit = await first.frame(ended, 60_000);

  assert.deepEqual(firstExit, { type: 'exit', exit: { exitCode: 0 } });
  assert.equal(existsSync(firstJournal), false);
  assert.deepEqual(sddlOf(watched), before);

  /* Taken at once on `exit`, before the first helper has even ended: it released the computer before that frame. */
  const second = open();
  second.send({ type: 'spec', spec: specOf(secondArtifacts, secondJournal) });
  const secondReady = await second.frame(settled, 60_000);

  assert.equal(secondReady.type, 'ready', JSON.stringify(secondReady));
  await first.closed;
  second.send({ type: 'start' });
  second.send({ type: 'close-input' });
  const secondExit = await second.frame(ended, 60_000);
  await second.closed;

  assert.deepEqual(secondExit, { type: 'exit', exit: { exitCode: 0 } });
  assert.deepEqual(JSON.parse(second.stdout().trim()), { op: 'eof', lines: 0 });
  assert.equal(existsSync(secondJournal), false);
  assert.deepEqual(sddlOf(watched), before);
};

/** The person's GUI session as a process of theirs sees it: what every launch must leave unchanged. */
export type PersonSession = Readonly<{
  /** The window station's DACL, as SDDL. */
  station: string;
  /** The thread desktop's DACL, as SDDL. */
  desktop: string;
  /** Whether the process could create a window on that desktop. */
  window: boolean;
  windowError?: string | undefined;
  /** Each fixed volume's root folder and its DACL, as SDDL: `setup` grants the volume capability there; no launch may. */
  volumes: Readonly<Record<string, string>>;
}>;

/**
 * Start the probe as the person, outside any sandbox, and read their session: the window station's and desktop's DACLs,
 * whether a window can be created, and every fixed volume root's DACL. Starting it at all proves `user32` still initialises for a new process of
 * theirs; a window station that no longer admits them ends it with `STATUS_DLL_INIT_FAILED` before it answers.
 *
 * @param workerProbe - The built probe.
 * @returns The session as the probe read it.
 */
export const personSession = (workerProbe: string): PersonSession => {
  const run = spawnSync(workerProbe, [], { input: '{"op":"session"}\n', encoding: 'utf8', timeout: 30_000 });
  const reply = run.stdout.split('\n')[0] ?? '';
  assert.ok(
    run.status === 0 && reply.startsWith('{'),
    `a process of the person's could not start or answer (status ${String(run.status)}, ${String(run.error)}): ${run.stderr}`,
  );
  const answer = JSON.parse(reply) as { ok: boolean; error?: string; value?: PersonSession };
  assert.ok(answer.ok && answer.value !== undefined, answer.error);
  return answer.value;
};

/**
 * W09: the helper's `status`, quick and full, started from a PowerShell that removed `SystemDrive`, `SystemRoot`,
 * `windir`, `ProgramData` and `ALLUSERSPROFILE` from its own environment (Node's spawn would copy `SystemDrive` and
 * `SystemRoot` back from this process). Both must read the install record: the helper completes the system variables
 * Windows expands for the ProgramData known folder from the Windows directory itself.
 *
 * @param shellPath - The PowerShell that starts the helper.
 * @param helperPath - The helper.
 * @param accountSid - The sandbox account the install record names, from the suite's own `status`.
 */
export const statusWithoutSystemEnvironment = (shellPath: string, helperPath: string, accountSid: unknown): void => {
  const script = [
    "foreach ($name in 'SystemDrive', 'SystemRoot', 'windir', 'ProgramData', 'ALLUSERSPROFILE') { Remove-Item -LiteralPath \"Env:$name\" -ErrorAction SilentlyContinue }",
    '$quick = & $env:CONFORMANCE_HELPER status --quick 2>&1 | Out-String',
    '$full = & $env:CONFORMANCE_HELPER status 2>$null | Out-String',
    '@{ quick = $quick; full = $full } | ConvertTo-Json -Compress',
  ].join('\n');
  const run = spawnSync(shellPath, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
    env: { ...process.env, CONFORMANCE_HELPER: helperPath },
    timeout: 60_000,
  });
  assert.equal(run.status, 0, run.stderr);
  const answers = JSON.parse(run.stdout) as { quick: string; full: string };
  for (const answer of [answers.quick, answers.full]) {
    assert.doesNotMatch(answer, /SHGetKnownFolderPath/u);
    const record = JSON.parse(answer.trim()) as Record<string, unknown>;
    assert.equal(record['installed'], true, answer);
    assert.equal(record['accountSid'], accountSid, answer);
  }
};
