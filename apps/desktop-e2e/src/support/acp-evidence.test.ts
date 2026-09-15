import { expect, it } from 'vitest';
import { latestCompletedRun, toolResult } from '#support/acp-evidence.js';

const log = (runId: string, targetFile: string, callId = 'capture'): string =>
  [
    {
      type: 'message.appended',
      runId,
      message: { id: 'input', role: 'tool-input', toolCallId: callId, toolName: 'screenshot', content: { targetFile } },
    },
    {
      type: 'message.appended',
      runId,
      message: {
        id: 'output',
        role: 'tool-output',
        toolCallId: 'capture',
        toolName: 'screenshot',
        content: { images: ['nonblank'] },
        isError: false,
      },
    },
  ]
    .map((row) => JSON.stringify(row))
    .join('\n');

it('rejects stale-run, wrong-target and unmatched-call captures even when nonblank', () => {
  const expected = { runId: 'repair', toolName: 'screenshot', targetFile: 'main.py' };
  expect(toolResult(log('repair', 'main.py'), expected)).toEqual({ images: ['nonblank'] });
  expect(() => toolResult(log('older', 'main.py'), expected)).toThrow();
  expect(() => toolResult(log('repair', 'other.py'), expected)).toThrow();
  expect(() => toolResult(log('repair', 'main.py', 'other-call'), expected)).toThrow();
});

it('does not reuse a completed run when the latest run failed or remains active', () => {
  const completed = JSON.stringify({ type: 'run.lifecycle', runId: 'old', state: 'completed' });
  expect(latestCompletedRun(completed)).toBe('old');
  for (const state of ['running', 'failed', 'cancelled']) {
    const newer = JSON.stringify({ type: 'run.lifecycle', runId: 'new', state });
    expect(() => latestCompletedRun(`${completed}\n${newer}`)).toThrow();
  }
});

it('selects the matching call when one run captures two different targets', () => {
  const first = log('repair', 'main.py');
  const second = log('repair', 'other.py')
    .replaceAll('"input"', '"input-2"')
    .replaceAll('"output"', '"output-2"')
    .replaceAll('"capture"', '"capture-2"');
  expect(toolResult(`${first}\n${second}`, { runId: 'repair', toolName: 'screenshot', targetFile: 'main.py' })).toEqual(
    { images: ['nonblank'] },
  );
});

it('binds GeoSpec results to the specification file, not the model filename', () => {
  const events = [
    {
      type: 'message.appended',
      runId: 'run',
      message: {
        id: 'test-input',
        role: 'tool-input',
        toolName: 'test_model',
        toolCallId: 'test',
        content: { files: ['main.geospec.ts'] },
      },
    },
    {
      type: 'message.appended',
      runId: 'run',
      message: {
        id: 'test-output',
        role: 'tool-output',
        toolName: 'test_model',
        toolCallId: 'test',
        isError: false,
        content: { passes: [{ targetFile: 'main.geospec.ts' }], passed: 1, total: 1 },
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n');
  expect(toolResult(events, { runId: 'run', toolName: 'test_model', targetFile: 'main.geospec.ts' })).toMatchObject({
    passed: 1,
  });
  expect(() => toolResult(events, { runId: 'run', toolName: 'test_model', targetFile: 'main.scad' })).toThrow();
});
