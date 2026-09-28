/* eslint-disable @typescript-eslint/naming-convention -- Fixture names mirror TLA+ modules and environment variables. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { nightlyProject } from '#check.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([
  { mode: 'local', ci: false, status: 0 },
  { mode: 'CI', ci: true, status: 1 },
])('should discard stale simulated behaviours when tooling is unavailable in $mode', async ({ ci, status }) => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-nightly-'));
  roots.push(root);
  const projectRoot = path.join(root, 'packages/example');
  const specs = path.join(projectRoot, 'specs');
  const output = path.join(root, 'out/test-results/formal/packages/example/simulated');
  const stale = path.join(output, 'ExampleGraph.ndjson');
  const removedGraph = path.join(output, 'OtherGraph.ndjson');
  const sibling = path.join(path.dirname(output), 'keep.txt');
  mkdirSync(specs, { recursive: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(specs, 'expected.json'),
    JSON.stringify({ graphs: { ExampleGraph: { config: 'Example.export.cfg', phase: 'phase' } } }),
  );
  writeFileSync(stale, '[{"act":"Init"}]\n');
  writeFileSync(removedGraph, '[{"act":"Init"}]\n');
  writeFileSync(sibling, 'keep me');
  const lines: string[] = [];

  const env = { PATH: '', JAVA_HOME: '/missing/java', ...(ci ? { CI: 'true' } : {}) };
  expect(await nightlyProject({ root, env }, projectRoot, (line) => lines.push(line))).toBe(status);
  expect(lines).toContain('SKIPPED packages/example simulation: java, tlc not found; run pnpm nx run formal:setup');
  expect(existsSync(stale)).toBe(false);
  expect(existsSync(removedGraph)).toBe(false);
  expect(existsSync(path.join(output, '.skipped'))).toBe(!ci);
  expect(readFileSync(sibling, 'utf8')).toBe('keep me');
});

it('should remove a trace whose graph is no longer declared', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-nightly-'));
  roots.push(root);
  const projectRoot = path.join(root, 'packages/example');
  const specs = path.join(projectRoot, 'specs');
  const output = path.join(root, 'out/test-results/formal/packages/example/simulated');
  const removedGraph = path.join(output, 'RemovedGraph.ndjson');
  mkdirSync(specs, { recursive: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(specs, 'expected.json'), '{}');
  writeFileSync(removedGraph, '[{"act":"Init"}]\n');

  expect(
    await nightlyProject({ root, env: { PATH: '', JAVA_HOME: '/missing/java' } }, projectRoot, () => undefined),
  ).toBe(0);
  expect(existsSync(removedGraph)).toBe(false);
  expect(existsSync(path.join(output, '.skipped'))).toBe(false);
});

it('should reject an unsafe graph key before deleting simulation output', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-nightly-'));
  roots.push(root);
  const projectRoot = path.join(root, 'packages/example');
  const specs = path.join(projectRoot, 'specs');
  const output = path.join(root, 'out/test-results/formal/packages/example/simulated');
  const victim = path.join(path.dirname(output), 'outside-victim.ndjson');
  mkdirSync(specs, { recursive: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(specs, 'expected.json'),
    JSON.stringify({ graphs: { '../outside-victim': { config: 'Example.export.cfg', phase: 'phase' } } }),
  );
  writeFileSync(victim, 'keep me');

  expect(
    await nightlyProject({ root, env: { PATH: '', JAVA_HOME: '/missing/java' } }, projectRoot, () => undefined),
  ).toBe(1);
  expect(readFileSync(victim, 'utf8')).toBe('keep me');
});
