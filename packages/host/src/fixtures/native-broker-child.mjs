// A runtime child under the daemon's permission flags that asks its daemon for native workers (D37, North Star S2).
// argv[2] is the proof file, argv[3] a JSON list of `{ name, launch }` and argv[4] how many closure requests to send
// first (default one); a launch's workspace and artifact paths that start with `<private>` are made inside this
// child's own temp directory first. Each worker is read to its end after one line is written to its stdin. The proof
// records the child's flags, its own spawn refusal, the `native` flag its start frame carried, the daemon's answer
// frame to each closure request, and each launch's outcome.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { createRuntimeChildWorkerLauncher } = await import('../runtime-child-workers.ts');

const [outputPath = '', requests, inspections = '1'] = process.argv.slice(2);
const launcher = createRuntimeChildWorkerLauncher();

/** @type {Map<string, (answer: unknown) => void>} */
const answers = new Map();
process.on('message', (/** @type {{ type?: string; id?: string } | undefined} */ message) => {
  if (message?.type === 'native-closure:answer' && typeof message.id === 'string') {
    answers.get(message.id)?.(message);
  }
});

/** Ask the daemon for one kernel's closure, as a native kernel binding in this child does. */
const inspect = async (/** @type {number} */ index) => {
  const id = `closure-${String(index)}`;
  const answered = new Promise((resolve) => {
    answers.set(id, resolve);
  });
  process.send?.({
    type: 'native-closure:inspect',
    id,
    request: {
      package: '@acme/fixture',
      kernel: 'fixture',
      dependencies: ['runtime'],
      manifest: { schemaVersion: 1 },
      packageRoot: 'file:///fixture/',
    },
  });
  const { type: _type, id: _id, ...answer } = /** @type {Record<string, unknown>} */ (await answered);
  return answer;
};

/** Whether the child may spawn: the existing child's grants refuse it. */
const ownSpawn = () => {
  const childProcess = /** @type {typeof import('node:child_process')} */ (process.getBuiltinModule('child_process'));
  try {
    childProcess.execFileSync('/bin/sh', ['-c', 'true']);
    return 'spawned';
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : String(error);
  }
};

/** Run one launch, whose `<private>` paths land in this child's own directory, to its end, or record its refusal. */
const attempt = async (/** @type {import('../runtime-child-supervisor.ts').RuntimeChildWorkerLaunch} */ launch) => {
  const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mirror-')));
  const place = (/** @type {string} */ path) =>
    path.startsWith('<private>') ? join(privateRoot, path.slice('<private>'.length)) : path;
  const workspacePath = place(launch.workspacePath);
  const artifactPath = place(launch.artifactPath);
  for (const path of [workspacePath, artifactPath]) {
    if (path.startsWith(privateRoot)) {
      mkdirSync(path, { recursive: true });
    }
  }
  try {
    const worker = await launcher({ ...launch, workspacePath, artifactPath });
    let stdout = '';
    worker.stdout.on('data', (chunk) => {
      stdout += Buffer.from(chunk).toString('utf8');
    });
    worker.stdin.end('echoed through the daemon\n');
    const end = await worker.ended;
    return { started: true, stdout, end };
  } catch (error) {
    return { started: false, refusal: error instanceof Error ? error.message : String(error) };
  }
};

process.on('message', async (/** @type {{ type?: string; native?: unknown } | undefined} */ message) => {
  if (message?.type === 'close') {
    process.exit(0);
  }
  if (message?.type !== 'start') {
    return;
  }
  process.send?.({ type: 'native-deployments', report: [{ package: '@acme/fixture' }] });
  const closures = [];
  for (let index = 0; index < Number(inspections); index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one request at a time, so each answer is its own.
    closures.push(await inspect(index));
  }
  const launches =
    /** @type {Array<{ name: string; launch: import('../runtime-child-supervisor.ts').RuntimeChildWorkerLaunch }>} */ (
      JSON.parse(requests ?? '[]')
    );
  /** @type {Record<string, unknown>} */
  const outcomes = {};
  for (const { name, launch } of launches) {
    // oxlint-disable-next-line no-await-in-loop -- one launch at a time, so each outcome is its own.
    outcomes[name] = await attempt(launch);
  }
  writeFileSync(
    outputPath,
    JSON.stringify({
      execArgv: process.execArgv,
      childPermission:
        /** @type {{ permission?: NodeJS.ProcessPermission }} */ (process).permission?.has('child') ??
        'no permission model',
      ownSpawn: ownSpawn(),
      native: message.native,
      closures,
      outcomes,
    }),
  );
  process.send?.({ type: 'ready', url: 'ws://127.0.0.1:9', runtimeVersion: 'native-broker' });
});
