import { describe, expect, it } from 'vitest';
import type { HostToolInvocation, HostToolResult, JsonValue } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import {
  benchmarkContent,
  benchmarkPicture,
  benchmarkSource,
  createBenchmarkProject,
  gradeBenchmark,
} from '#testing/live/comment-pins.benchmark.js';

const invoke = (
  project: ReturnType<typeof createBenchmarkProject>,
  name: string,
  input: Readonly<Record<string, JsonValue>>,
): HostToolResult => project.handle({ toolName: name, toolCallId: 'call-1', input } as unknown as HostToolInvocation);

describe('comment pins benchmark', () => {
  it('should send the block, naming each part, only in the pins arm', () => {
    const pins = JSON.stringify(benchmarkContent('pins'));
    const text = JSON.stringify(benchmarkContent('text'));
    for (const label of ['Left post', 'Base plate', 'Cap']) {
      expect(pins).toContain(label);
      expect(text).not.toContain(label);
    }
    expect(pins).toContain('message_annotations');
    expect(text).toContain('1. Make this post 10 mm taller.');
  });

  it('should draw a PNG of the front view', () => {
    const png = benchmarkPicture({ withPins: true });
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(Buffer.from(png).equals(Buffer.from(benchmarkPicture({ withPins: false })))).toBe(false);
  });

  it('should grade the three asked edits, and any other change as collateral', () => {
    expect(gradeBenchmark(benchmarkSource)).toEqual({ done: [], collateral: [], unreadable: false });
    const right = benchmarkSource
      .replace('leftPostHeight: 50', 'leftPostHeight: 60')
      .replace('baseThickness: 8', 'baseThickness: 10')
      .replace('capDiameter: 40', 'capDiameter: 60');
    expect(gradeBenchmark(right)).toEqual({ done: [1, 2, 3], collateral: [], unreadable: false });
    const wrongPost = benchmarkSource.replace('rightPostHeight: 50', 'rightPostHeight: 60');
    expect(gradeBenchmark(wrongPost)).toEqual({ done: [], collateral: ['rightPostHeight'], unreadable: false });
    expect(gradeBenchmark('export default 1;').unreadable).toBe(true);
  });

  it('should let the agent read and edit the one file', () => {
    const project = createBenchmarkProject();
    expect(invoke(project, toolName.readFile, { targetFile: 'main.ts' }).isError).toBe(false);
    expect(
      invoke(project, toolName.editFile, {
        targetFile: './main.ts',
        oldString: 'capDiameter: 40',
        newString: 'capDiameter: 60',
      }).isError,
    ).toBe(false);
    expect(gradeBenchmark(project.source()).done).toEqual([3]);
    expect(
      invoke(project, toolName.editFile, { targetFile: 'main.ts', oldString: 'nope', newString: '' }).isError,
    ).toBe(true);
  });
});
