/**
 * Every `pnpm nx` call in a job that ran setup-nx goes through this guard (`node_modules/.bin/nx` is replaced by a
 * shim that execs it). It does two things and passes every other exit status through unchanged:
 *
 * 1. Nx 22.7.1 still segfaults now and then about two seconds into a command, before it prints or runs anything
 *    (SIGSEGV with and without the PTY runner, Node 24.10 and 24.20; no local repro). The command is rerun once.
 * 2. Nx's self-hosted remote cache client fails the whole command on any answer it does not expect: an unreachable
 *    server, a 5xx, or a 413 from the Cloudflare edge for an entry over the Workers body limit (Nx 22.7.12,
 *    `http_remote_cache.rs`). A cache fault must never fail a build (tau-cloud `tau-ci-cache`), so when the remote
 *    cache is on and the command fails with one of Nx's remote cache errors, it is rerun once with the remote cache
 *    off. Tasks that already succeeded replay from the local cache.
 *
 * Output is piped and scanned only while the remote cache is on; otherwise Nx inherits the terminal as before.
 */
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import process from 'node:process';

type Outcome = { code: number | undefined; signal: NodeJS.Signals | undefined; matched: boolean };

const [realNx = 'nx', ...args] = process.argv.slice(2);
const cacheServer = 'NX_SELF_HOSTED_REMOTE_CACHE_SERVER';
// Nx's HttpRemoteCacheErrors (`errors.rs`), plus the cache Worker's 401 text.
const remoteCacheError =
  /Misconfigured remote cache endpoint: |Failed to send request: |Unauthorized: missing or invalid token/;
const forwarded: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const run = async (env: NodeJS.ProcessEnv, scan: boolean): Promise<Outcome> =>
  new Promise((resolve) => {
    const child = spawn(realNx, args, { env, stdio: scan ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
    const relays = forwarded.map((signal) => {
      const relay = (): void => {
        child.kill(signal);
      };
      process.on(signal, relay);
      return { signal, relay };
    });
    let matched = false;
    const watch = (source: NodeJS.ReadableStream | undefined, sink: NodeJS.WriteStream): void => {
      let tail = '';
      const decoder = new TextDecoder();
      source?.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        sink.write(chunk);
        if (!matched) {
          const window = `${tail}${decoder.decode(chunk, { stream: true })}`;
          matched = remoteCacheError.test(window);
          tail = window.slice(-256);
        }
      });
    };
    if (scan) {
      watch(child.stdout ?? undefined, process.stdout);
      watch(child.stderr ?? undefined, process.stderr);
    }
    child.on('error', (error) => {
      console.error(`nx-guard: could not start ${realNx}: ${error.message}`);
      resolve({ code: 127, signal: undefined, matched: false });
    });
    child.on('close', (code, signal) => {
      for (const { signal: name, relay } of relays) {
        process.off(name, relay);
      }
      resolve({ code: code ?? undefined, signal: signal ?? undefined, matched });
    });
  });

const warn = (title: string, message: string): void => {
  console.error(`::warning title=${title}::${message}`);
};

const runOnceMoreOnSegfault = async (env: NodeJS.ProcessEnv, scan: boolean): Promise<Outcome> => {
  const first = await run(env, scan);
  if (first.signal !== 'SIGSEGV') {
    return first;
  }
  warn('Nx segfault', `Nx was killed by SIGSEGV; rerunning: nx ${args.join(' ')}`);
  return run(env, scan);
};

const cacheOn = Boolean(process.env[cacheServer]);
let result = await runOnceMoreOnSegfault(process.env, cacheOn);

if (cacheOn && result.code !== 0 && result.matched) {
  warn(
    'Nx remote cache unavailable',
    `nx ${args.join(' ')} failed on a remote cache error; rerunning once with the remote cache off`,
  );
  result = await runOnceMoreOnSegfault({ ...process.env, [cacheServer]: '' }, false);
}

process.exitCode = result.signal ? 128 + constants.signals[result.signal] : (result.code ?? 1);
