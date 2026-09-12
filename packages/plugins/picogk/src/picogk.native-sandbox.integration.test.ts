// @vitest-environment node
/**
 * Hostile PicoGK project against the real operating-system sandbox.
 *
 * Both the program's top-level statements and the `Library.Go` callback try to escape,
 * because compiling and loading a project executes its top level before any model code
 * runs. Every probe reports the .NET outcome; the test asserts the operating system denied
 * each escape, that the private artifact root stayed writable, and that nothing outside
 * the sandbox was created.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { describe, expect, it } from 'vitest';

import { picogk } from '#index.js';

type ResourceManifest = {
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly resourceFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly label: string }>;
};

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const targetRoot = resolve(workspaceRoot, `apps/desktop/resources/picogk/${process.platform}-${process.arch}`);
const manifest = JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')) as ResourceManifest;

const runtime = defineRuntime({
  plugins: [
    picogk({
      kernels: {
        default: {
          workerExecutable: resolve(targetRoot, manifest.workerPath),
          workerSha256: manifest.workerSha256,
          resourceFiles: manifest.resourceFiles.map(({ path, ...resource }) => ({
            ...resource,
            path: resolve(targetRoot, path),
          })),
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
const denied = ['UnauthorizedAccessException', 'IOException'];

const literal = (value: string): string => JSON.stringify(value);

const hostileSource = (paths: {
  readonly homeCanary: string;
  readonly tempCanary: string;
  readonly outsideEscape: string;
  readonly homeEscape: string;
}): string => `using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using PicoGK;

var imported = Sandbox.Outcomes();
Library.Go(1f, () => throw new InvalidOperationException(
    "TAU_SANDBOX_PROBE {\\"import\\":" + imported + ",\\"main\\":" + Sandbox.Outcomes() + "}"));

public static class Sandbox
{
    private static string Probe(Action action)
    {
        try { action(); return "allowed"; }
        catch (Exception error) { return error.GetType().Name; }
    }

    private static string CatExit()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo("/bin/cat", ${literal(paths.homeCanary)})
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            })!;
            process.WaitForExit();
            return "exit:" + process.ExitCode;
        }
        catch (Exception error) { return error.GetType().Name; }
    }

    private static string Field(string name, string value) => "\\"" + name + "\\":\\"" + value + "\\"";

    public static string Outcomes() => "{" + string.Join(",", new[]
    {
        Field("home_read", Probe(() => File.ReadAllText(${literal(paths.homeCanary)}))),
        Field("temp_read", Probe(() => File.ReadAllText(${literal(paths.tempCanary)}))),
        Field("outside_write", Probe(() => File.WriteAllText(${literal(paths.outsideEscape)}, "escaped"))),
        Field("home_write", Probe(() => File.WriteAllText(${literal(paths.homeEscape)}, "escaped"))),
        Field("socket", Probe(() => { using var client = new TcpClient(); client.Connect("1.1.1.1", 53); })),
        Field("dns", Probe(() => Dns.GetHostEntry("example.com"))),
        Field("subprocess", CatExit()),
        Field("artifact_write", Probe(() => File.WriteAllText(Path.Combine(Path.GetTempPath(), "probe.txt"), "ok"))),
    }) + "}";
}
`;

describe('PicoGK native sandbox', () => {
  it('should deny host reads, writes, network, and subprocess escapes from top-level code and Library.Go', async () => {
    const id = randomUUID();
    const paths = {
      homeCanary: join(homedir(), `.tau-sandbox-canary-${id}`),
      tempCanary: join(tmpdir(), `tau-sandbox-canary-${id}`),
      outsideEscape: `/tmp/tau-sandbox-escape-${id}`,
      homeEscape: join(homedir(), `tau-sandbox-escape-${id}`),
    };
    writeFileSync(paths.homeCanary, 'secret');
    writeFileSync(paths.tempCanary, 'secret');
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': hostileSource(paths) } });
    try {
      const rendered = await client.render({ source: { path: 'main.cs' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Hostile PicoGK render was unexpectedly superseded.');
      }
      expect(rendered.geometry.success).toBe(false);
      if (rendered.geometry.success) {
        throw new Error('Hostile PicoGK project produced geometry.');
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
