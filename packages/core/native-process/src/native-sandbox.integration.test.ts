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

import { NativeProcessSession } from '#index.js';

const sandboxAvailable =
  (process.platform === 'darwin' || process.platform === 'linux') &&
  SandboxManager.checkDependencies().errors.length === 0;

type Outcomes = Record<
  'home_read' | 'temp_read' | 'outside_write' | 'home_write' | 'socket' | 'child_read' | 'artifact_write' | 'home',
  string
>;
const denied = ['EPERM', 'EACCES'];

const worker = (paths: Record<'homeCanary' | 'tempCanary' | 'outsideEscape' | 'homeEscape', string>): string => `
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
    };
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
      expect(outcome.socket).not.toBe('allowed');
      expect(outcome.child_read).not.toBe('exit:0');
      expect(outcome.artifact_write).toBe('allowed');
      expect(outcome.home).toBe(artifactPath);
      expect(existsSync(join(artifactPath, 'probe.txt'))).toBe(true);
      expect(existsSync(paths.outsideEscape)).toBe(false);
      expect(existsSync(paths.homeEscape)).toBe(false);
    } finally {
      await session.cleanup();
      rmSync(root, { recursive: true, force: true });
      for (const path of Object.values(paths)) {
        rmSync(path, { force: true });
      }
    }
  }, 60_000);
});
