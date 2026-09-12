// @vitest-environment node
/**
 * Hostile Build123d project against the real operating-system sandbox.
 *
 * Both the module's top level and its `main` entry point try to escape, because a
 * watcher that imports project code executes top-level statements before any entry
 * point runs. Every probe reports the OS outcome; the test asserts denial came from
 * the kernel (`EPERM`/`EACCES`), that the private artifact root stayed writable, and
 * that nothing outside the sandbox was created.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { describe, expect, it } from 'vitest';

import { build123d } from '#index.js';

type ResourceManifest = {
  readonly pythonRelativePath: string;
  readonly pythonSha256: string;
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly supportFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
};

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const targetRoot = resolve(workspaceRoot, `apps/desktop/resources/python/${process.platform}-${process.arch}`);
const manifest = JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')) as ResourceManifest;

const runtime = defineRuntime({
  plugins: [
    build123d({
      kernels: {
        default: {
          pythonExecutable: resolve(targetRoot, manifest.pythonRelativePath),
          workerPath: resolve(targetRoot, manifest.workerPath),
          pythonSha256: manifest.pythonSha256,
          workerSha256: manifest.workerSha256,
          supportFiles: manifest.supportFiles.map(({ path, sha256 }) => ({ path: resolve(targetRoot, path), sha256 })),
          requestTimeout: 120_000,
        },
      },
    }),
  ],
});

type Outcomes = Record<
  'home_read' | 'temp_read' | 'outside_write' | 'home_write' | 'socket' | 'dns' | 'subprocess' | 'artifact_write',
  string
>;
const denied = ['EPERM', 'EACCES'];

const hostileSource = (paths: {
  readonly homeCanary: string;
  readonly tempCanary: string;
  readonly outsideEscape: string;
  readonly homeEscape: string;
}): string => `import errno
import json
import os
import socket
import subprocess
from dataclasses import dataclass


def _probe(action):
    try:
        action()
        return "allowed"
    except OSError as error:
        return errno.errorcode.get(error.errno, type(error).__name__)
    except Exception as error:
        return type(error).__name__


def _cat_exit():
    try:
        completed = subprocess.run(["/bin/cat", ${JSON.stringify(paths.homeCanary)}], capture_output=True, check=False)
    except OSError as error:
        return errno.errorcode.get(error.errno, type(error).__name__)
    return f"exit:{completed.returncode}"


def _outcomes():
    return {
        "home_read": _probe(lambda: open(${JSON.stringify(paths.homeCanary)}).read()),
        "temp_read": _probe(lambda: open(${JSON.stringify(paths.tempCanary)}).read()),
        "outside_write": _probe(lambda: open(${JSON.stringify(paths.outsideEscape)}, "w").write("escaped")),
        "home_write": _probe(lambda: open(${JSON.stringify(paths.homeEscape)}, "w").write("escaped")),
        "socket": _probe(lambda: socket.create_connection(("1.1.1.1", 53), timeout=5)),
        "dns": _probe(lambda: socket.gethostbyname("example.com")),
        "subprocess": _cat_exit(),
        "artifact_write": _probe(lambda: open(os.path.join(os.environ["TMPDIR"], "probe.txt"), "w").write("ok")),
    }


IMPORT_OUTCOMES = _outcomes()


@dataclass(frozen=True)
class Params:
    size: float = 1.0


def main(params: Params):
    raise RuntimeError("TAU_SANDBOX_PROBE " + json.dumps({"import": IMPORT_OUTCOMES, "main": _outcomes()}))
`;

describe('Build123d native sandbox', () => {
  it('should deny host reads, writes, network, and subprocess escapes from module import and main', async () => {
    const id = randomUUID();
    const paths = {
      homeCanary: join(homedir(), `.tau-sandbox-canary-${id}`),
      tempCanary: join(tmpdir(), `tau-sandbox-canary-${id}`),
      outsideEscape: `/tmp/tau-sandbox-escape-${id}`,
      homeEscape: join(homedir(), `tau-sandbox-escape-${id}`),
    };
    writeFileSync(paths.homeCanary, 'secret');
    writeFileSync(paths.tempCanary, 'secret');
    const client = createTestRuntimeClient({ runtime, files: { 'main.py': hostileSource(paths) } });
    try {
      const rendered = await client.render({ source: { path: 'main.py' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Hostile Build123d render was unexpectedly superseded.');
      }
      expect(rendered.geometry.success).toBe(false);
      if (rendered.geometry.success) {
        throw new Error('Hostile Build123d project produced geometry.');
      }
      const report = rendered.geometry.issues.map(({ message }) => message).join('\n');
      const probe = /TAU_SANDBOX_PROBE (?<json>\{.*\})/u.exec(report)?.groups?.['json'];
      expect(probe, report).toBeDefined();
      const outcomes = JSON.parse(probe!) as { readonly import: Outcomes; readonly main: Outcomes };
      for (const phase of ['import', 'main'] as const) {
        const outcome = outcomes[phase];
        expect(denied, `${phase} home_read ${outcome.home_read}`).toContain(outcome.home_read);
        expect(denied, `${phase} temp_read ${outcome.temp_read}`).toContain(outcome.temp_read);
        expect(denied, `${phase} outside_write ${outcome.outside_write}`).toContain(outcome.outside_write);
        expect(denied, `${phase} home_write ${outcome.home_write}`).toContain(outcome.home_write);
        expect(outcome.socket, `${phase} socket`).not.toBe('allowed');
        expect(outcome.dns, `${phase} dns`).not.toBe('allowed');
        expect(outcome.subprocess, `${phase} subprocess`).not.toBe('exit:0');
        expect(outcome.artifact_write, `${phase} artifact_write`).toBe('allowed');
      }
      expect(existsSync(paths.outsideEscape)).toBe(false);
      expect(existsSync(paths.homeEscape)).toBe(false);
    } finally {
      await client.shutdown();
      for (const path of Object.values(paths)) {
        rmSync(path, { force: true });
      }
    }
  }, 180_000);
});
