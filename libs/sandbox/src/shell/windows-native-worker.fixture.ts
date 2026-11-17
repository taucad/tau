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
  writeFileSync,
} from 'node:fs';
import assert from 'node:assert/strict';
import type { Server } from 'node:net';
import { join } from 'node:path';

import { openWindowsHelperSession } from '#shell/windows-helper-session.fixture.js';
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
      { op: 'eof', lines: requests.length },
    ]);
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
