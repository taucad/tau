// @vitest-environment node
/**
 * The shared spawn seam against the real operating-system sandbox.
 *
 * A Node script stands in for a native worker so the proof needs no kernel payload:
 * it answers one request with the outcome of each escape attempt. Runs only where the
 * platform sandbox and its dependencies are present; the product itself fails closed
 * on such a host, so a skip here never hides a broken boundary in a packaged build.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { createMockLogger } from '@taucad/runtime-testing';
import { describe, expect, it } from 'vitest';

import { launchInNativeSandbox, NativeProcessSession, nativeSandboxPolicy } from '#index.js';

const writeRuleBlocks = /\((allow|deny) file-write\*\n((?:\s+\((?:subpath|literal) "[^"]*"\)\n)+)/g;

/**
 * Decide one path's write access against the emitted macOS sandbox profile, the way the kernel does.
 *
 * SBPL is last-match-wins, so a rule block's position decides the outcome. Reading the input
 * configuration back would prove nothing: the runtime unions its own broad defaults into what the
 * kernel is finally handed.
 *
 * @param profile - SBPL text extracted from the launch vector.
 * @param path - Absolute path to decide.
 * @returns The effect of the last matching block, or `unmatched` when no block names the path.
 */
const emittedWriteVerdict = (profile: string, path: string): 'allow' | 'deny' | 'unmatched' => {
  let verdict: 'allow' | 'deny' | 'unmatched' = 'unmatched';
  for (const [, effect, entries] of profile.matchAll(writeRuleBlocks)) {
    for (const [, subject] of entries!.matchAll(/"([^"]*)"/g)) {
      if (path === subject || path.startsWith(`${subject!}/`)) {
        verdict = effect as 'allow' | 'deny';
      }
    }
  }
  return verdict;
};

const sandboxAvailable =
  (process.platform === 'darwin' || process.platform === 'linux') &&
  SandboxManager.checkDependencies().errors.length === 0;

type Outcomes = Record<
  | 'home_read'
  | 'temp_read'
  | 'outside_write'
  | 'home_write'
  | 'shared_temp_write'
  | 'debug_log_write'
  | 'socket'
  | 'child_read'
  | 'artifact_write'
  | 'home',
  string
>;
const denied = ['EPERM', 'EACCES'];

const worker = (
  paths: Record<
    'homeCanary' | 'tempCanary' | 'outsideEscape' | 'homeEscape' | 'sharedTempEscape' | 'debugLogEscape',
    string
  >,
): string => `
const fs = require('node:fs');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const probe = (action) => { try { action(); return 'allowed'; } catch (error) { return error.code ?? error.name; } };
const connect = () => new Promise((resolve) => {
  const socket = net.connect({ host: '1.1.1.1', port: 53, timeout: 5000 });
  socket.once('connect', () => { socket.destroy(); resolve('allowed'); });
  socket.once('error', (error) => resolve(error.code ?? error.name));
  socket.once('timeout', () => { socket.destroy(); resolve('ETIMEDOUT'); });
});
const outcomes = async () => ({
  home_read: probe(() => fs.readFileSync(${JSON.stringify(paths.homeCanary)})),
  temp_read: probe(() => fs.readFileSync(${JSON.stringify(paths.tempCanary)})),
  outside_write: probe(() => fs.writeFileSync(${JSON.stringify(paths.outsideEscape)}, 'escaped')),
  home_write: probe(() => fs.writeFileSync(${JSON.stringify(paths.homeEscape)}, 'escaped')),
  shared_temp_write: probe(() => fs.writeFileSync(${JSON.stringify(paths.sharedTempEscape)}, 'escaped')),
  debug_log_write: probe(() => fs.writeFileSync(${JSON.stringify(paths.debugLogEscape)}, 'escaped')),
  socket: await connect(),
  child_read: 'exit:' + String(spawnSync('/bin/cat', [${JSON.stringify(paths.homeCanary)}]).status),
  artifact_write: probe(() => fs.writeFileSync(process.env.TMPDIR + '/probe.txt', 'ok')),
  home: process.env.HOME,
});
process.stdout.write('{"protocolVersion":1,"type":"ready"}\\n');
process.stdin.once('data', async (line) => {
  const request = JSON.parse(String(line));
  const result = await outcomes();
  process.stdout.write(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, result }) + '\\n');
});
setInterval(() => {}, 1000);
`;

// A runner that claims to be CI must actually have the sandbox; skipping there would hide a broken boundary.
describe.skipIf(!sandboxAvailable && process.env['CI'] === undefined)('native sandbox seam', () => {
  it('should contain a worker to its runtime, workspace, and private artifact root', async () => {
    const id = randomUUID();
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-native-sandbox-')));
    const workspacePath = join(root, 'workspace');
    const artifactPath = join(root, 'artifacts');
    mkdirSync(workspacePath);
    mkdirSync(artifactPath);
    const paths = {
      homeCanary: join(homedir(), `.tau-sandbox-canary-${id}`),
      tempCanary: join(tmpdir(), `tau-sandbox-canary-${id}`),
      outsideEscape: `/tmp/tau-sandbox-escape-${id}`,
      homeEscape: join(homedir(), `tau-sandbox-escape-${id}`),
      // The sandbox runtime grants these two by default; they must be denied back off. Their parents
      // are created here so a missing directory cannot pass the probe as ENOENT instead of EPERM.
      sharedTempEscape: join('/tmp/claude', `tau-sandbox-escape-${id}`),
      debugLogEscape: join(homedir(), '.claude/debug', `tau-sandbox-escape-${id}`),
    };
    mkdirSync(dirname(paths.sharedTempEscape), { recursive: true });
    mkdirSync(dirname(paths.debugLogEscape), { recursive: true });
    writeFileSync(paths.homeCanary, 'secret');
    writeFileSync(paths.tempCanary, 'secret');
    const workerPath = join(workspacePath, 'worker.cjs');
    writeFileSync(workerPath, worker(paths));
    const session = new NativeProcessSession<{ readonly message: string }>({
      executablePath: process.execPath,
      executableSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
      arguments: [workerPath],
      runtimePath: dirname(process.execPath),
      workspacePath,
      artifactPath,
      resources: [],
      protocolVersion: 1,
      parseReady: () => undefined,
      parseResponse: (value) => value as { readonly requestId: string; readonly result: unknown },
      requestTimeout: 30_000,
      maxArtifactBytes: 1024,
      logger: createMockLogger(),
      sessionName: 'Sandbox probe',
      executableName: 'node',
    });
    try {
      const outcome = await session.request<Outcomes>({
        method: 'probe',
        params: {},
        parseResult: (value) => value as Outcomes,
        signal: new AbortController().signal,
      });
      expect(denied, `home_read ${outcome.home_read}`).toContain(outcome.home_read);
      expect(denied, `temp_read ${outcome.temp_read}`).toContain(outcome.temp_read);
      expect(denied, `outside_write ${outcome.outside_write}`).toContain(outcome.outside_write);
      expect(denied, `home_write ${outcome.home_write}`).toContain(outcome.home_write);
      expect(denied, `shared_temp_write ${outcome.shared_temp_write}`).toContain(outcome.shared_temp_write);
      expect(denied, `debug_log_write ${outcome.debug_log_write}`).toContain(outcome.debug_log_write);
      expect(outcome.socket).not.toBe('allowed');
      expect(outcome.child_read).not.toBe('exit:0');
      expect(outcome.artifact_write).toBe('allowed');
      expect(outcome.home).toBe(artifactPath);
      expect(existsSync(join(artifactPath, 'probe.txt'))).toBe(true);
      expect(existsSync(paths.outsideEscape)).toBe(false);
      expect(existsSync(paths.homeEscape)).toBe(false);
      expect(existsSync(paths.sharedTempEscape)).toBe(false);
      expect(existsSync(paths.debugLogEscape)).toBe(false);
    } finally {
      await session.cleanup();
      rmSync(root, { recursive: true, force: true });
      for (const path of Object.values(paths)) {
        rmSync(path, { force: true });
      }
    }
  }, 60_000);

  // The documented invariant is a property of the profile the kernel receives, not of the
  // configuration Tau passes in: the runtime unions its own broad write defaults into the former.
  it.runIf(process.platform === 'darwin')(
    'should emit a profile whose only write grants are the launch root and the stdio devices',
    async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-native-profile-')));
      const workspacePath = join(root, 'workspace');
      const artifactPath = join(root, 'artifacts');
      mkdirSync(workspacePath);
      mkdirSync(artifactPath);
      try {
        const argv = await launchInNativeSandbox({
          executablePath: '/bin/echo',
          arguments: ['probe'],
          readablePaths: ['/opt/tau-runtime', workspacePath],
          writablePath: artifactPath,
          workingDirectory: workspacePath,
          commandId: 'profile#1',
        });
        const profile = /sandbox-exec -p '([\S\s]*?)' \/bin\/sh -c/.exec(argv.join(' '))?.[1]?.replaceAll(`'"'"'`, "'");
        expect(profile, `no sandbox-exec profile in ${argv.join(' ')}`).toBeDefined();

        // Every default write root the runtime adds is denied back off after its own allow block.
        // The runtime resolves each root before emitting it, so the probe follows the same symlinks.
        const escapes = nativeSandboxPolicy().filesystem.denyWrite;
        expect(escapes.length).toBeGreaterThan(0);
        for (const root of escapes) {
          const resolved = existsSync(root) ? realpathSync(root) : root;
          expect(emittedWriteVerdict(profile!, join(resolved, 'escape.txt')), root).toBe('deny');
        }
        expect(emittedWriteVerdict(profile!, join(artifactPath, 'scene.tau-mesh'))).toBe('allow');
        expect(emittedWriteVerdict(profile!, '/dev/stdout')).toBe('allow');
        expect(emittedWriteVerdict(profile!, join(workspacePath, 'model.cs'))).not.toBe('allow');

        // Nothing outside the artifact root survives as a write grant except the stdio devices.
        const granted = [...profile!.matchAll(writeRuleBlocks)]
          .filter(([, effect]) => effect === 'allow')
          .flatMap((block) => [...block[2]!.matchAll(/"([^"]*)"/g)].map(([, subject]) => subject!))
          .filter((subject) => !subject.startsWith('/dev/'))
          .filter((subject) => emittedWriteVerdict(profile!, join(subject, 'escape.txt')) === 'allow');
        expect(granted).toEqual([artifactPath]);

        // Sockets are pinned to the runtime's loopback proxy; egress denial is the proxy's, not the
        // kernel's, so this asserts the corrected claim rather than "network denied outright".
        const outbound = [...profile!.matchAll(/\(allow network-outbound[^\n"]*"([^\n"]*)"/g)].map(([, host]) => host!);
        expect(outbound.length).toBeGreaterThan(0);
        expect(outbound.filter((host) => !/^localhost:\d+$/.test(host))).toEqual([]);
        expect(profile).not.toContain('(allow network*)');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
