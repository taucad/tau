import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineRuntime } from '@taucad/runtime/host';
import { definePlugin } from '@taucad/runtime/plugin';
import { defineJobProvider } from '@taucad/runtime/job';
import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';

const execute = vi.fn(async () => ({ value: 1 }));
const configuration = () =>
  defineConfiguration({
    id: 'solve.configuration',
    version: '1',
    schema: z.object({}),
    ui: { version: 1, rjsf: {} },
  });
const solve = (id: string) =>
  defineJobProvider({
    id,
    kind: 'simulation.test',
    version: '1',
    kindVersion: 1,
    configuration: configuration(),
    resultSchema: z.object({ value: z.number() }),
    recovery: { type: 'restart-from-input' },
    execute,
  });

describe('host runtime composition', () => {
  it('keeps jobs outside the four-role CAD definition without executing providers', () => {
    const connect = vi.fn(async () => {
      throw new Error('Composition must not connect');
    });
    const discover = vi.fn(async function* () {
      yield* [];
    });
    const toolkit = definePlugin({
      meta: { name: '@test/mixed' },
      kernels: { cad: () => ({ id: 'cad', extensions: ['test'] }) },
      jobs: { solve: solve('solve') },
      machines: {
        printer: defineMachine({
          id: 'printer',
          name: 'Printer',
          version: '1',
          protocolVersion: 1,
          vendor: 'test',
          technologies: ['additive.fff'],
          accepts: [
            {
              contract: { id: 'test.gcode', version: 1 },
              mediaType: 'text/x.gcode',
              requiredMembers: [],
              payloadSelection: 'single',
              technology: 'additive.fff',
            },
          ],
          bindingConfiguration: configuration(),
          submissionConfiguration: configuration(),
          discover,
          connect,
        }),
      },
      presets: { default: ['kernels.cad', 'jobs.solve', 'machines.printer'] },
    });
    const host = defineRuntime({ plugins: [toolkit()] });
    expect(host.jobs.map(({ id }) => id)).toEqual(['solve']);
    expect(host.machines.map(({ id }) => id)).toEqual(['printer']);
    expect(Object.keys(host.cad).sort()).toEqual(['bundlers', 'kernels', 'middleware', 'transcoders']);
    expect(host.cad.kernels.map(({ id }) => id)).toEqual(['cad']);
    expect(Object.isFrozen(host)).toBe(true);
    expect(Object.isFrozen(host.jobs)).toBe(true);
    expect(Object.isFrozen(host.cad.kernels)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
  });

  it('supports two providers of one job kind on a jobs-only host', () => {
    const toolkit = definePlugin({
      meta: { name: '@test/jobs' },
      jobs: { first: solve('first'), second: solve('second') },
      presets: { default: ['jobs.first', 'jobs.second'] },
    });
    const host = defineRuntime({ plugins: [toolkit()] });
    expect(host.jobs.map(({ id, kind }) => [id, kind])).toEqual([
      ['first', 'simulation.test'],
      ['second', 'simulation.test'],
    ]);
    expect(host.cad.kernels).toEqual([]);
    expect(host.machines).toEqual([]);
  });

  it('rejects duplicate provider identities with both origins', () => {
    const first = definePlugin({
      meta: { name: '@test/first' },
      jobs: { solve: solve('same') },
      presets: { default: ['jobs.solve'] },
    });
    const second = definePlugin({
      meta: { name: '@test/second' },
      jobs: { other: solve('same') },
      presets: { default: ['jobs.other'] },
    });
    expect(() => defineRuntime({ plugins: [first(), second()] })).toThrow(
      'Duplicate host capability jobs:same: first supplied by @test/first (path "@test/first/jobs.solve"); second supplied by @test/second (path "@test/second/jobs.other").',
    );
  });

  it('refuses uninvoked and incompatible toolkits', () => {
    const toolkit = definePlugin({
      meta: { name: '@test/empty' },
      presets: { default: [] },
    });
    expect(() => {
      Reflect.apply(defineRuntime, undefined, [{ plugins: [toolkit] }]);
    }).toThrow('invoked toolkits');
    expect(() => {
      Reflect.apply(defineRuntime, undefined, [{ plugins: [{}] }]);
    }).toThrow('expected ABI 2');
  });
});
