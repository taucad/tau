// A runtime child under the daemon's permission flags that asks its daemon for native workers (D37, North Star S2).
// argv[2] is the proof file and argv[3] a JSON list of `{ name, launch }`; a launch's workspace and artifact paths
// that start with `<private>` are made inside this child's own temp directory first. Each worker is read to its end
// after one line is written to its stdin. The proof records the child's flags, its own spawn refusal, the `native`
// composition its start frame carried, and each launch's outcome.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { createRuntimeChildWorkerLauncher } = await import('../runtime-child-workers.ts');

const [outputPath = '', requests] = process.argv.slice(2);
const launcher = createRuntimeChildWorkerLauncher();

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
      outcomes,
    }),
  );
  process.send?.({ type: 'ready', url: 'ws://127.0.0.1:9', runtimeVersion: 'native-broker' });
});
