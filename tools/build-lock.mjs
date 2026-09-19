/**
 * Serializes builds that share an output directory.
 *
 * `react-router build` deletes its whole build directory before the client
 * pass (`cleanBuildDirectory`, unconditional whenever the build directory sits
 * inside the Vite root — which it does for every `apps/ui` variant). So a
 * *stale* tree can never poison a build, but two overlapping ones destroy each
 * other: the second process's clean removes the first's `build/client`, whose
 * SSR pass then dies on a missing `.vite/manifest.json` and leaves no
 * `build/server/index.js`, or the two interleave into a tree of mixed asset
 * hashes that fails at server boot. Cleaning harder cannot fix that — the
 * cleaning *is* the collision — so the builds take turns instead.
 *
 * Overlap comes from independent `nx` invocations (two terminals, two agent
 * sessions), which no task graph dedupes, and from `build` and `build:verify`
 * sharing `apps/ui/build`.
 *
 * `mkdir` is the atomic rendezvous, the same idiom as
 * `packages/geospec-engine/src/cache/build-lock.ts`. The lock lives under
 * `node_modules/.cache` so it is neither a git-visible file nor an Nx input.
 *
 * Usage: node tools/build-lock.mjs <output-dir> -- <command...>
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const pollInterval = 500;

/** Synchronous sleep: this process has nothing to do but wait for the peer. */
function sleep(duration) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration);
}

function lockPathFor(outputDirectory) {
  const slug = resolve(outputDirectory).replaceAll(/[^a-zA-Z0-9]+/gu, '-');
  return join(import.meta.dirname, '..', 'node_modules', '.cache', 'tau-build-lock', slug);
}

function holderIsAlive(lockPath) {
  let pid;
  try {
    pid = Number(readFileSync(join(lockPath, 'pid'), 'utf8'));
  } catch {
    // ponytail: the holder won the mkdir microseconds ago and has not written
    // its pid yet, so assume alive. A holder SIGKILLed inside that window
    // leaks the lock; clear it by removing the directory named in the wait
    // message. Every other crash is reclaimed by the liveness check below.
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquire(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true });
  let announced = false;
  for (;;) {
    try {
      mkdirSync(lockPath);
      break;
    } catch {
      // Held by a live peer, or abandoned by a crashed one.
    }
    if (!holderIsAlive(lockPath)) {
      rmSync(lockPath, { recursive: true, force: true });
      continue;
    }
    if (!announced) {
      console.error(`build-lock: waiting for the build holding ${lockPath}`);
      announced = true;
    }
    sleep(pollInterval);
  }
  writeFileSync(join(lockPath, 'pid'), String(process.pid));
  // A holder killed outright leaks the directory; the liveness check above
  // reclaims it on the next build, so no signal handling is needed here.
  process.on('exit', () => {
    rmSync(lockPath, { recursive: true, force: true });
  });
}

/** Writes an enter/leave pair around a held lock, for {@link selfCheck}. */
function marker(id, log) {
  appendFileSync(log, `${id}-in\n`);
  sleep(400);
  appendFileSync(log, `${id}-out\n`);
}

/** Two contending processes must not interleave. Run: node tools/build-lock.mjs --self-check */
async function selfCheck() {
  const root = mkdtempSync(join(tmpdir(), 'build-lock-'));
  const log = join(root, 'log');
  writeFileSync(log, '');
  await Promise.all(
    ['a', 'b'].map(
      async (id) =>
        new Promise((done) => {
          const argv = [
            import.meta.filename,
            join(root, 'out'),
            '--',
            process.execPath,
            import.meta.filename,
            '--marker',
            id,
            log,
          ];
          spawn(process.execPath, argv, { stdio: 'inherit' }).on('exit', done);
        }),
    ),
  );
  const text = readFileSync(log, 'utf8');
  assert.ok(
    text === 'a-in\na-out\nb-in\nb-out\n' || text === 'b-in\nb-out\na-in\na-out\n',
    `builds interleaved: ${JSON.stringify(text)}`,
  );
  rmSync(root, { recursive: true, force: true });
  console.log('build-lock: self-check passed');
}

const argv = process.argv.slice(2);
if (argv[0] === '--self-check') {
  await selfCheck();
} else if (argv[0] === '--marker') {
  marker(argv[1], argv[2]);
} else {
  const separator = argv.indexOf('--');
  if (separator < 1 || argv[0] === undefined) {
    console.error('usage: node tools/build-lock.mjs <output-dir> -- <command...>');
    process.exit(2);
  }
  acquire(lockPathFor(argv[0]));
  const { status } = spawnSync(argv.slice(separator + 1).join(' '), { shell: true, stdio: 'inherit' });
  process.exit(status ?? 1);
}
