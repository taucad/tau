import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParameterManifest, ParameterSetOutcome } from '@taucad/parameters';
import { createParameterController } from '#parameters/parameter-controller.js';
import type { ParameterTransport } from '#parameters/parameter-controller.js';

const manifest = { revision: 'manifest-1', defaults: { width: 10 } } as unknown as ParameterManifest;

const current = {
  identity: { manifestRevision: 'manifest-1' },
  entry: { activeGroup: 'default', groups: { default: { values: { width: 10 } } } },
} as const;

/** A transport that records every call; `propose` answers `outcome`. */
const transportWith = (outcome: (requestId: string) => ParameterSetOutcome) => {
  const calls: string[] = [];
  const previews: Array<Readonly<Record<string, unknown>> | undefined> = [];
  const transport: ParameterTransport = {
    read: vi.fn(async () => {
      calls.push('read');
      return { manifest, current };
    }) as unknown as ParameterTransport['read'],
    propose: vi.fn<ParameterTransport['propose']>(async ({ request }) => {
      calls.push(`propose ${request.requestId}`);
      return outcome(request.requestId);
    }),
    preview: vi.fn<NonNullable<ParameterTransport['preview']>>(async ({ parameters }) => {
      calls.push('preview');
      previews.push(parameters);
    }),
  };
  return { transport, calls, previews };
};

const committed = (requestId: string): ParameterSetOutcome => ({
  status: 'committed',
  requestId,
  revision: current.identity,
  write: 'applied',
});

const tooWide = (requestId: string): ParameterSetOutcome => ({
  status: 'rejected',
  requestId,
  code: 'OUT_OF_RANGE',
  message: 'Too wide.',
});

describe('createParameterController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should preview a drag at most once per interval, newest value first, and write nothing until release', async () => {
    const { transport, previews, calls } = transportWith(committed);
    const controller = createParameterController({ transport, previewInterval: 200 });
    const lane = controller.useScrub('main.ts');

    lane.scrub?.({ pointer: '/width', value: 11 });
    await vi.advanceTimersByTimeAsync(0);
    for (const value of [12, 13, 14]) {
      lane.scrub?.({ pointer: '/width', value });
    }
    await vi.advanceTimersByTimeAsync(100);
    expect(previews).toEqual([{ width: 11 }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(previews).toEqual([{ width: 11 }, { width: 14 }]);
    expect(calls.some((call) => call.startsWith('propose'))).toBe(false);

    /* A transient commit (a held arrow key) previews too, and the final one writes. */
    const transient = await controller.commitValue('main.ts', manifest, {
      group: 'default',
      pointer: '/width',
      value: 15,
      pressure: 'transient',
    });
    expect(transient.status).toBe('cancelled-before-apply');
    await vi.advanceTimersByTimeAsync(200);
    expect(previews.at(-1)).toEqual({ width: 15 });
    const final = await controller.commitValue('main.ts', manifest, { group: 'default', pointer: '/width', value: 15 });
    expect(final.status).toBe('committed');
    await vi.advanceTimersByTimeAsync(200);
    /* Committed, the record the renderer watches renders it: the preview is not restored. */
    expect(previews).not.toContain(undefined);
    controller.dispose();
  });

  it('should restore the committed render when a drag is cancelled or its value is refused', async () => {
    const { transport, previews } = transportWith(tooWide);
    const controller = createParameterController({ transport, previewInterval: 0 });
    const lane = controller.useScrub('main.ts');

    lane.scrub?.({ pointer: '/width', value: 40 });
    await vi.advanceTimersByTimeAsync(0);
    await lane.endScrub?.();
    expect(previews).toEqual([{ width: 40 }, undefined]);

    lane.scrub?.({ pointer: '/width', value: 50 });
    await vi.advanceTimersByTimeAsync(0);
    const refused = await controller.commitValue('main.ts', manifest, {
      group: 'default',
      pointer: '/width',
      value: 50,
    });
    expect(refused.status).toBe('rejected');
    await vi.advanceTimersByTimeAsync(0);
    expect(previews.at(-1)).toBeUndefined();
    expect(previews).toHaveLength(4);
  });

  it('should pin each write to the read revision, run them in order, and offer no drag lane without a preview', async () => {
    const { transport, calls } = transportWith(committed);
    const { preview: _preview, ...writeOnly } = transport;
    const controller = createParameterController({ transport: writeOnly });

    await Promise.all([
      controller.commitValue('main.ts', manifest, { group: 'default', pointer: '/width', value: 1 }),
      controller.replaceValues('main.ts', manifest, { width: 2 }),
    ]);

    expect(calls.map((call) => call.replace(/ .*/u, ''))).toEqual(['read', 'propose', 'read', 'propose', 'read']);
    expect(vi.mocked(transport.propose).mock.calls[0]?.[0].request).toMatchObject({
      expected: { manifestRevision: 'manifest-1' },
      pressure: 'final',
      operation: { kind: 'native-value', group: 'default', pointer: '/width', value: 1 },
    });
    expect(controller.useScrub('main.ts')).toEqual({});
  });

  it('should write a form edit as a group replacement carrying its base and the pane editor', async () => {
    const { transport } = transportWith(committed);
    const controller = createParameterController({ transport });

    await controller.editValues('main.ts', manifest, { values: { width: 3 }, base: { width: 2 } });

    const operation = vi.mocked(transport.propose).mock.calls[0]?.[0].request.operation;
    expect(operation).toMatchObject({ kind: 'replace-group-values', values: { width: 3 }, base: { width: 2 } });
    expect(operation?.kind === 'replace-group-values' ? operation.editor : undefined).toMatch(/^pane:/u);
  });
});
