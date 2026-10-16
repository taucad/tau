import { describe, expect, it, vi } from 'vitest';
import type { ParameterManifest } from '@taucad/parameters';
import type { HostBridge } from '#app/host-bridge.js';
import { createParametersSource } from '#app/sources/parameters-source.js';

const manifest = { revision: 'manifest-1', defaults: { width: 10 } } as unknown as ParameterManifest;

const resolved = (values: Record<string, unknown>, activeGroup = 'default') => ({
  status: 'resolved',
  detail: 'full',
  manifest,
  current: {
    identity: { manifestRevision: 'manifest-1' },
    entry: { activeGroup, groups: { [activeGroup]: { values } } },
  },
});

const committed = (requestId = 'request') => ({
  outcome: { status: 'committed', requestId, revision: { manifestRevision: 'manifest-1' }, write: 'applied' },
});

type Tool = (args: Record<string, unknown>) => unknown;

/** A bridge whose `get_parameters` is `read` and whose `apply_parameter_operation` is `propose`; every call is recorded. */
const bridgeWith = (tools: Readonly<{ read?: Tool; propose?: Tool }>) => {
  const callTool = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>) => {
    const tool =
      name === 'get_parameters' ? tools.read : name === 'apply_parameter_operation' ? tools.propose : undefined;
    if (tool === undefined) {
      throw new Error(`Unknown tool ${name}`);
    }
    return tool({ ...args });
  });
  return { bridge: { callTool } as unknown as HostBridge, callTool };
};

/** Wait until the entry has been read once. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('createParametersSource', () => {
  it('should read the full manifest and the current record when the pane first observes an entry', async () => {
    const { bridge, callTool } = bridgeWith({ read: () => resolved({ width: 15 }) });
    const source = createParametersSource(bridge, { onCommitted: vi.fn() });
    const listener = vi.fn();

    expect(source.snapshot('main.ts')).toEqual({ manifest: undefined, entry: undefined, failure: undefined });
    source.subscribe('main.ts', listener);
    await settle();

    expect(callTool).toHaveBeenCalledWith('get_parameters', { targetFile: 'main.ts', detail: 'full' });
    expect(listener).toHaveBeenCalled();
    expect(source.snapshot('main.ts')).toEqual({
      manifest,
      entry: { activeGroup: 'default', groups: { default: { values: { width: 15 } } } },
      failure: undefined,
    });
  });

  it('should report an unresolved entry as a failure with its first diagnostic', async () => {
    const { bridge } = bridgeWith({
      read: () => ({
        status: 'unresolved',
        diagnostics: [{ code: 'INVALID_SCHEMA', message: 'The schema is not an object.' }],
      }),
    });
    const source = createParametersSource(bridge, { onCommitted: vi.fn() });
    source.subscribe('main.ts', vi.fn());
    await settle();

    expect(source.snapshot('main.ts').failure).toEqual({
      code: 'INVALID_SCHEMA',
      message: 'The schema is not an object.',
    });
  });

  it('should report a tool error as a failure and read again on retry', async () => {
    let fails = true;
    const { bridge } = bridgeWith({
      read: () => {
        if (fails) {
          throw new Error('UNKNOWN_TOOL');
        }
        return resolved({});
      },
    });
    const source = createParametersSource(bridge, { onCommitted: vi.fn() });
    source.subscribe('main.ts', vi.fn());
    await settle();
    expect(source.snapshot('main.ts').failure).toEqual({ code: 'RESOLUTION_FAILED', message: 'UNKNOWN_TOOL' });

    fails = false;
    source.retry?.('main.ts', undefined);
    await settle();
    expect(source.snapshot('main.ts').failure).toBeUndefined();
  });

  it('should propose a committed value against the read revision, read again and then show the model', async () => {
    const order: string[] = [];
    let width = 15;
    const { bridge, callTool } = bridgeWith({
      read: () => {
        order.push('read');
        return resolved({ width });
      },
      propose: (args) => {
        order.push('propose');
        width = 42;
        return committed(String(args['requestId']));
      },
    });
    const onCommitted = vi.fn(() => order.push('committed'));
    const source = createParametersSource(bridge, { onCommitted });
    source.subscribe('main.ts', vi.fn());
    await settle();

    const outcome = await source.commitValue('main.ts', manifest, {
      group: 'default',
      pointer: '/width',
      value: 42,
      pressure: 'final',
    });

    expect(outcome.status).toBe('committed');
    expect(callTool).toHaveBeenCalledWith('apply_parameter_operation', {
      action: 'propose',
      targetFile: 'main.ts',
      requestId: expect.stringMatching(/^page-/u) as unknown,
      expected: { manifestRevision: 'manifest-1' },
      pressure: 'final',
      operation: { kind: 'native-value', group: 'default', pointer: '/width', value: 42 },
    });
    expect(order).toEqual(['read', 'propose', 'read', 'committed']);
    expect(source.snapshot('main.ts').entry?.groups['default']?.values).toEqual({ width: 42 });
  });

  it('should not write transient drag values', async () => {
    const { bridge, callTool } = bridgeWith({ read: () => resolved({}) });
    const source = createParametersSource(bridge, { onCommitted: vi.fn() });

    const outcome = await source.commitValue('main.ts', manifest, {
      group: 'default',
      pointer: '/width',
      value: 3,
      pressure: 'transient',
    });

    expect(outcome.status).toBe('cancelled-before-apply');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('should return a refusal without showing the model, and read the authority value again', async () => {
    const { bridge, callTool } = bridgeWith({
      read: () => resolved({ width: 15 }),
      propose: () => ({
        outcome: { status: 'rejected', requestId: 'request', code: 'STALE_MANIFEST', message: 'Stale.' },
      }),
    });
    const onCommitted = vi.fn();
    const source = createParametersSource(bridge, { onCommitted });

    const outcome = await source.commitValue('main.ts', manifest, { group: 'default', pointer: '/width', value: 1 });

    expect(outcome).toEqual({ status: 'rejected', requestId: 'request', code: 'STALE_MANIFEST', message: 'Stale.' });
    expect(onCommitted).not.toHaveBeenCalled();
    expect(callTool.mock.calls.filter(([name]) => name === 'get_parameters')).toHaveLength(2);
  });

  it('should replace the active group and throw when the server does not commit', async () => {
    const { bridge, callTool } = bridgeWith({
      read: () => resolved({ width: 15 }, 'tall'),
      propose: () => ({ outcome: { status: 'indeterminate', requestId: 'r', message: 'Unknown.' } }),
    });
    const source = createParametersSource(bridge, { onCommitted: vi.fn() });
    source.subscribe('main.ts', vi.fn());
    await settle();

    await expect(source.replaceValues('main.ts', manifest, {})).rejects.toThrow('Unknown.');
    expect(callTool).toHaveBeenCalledWith(
      'apply_parameter_operation',
      expect.objectContaining({ operation: { kind: 'replace-group-values', group: 'tall', values: {} } }),
    );
  });

  it('should run group operations in order through the operation tool', async () => {
    const operations: unknown[] = [];
    const { bridge } = bridgeWith({
      read: () => resolved({}),
      propose: (args) => {
        operations.push(args['operation']);
        return committed();
      },
    });
    const onCommitted = vi.fn();
    const source = createParametersSource(bridge, { onCommitted });
    const groups = source.groups!;

    await Promise.all([
      groups.create('main.ts', manifest, { group: 'tall', values: { width: 1 } }),
      groups.select('main.ts', manifest, 'tall'),
    ]);
    await groups.rename('main.ts', manifest, { group: 'tall', nextGroup: 'taller' });
    await groups.delete('main.ts', manifest, 'taller');

    expect(operations).toEqual([
      { kind: 'create-group', group: 'tall', values: { width: 1 } },
      { kind: 'select-group', group: 'tall' },
      { kind: 'rename-group', group: 'tall', nextGroup: 'taller' },
      { kind: 'delete-group', group: 'taller' },
    ]);
    expect(onCommitted).toHaveBeenCalledTimes(4);
  });

  it('should read observed entries again on refresh', async () => {
    const { bridge, callTool } = bridgeWith({ read: () => resolved({}) });
    const source = createParametersSource(bridge, { onCommitted: vi.fn() });
    source.subscribe('main.ts', vi.fn());
    await settle();

    source.refresh();
    source.refresh('other.ts');
    await settle();

    expect(callTool.mock.calls.map(([, args]) => args)).toEqual([
      { targetFile: 'main.ts', detail: 'full' },
      { targetFile: 'main.ts', detail: 'full' },
    ]);
  });

  it('should hand failures to the page only when it shows them', () => {
    const onError = vi.fn();
    expect(createParametersSource(bridgeWith({}).bridge, { onCommitted: vi.fn(), onError }).reportError).toBe(onError);
    expect(createParametersSource(bridgeWith({}).bridge, { onCommitted: vi.fn() }).reportError).toBeUndefined();
  });
});
