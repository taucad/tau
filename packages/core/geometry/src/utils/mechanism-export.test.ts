import { describe, expect, it } from 'vitest';
import { readMechanismExport, toMechanismKernelIssue } from '@taucad/geometry-core';
import type { Issue } from '@taucad/kinematics';
import type { KernelIssue } from '@taucad/runtime/types';

const formatUnreachable = (): never => {
  throw new Error('Unexpected mechanism error.');
};

describe('mechanism export', () => {
  it.each([undefined, null, [], 5, {}, { mechanism: undefined }])(
    'should leave a missing mechanism static without warnings (%j)',
    async (module) => {
      expect(
        await readMechanismExport({ module, parameters: {}, kernelId: 'replicad', formatError: formatUnreachable }),
      ).toEqual({ mechanism: undefined, issues: [] });
    },
  );

  it('should own a JSON snapshot that removes undefined and survives later source mutation', async () => {
    const source = { links: { base: { shapes: ['Base'] } }, couplings: undefined };
    const outcome = await readMechanismExport({
      module: { mechanism: source },
      parameters: {},
      kernelId: 'picovoxel',
      formatError: formatUnreachable,
    });
    source.links.base.shapes.push('Late part');
    expect(outcome).toEqual({ mechanism: { links: { base: { shapes: ['Base'] } } }, issues: [] });
  });

  it.each([false, true])(
    'should await a mechanism function with the same parameters as main (async: %s)',
    async (asynchronous) => {
      const parameters = { size: 23 };
      const mechanism = (received: Record<string, unknown>) => {
        expect(received).toBe(parameters);
        return { size: received['size'] };
      };
      expect(
        await readMechanismExport({
          module: {
            mechanism: asynchronous ? async (received: Record<string, unknown>) => mechanism(received) : mechanism,
          },
          parameters,
          kernelId: 'replicad',
          formatError: formatUnreachable,
        }),
      ).toEqual({ mechanism: { size: 23 }, issues: [] });
    },
  );

  it.each([false, true])('should preserve source-mapped failures as warnings (async: %s)', async (asynchronous) => {
    const failure = new Error('missing joint');
    const formatted: KernelIssue = {
      code: 'RUNTIME',
      severity: 'error',
      type: 'runtime',
      message: 'main.ts:12 missing joint',
      location: { fileName: 'main.ts', startLineNumber: 12, startColumn: 3 },
      stack: 'model stack',
      stackFrames: [{ fileName: 'main.ts', lineNumber: 12, columnNumber: 3 }],
    };
    const fail = () => {
      throw failure;
    };
    const outcome = await readMechanismExport({
      module: { mechanism: asynchronous ? async () => fail() : fail },
      parameters: {},
      kernelId: 'picovoxel',
      formatError(error) {
        expect(error).toBe(failure);
        return formatted;
      },
    });
    expect(outcome.mechanism).toBeUndefined();
    expect(outcome.issues).toEqual([
      {
        ...formatted,
        severity: 'warning',
        message:
          'Mechanism: mechanism() threw "main.ts:12 missing joint". Fix the error in mechanism(); the model renders without a mechanism until then.',
        details: {
          producer: { kernelId: 'picovoxel' },
          mechanism: {
            code: 'INVALID_VALUE',
            path: '',
            message: 'mechanism() threw "main.ts:12 missing joint".',
            recovery: 'Fix the error in mechanism(); the model renders without a mechanism until then.',
          },
        },
      },
    ]);
  });

  it('should warn for non-JSON results rather than retain live values', async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    const outcomes = await Promise.all(
      [1n, cyclic, Symbol('joint'), () => undefined].map(async (value) =>
        readMechanismExport({
          module: { mechanism: () => value },
          parameters: {},
          kernelId: 'replicad',
          formatError: formatUnreachable,
        }),
      ),
    );
    for (const outcome of outcomes) {
      expect(outcome.mechanism).toBeUndefined();
      expect(outcome.issues).toMatchObject([
        {
          code: 'INVALID_ANNOTATION',
          severity: 'warning',
          type: 'kernel',
          details: { producer: { kernelId: 'replicad' }, mechanism: { code: 'INVALID_VALUE', path: '' } },
        },
      ]);
      expect(outcome.issues[0]?.message).toMatch(/^Mechanism: The mechanism cannot be written as JSON/);
    }
  });

  it.each(['UNKNOWN_COMPONENT', 'INVALID_AXIS'] as const)(
    'should retain canonical diagnostic paths and producer identity (%s)',
    (code) => {
      const issue: Issue = { code, path: '/joints/hinge/axis', message: 'Bad axis.', recovery: 'Use a valid axis.' };
      expect(toMechanismKernelIssue({ issue, kernelId: 'picovoxel' })).toEqual({
        code: code === 'UNKNOWN_COMPONENT' ? 'INVALID_REFERENCE' : 'INVALID_ANNOTATION',
        severity: 'warning',
        type: 'kernel',
        message: 'Mechanism /joints/hinge/axis: Bad axis. Use a valid axis.',
        details: { producer: { kernelId: 'picovoxel' }, mechanism: issue },
      });
    },
  );
});
