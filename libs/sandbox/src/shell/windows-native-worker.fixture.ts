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
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import type { Server } from 'node:net';
import { join } from 'node:path';

import { openWindowsHelperSession } from '#shell/windows-helper-session.fixture.js';
import type { WindowsHelperSession } from '#shell/windows-helper-session.fixture.js';
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

/** One worker of the concurrency rows: its own folders beside the shared runtime root, and its live session. */
type Worker = Readonly<{
  name: string;
  secret: string;
  nonce: string;
  artifacts: string;
  journal: string;
  session: WindowsHelperSession;
}>;

/** The shared setup of NW02-NW05: one runtime root every worker reads, holding the probe and a data file. */
const concurrencySetup = (context: NativeWorkerContext, row: string) => {
  const { root, helperPath, workerProbe, systemRoot, recordHelperDiagnostic, waitUntil } = context;
  const base = join(root, row);
  const runtime = join(base, 'runtime');
  const journals = join(base, 'journals');
  for (const directory of [runtime, journals]) {
    mkdirSync(directory, { recursive: true });
  }
  const runtimeRoot = realpathSync.native(runtime);
  const worker = join(runtimeRoot, 'tau-worker-probe.exe');
  copyFileSync(workerProbe, worker);
  const data = join(runtimeRoot, 'runtime-data.txt');
  const shared = randomUUID();
  writeFileSync(data, shared);
  const digest = `sha256:${createHash('sha256').update(readFileSync(worker)).digest('hex')}`;
  const watched: string[] = [runtimeRoot, worker, data];
  const folders = (name: string) => {
    const made = (folder: string): string => {
      mkdirSync(folder, { recursive: true });
      return realpathSync.native(folder);
    };
    const own = made(join(base, `${name}-private`));
    const artifacts = made(join(base, `${name}-artifacts`));
    const secret = join(own, 'secret.txt');
    const nonce = randomUUID();
    writeFileSync(secret, nonce);
    watched.push(own, secret, artifacts);
    return { own, artifacts, secret, nonce };
  };
  /**
   * Start a worker that reads the runtime root and its own folder and writes its own artifacts; `started` awaited.
   * `options.denied` adds denied paths, and `options.journal` puts the journal somewhere other than `journals`.
   */
  const start = async (
    name: string,
    made: ReturnType<typeof folders>,
    options: { denied?: string[]; journal?: string } = {},
  ): Promise<Worker> => {
    const session = launch(name, made, options);
    const ready = await session.frame((frame) => frame.type !== 'stderr' && frame.type !== 'stdout', 60_000);

    assert.equal(ready.type, 'ready', JSON.stringify(ready));
    session.send({ type: 'start' });
    const started = await session.frame(
      (frame) =>
        frame.type === 'started' ||
        frame.type === 'exit' ||
        frame.type === 'refused' ||
        frame.type === 'cleanup-failed',
      60_000,
    );

    assert.equal(started.type, 'started', JSON.stringify(started));
    const journal = options.journal ?? join(journals, `${name}.acl.json`);
    assert.equal(existsSync(journal), true);
    return { name, secret: made.secret, nonce: made.nonce, artifacts: made.artifacts, journal, session };
  };
  /** Open a helper session and send the spec. */
  const launch = (name: string, made: ReturnType<typeof folders>, options: { denied?: string[]; journal?: string }) => {
    const journal = options.journal ?? join(journals, `${name}.acl.json`);
    const session = openWindowsHelperSession(helperPath, recordHelperDiagnostic);
    session.send({
      type: 'spec',
      spec: {
        version: 1,
        executable: worker,
        executableDigest: digest,
        arguments: [],
        workingDirectory: made.artifacts,
        environment: Object.fromEntries([['SystemRoot', systemRoot]]),
        stdio: { kind: 'pipes', input: true },
        filesystem: {
          readable: [runtimeRoot, made.own],
          writable: [made.artifacts],
          readOnly: [],
          denied: options.denied ?? [],
        },
        journal,
      },
    });
    return session;
  };
  /** A worker that must be refused before it is ready, so before anything changes; returns the refusal's text. */
  const refuse = async (
    name: string,
    made: ReturnType<typeof folders>,
    options: { denied?: string[]; journal?: string },
  ): Promise<string> => {
    const session = launch(name, made, options);
    const refused = await session.frame((frame) => frame.type !== 'stderr' && frame.type !== 'stdout', 60_000);
    await session.closed;

    assert.equal(refused.type, 'refused', JSON.stringify(refused));
    return JSON.stringify(refused);
  };
  /** Send requests and wait for exactly their answers (after every earlier one). */
  const ask = async (
    worker_: Worker,
    requests: ReadonlyArray<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> => {
    const answers = (): Array<Record<string, unknown>> =>
      worker_.session
        .stdout()
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    const before = answers().length;
    worker_.session.send({
      type: 'input',
      bytes: new TextEncoder().encode(requests.map((request) => `${JSON.stringify(request)}\n`).join('')),
    });
    assert.equal(
      await waitUntil(() => answers().length >= before + requests.length, 30_000),
      true,
      worker_.session.stdout(),
    );
    return answers().slice(before, before + requests.length);
  };
  /** What a worker can read: its own secret and the shared data, never the other's secret or artifacts. */
  const isolated = async (self: Worker, other: Worker): Promise<void> => {
    assertMatches(
      await ask(self, [
        { op: 'read', path: self.secret },
        { op: 'read', path: data },
        { op: 'read', path: other.secret },
        { op: 'write', path: join(other.artifacts, `${self.name}.txt`), text: 'planted' },
        { op: 'write', path: join(self.artifacts, `${self.name}.txt`), text: self.nonce },
      ]),
      [
        { op: 'read', ok: true, text: self.nonce },
        { op: 'read', ok: true, text: shared },
        { op: 'read', ok: false },
        { op: 'write', ok: false },
        { op: 'write', ok: true },
      ],
    );
  };
  /** End a worker on close-input: it exits 0 with everything restored and its journal gone. */
  const finish = async (worker_: Worker): Promise<void> => {
    worker_.session.send({ type: 'close-input' });
    const exit = await worker_.session.frame(
      (frame) => frame.type === 'exit' || frame.type === 'cleanup-failed',
      60_000,
    );
    await worker_.session.closed;

    assert.deepEqual(exit, { type: 'exit', exit: { exitCode: 0 } });
    assert.equal(existsSync(worker_.journal), false);
  };
  return { base, runtimeRoot, data, shared, watched, folders, start, refuse, ask, isolated, finish };
};

/**
 * Run NW02 or NW03: two workers live at once over one shared runtime root, each with a folder of its own. Neither
 * reads the other's folder or writes the other's artifacts; when one ends, the other keeps every grant it had (it
 * still reads the runtime root and its own folder) while the first's own folders are back exactly as they were; when
 * both have ended, every path is exactly as before either started, whichever ended first.
 *
 * @param context - The suite's root, helper, probe and outside observers.
 * @param order - Which worker ends first.
 */
export const concurrentWorkersConformance = async (
  context: NativeWorkerContext,
  order: 'first-ends-first' | 'second-ends-first',
): Promise<void> => {
  const { sddlOf, workerProbe } = context;
  const row = order === 'first-ends-first' ? 'nw02' : 'nw03';
  const setup = concurrencySetup(context, row);
  const madeA = setup.folders('a');
  const madeB = setup.folders('b');
  const before = sddlOf(setup.watched);
  const session = personSession(workerProbe);
  const a = await setup.start('a', madeA);
  const b = await setup.start('b', madeB);
  await setup.isolated(a, b);
  await setup.isolated(b, a);
  /* Live launches leave the person's session alone too: Tau's GPU process restarts while its workers run. */
  assert.deepEqual(personSession(workerProbe), session);

  const [ending, staying] = order === 'first-ends-first' ? [a, b] : [b, a];
  const [endingMade, stayingMade] = order === 'first-ends-first' ? [madeA, madeB] : [madeB, madeA];
  await setup.finish(ending);
  /* The ending worker's own folders are exactly as before; the staying one's grants and the shared root's are intact. */
  const ownPaths = [endingMade.own, endingMade.secret, endingMade.artifacts];
  assert.deepEqual(sddlOf(ownPaths), Object.fromEntries(ownPaths.map((path) => [path, before[path]])));
  assert.notDeepEqual(sddlOf([setup.runtimeRoot]), { [setup.runtimeRoot]: before[setup.runtimeRoot] });
  assertMatches(
    await setup.ask(staying, [
      { op: 'read', path: setup.data },
      { op: 'read', path: staying.secret },
      { op: 'write', path: join(stayingMade.artifacts, 'after.txt'), text: 'after' },
    ]),
    [
      { op: 'read', ok: true, text: setup.shared },
      { op: 'read', ok: true, text: staying.nonce },
      { op: 'write', ok: true },
    ],
  );
  await setup.finish(staying);

  assert.deepEqual(sddlOf(setup.watched), before);
};

/**
 * Run NW04: crash recovery beside a live launch. A worker is killed with its launcher, leaving its journal and its
 * grants; `restore` refuses the live worker's journal, then restores the dead one's while the live worker runs. The
 * dead worker's folders come back exactly, the live worker keeps every grant (the shared runtime root included), and
 * once it ends every path is exactly as before.
 *
 * @param context - The suite's root, helper, probe and outside observers.
 */
export const crashRecoveryConformance = async (context: NativeWorkerContext): Promise<void> => {
  const { helperPath, recordHelperDiagnostic, sddlOf, workerProbe } = context;
  const setup = concurrencySetup(context, 'nw04');
  const madeLive = setup.folders('live');
  const madeDead = setup.folders('dead');
  const before = sddlOf(setup.watched);
  const session = personSession(workerProbe);
  const live = await setup.start('live', madeLive);
  const dead = await setup.start('dead', madeDead);
  await setup.isolated(dead, live);
  assert.deepEqual(personSession(workerProbe), session);

  dead.session.kill();
  await dead.session.closed;
  assert.equal(existsSync(dead.journal), true);
  const restore = (journal: string) => {
    const result = spawnSync(helperPath, ['restore', '--journal', journal], { encoding: 'utf8', windowsHide: true });
    for (const line of result.stderr.split(/\r?\n/u).filter((text) => text !== '')) {
      recordHelperDiagnostic(line);
    }
    return result;
  };
  /* A live launch's journal is never restored from outside it. */
  const refused = restore(live.journal);

  assert.equal(refused.status, 1, refused.stdout);
  assert.equal(existsSync(live.journal), true);
  const restored = restore(dead.journal);

  assert.equal(restored.status, 0, `${restored.stdout}${restored.stderr}`);
  assert.equal(existsSync(dead.journal), false);
  const deadPaths = [madeDead.own, madeDead.secret, madeDead.artifacts];
  assert.deepEqual(sddlOf(deadPaths), Object.fromEntries(deadPaths.map((path) => [path, before[path]])));
  /* A launch killed with its launcher leaves nothing in the person's session either, before or after its restore. */
  assert.deepEqual(personSession(workerProbe), session);
  assertMatches(
    await setup.ask(live, [
      { op: 'read', path: setup.data },
      { op: 'read', path: live.secret },
      { op: 'read', path: dead.secret },
    ]),
    [
      { op: 'read', ok: true, text: setup.shared },
      { op: 'read', ok: true, text: live.nonce },
      { op: 'read', ok: false },
    ],
  );
  await setup.finish(live);

  assert.deepEqual(sddlOf(setup.watched), before);
};

/**
 * Run NW05: a launch's journal inside another live launch's denied path. Tau keeps a native worker's journals under its
 * user data, which a shell launch denies; the worker still starts, the denying launch's worker cannot read its
 * journal, and either exit order leaves every path as before. A journal inside a path another live launch grants is
 * refused before anything changes, since that launch's worker could rewrite it.
 *
 * @param context - The suite's root, helper, probe and outside observers.
 */
export const journalUnderDenialConformance = async (context: NativeWorkerContext): Promise<void> => {
  const { sddlOf, workerProbe } = context;
  const setup = concurrencySetup(context, 'nw05');
  const madeA = setup.folders('a');
  const madeB = setup.folders('b');
  const madeC = setup.folders('c');
  mkdirSync(join(setup.base, 'state'), { recursive: true });
  const state = realpathSync.native(join(setup.base, 'state'));
  const watched = [...setup.watched, state];
  const before = sddlOf(watched);
  const session = personSession(workerProbe);
  const a = await setup.start('a', madeA, { denied: [state] });
  const b = await setup.start('b', madeB, { journal: join(state, 'b.acl.json') });

  assertMatches(await setup.ask(a, [{ op: 'read', path: b.journal }]), [{ op: 'read', ok: false }]);
  const refused = await setup.refuse('c', madeC, { journal: join(madeA.own, 'c.acl.json') });

  assert.match(refused, /journal lies inside a path another running or unrestored launch grants/u);
  assert.equal(existsSync(join(madeA.own, 'c.acl.json')), false);
  assert.deepEqual(personSession(workerProbe), session);
  await setup.finish(a);
  assertMatches(await setup.ask(b, [{ op: 'read', path: b.secret }]), [{ op: 'read', ok: true, text: b.nonce }]);
  await setup.finish(b);

  assert.deepEqual(sddlOf(watched), before);
};

/**
 * The WIN-X64 native-worker rows, as `[id, title, body]`, for the conformance suite to register.
 *
 * @param context - Builds the suite's context when a row runs (its root exists only then).
 * @returns NW01-NW05.
 */
export const nativeWorkerRows = (
  context: () => NativeWorkerContext,
): ReadonlyArray<readonly [string, string, () => Promise<void>]> => [
  [
    'NW01',
    'a native worker outside Program Files runs pinned to its digest, loads from its unwritable runtime root, writes only its artifacts, has no network and reads stdin to close-input',
    async () => nativeWorkerConformance(context()),
  ],
  [
    'NW02',
    'two concurrent workers over one shared runtime root cannot read each other, and the first to end leaves the other every grant',
    async () => concurrentWorkersConformance(context(), 'first-ends-first'),
  ],
  [
    'NW03',
    'the same two workers ending in the other order leave every path exactly as before both',
    async () => concurrentWorkersConformance(context(), 'second-ends-first'),
  ],
  [
    'NW04',
    'a crashed worker is restored by restore while another worker over the same runtime root stays live and keeps its grants',
    async () => crashRecoveryConformance(context()),
  ],
  [
    'NW05',
    "a worker's journal inside another live worker's denied path starts and restores in either order; inside a granted one it is refused",
    async () => journalUnderDenialConformance(context()),
  ],
];

/** The person's GUI session as a process of theirs sees it: what every launch must leave unchanged. */
export type PersonSession = Readonly<{
  /** The window station's DACL, as SDDL. */
  station: string;
  /** The thread desktop's DACL, as SDDL. */
  desktop: string;
  /** Whether the process could create a window on that desktop. */
  window: boolean;
  windowError?: string | undefined;
  /**
   * What a Chromium-style child makes of the session: started by the person under a restricted, Low-integrity token
   * in a job, on an alternate desktop the person created on the station, it creates a window and exits `0x00000000`.
   * `stage` names the step that failed otherwise.
   */
  restrictedChild: Readonly<{ stage: string; exitCode?: string; error?: string }>;
  /** The person's temporary folder and its DACL and mandatory label, as SDDL. */
  temporaryFolder: Readonly<{ path: string; sddl: string }>;
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
