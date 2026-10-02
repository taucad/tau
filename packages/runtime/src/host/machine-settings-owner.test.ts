/* oxlint-disable typescript/no-restricted-types -- Null is the checked-write absence precondition. */
/* oxlint-disable no-await-in-loop -- Each acquisition establishes a clean capacity entry before the next admission. */
import { describe, expect, it, vi } from 'vitest';
import type { RootedFileSystem, WatchEvent } from '@taucad/filesystem';
import { defineConfiguration } from '#configuration/configuration.js';
import { z } from 'zod';
import { MachineSettingsOwner } from '#host/machine-settings-owner.js';
import { machineSettingsPath, serializeMachineSettings } from '#machines/settings.js';
import type { MachineSettingsRecord } from '#machines/settings.js';

const typeId = 'bambu.x1c';
const base: MachineSettingsRecord = {
  version: 1,
  typeId,
  activeProfile: 'default',
  profiles: {
    default: {
      name: 'Default',
      configurations: {
        'fixture.preferences': { version: '1', values: { walls: 2 } },
      },
    },
    fine: { name: 'Fine', configurations: {} },
  },
};
const definition = defineConfiguration({
  id: 'fixture.preferences',
  version: '1',
  schema: z.strictObject({
    walls: z.number().optional(),
    speed: z.number().optional(),
  }),
  ui: { version: 1, rjsf: {} },
});
const editValue = (record: MachineSettingsRecord, key: string, value: number): MachineSettingsRecord => ({
  ...record,
  profiles: {
    ...record.profiles,
    default: {
      ...record.profiles['default']!,
      configurations: {
        ...record.profiles['default']!.configurations,
        'fixture.preferences': {
          version: '1',
          values: {
            ...record.profiles['default']!.configurations['fixture.preferences']!.values,
            [key]: value,
          },
        },
      },
    },
  },
});
const fixture = (record: MachineSettingsRecord = base) => {
  let content: Uint8Array<ArrayBuffer> | null = new TextEncoder().encode(serializeMachineSettings({ record }));
  let onChange: (event: WatchEvent) => void = () => undefined;
  const unwatch = vi.fn();
  const watches = vi.fn<NonNullable<RootedFileSystem['watch']>>((_request, handler) => {
    onChange = handler;
    return unwatch;
  });
  const reads = vi.fn<NonNullable<RootedFileSystem['readFileStream']>>((_path, options) => {
    const captured = content;
    return new ReadableStream({
      start(controller) {
        if (captured) {
          controller.enqueue(captured.slice(0, options?.length));
          controller.close();
        } else {
          controller.error(Object.assign(new Error('Absent'), { code: 'ENOENT' }));
        }
      },
    });
  });
  const writes = vi.fn<RootedFileSystem['writeFileChecked']>(async (input) => {
    const { expected } = input.preconditions[0]!;
    const expectedText =
      expected === null ? null : typeof expected === 'string' ? expected : new TextDecoder().decode(expected);
    if (expectedText !== (content === null ? null : new TextDecoder().decode(content))) {
      return {
        status: 'conflict',
        conflicts: [{ path: input.path, actual: content }],
      };
    }
    content = typeof input.data === 'string' ? new TextEncoder().encode(input.data) : input.data;
    return { status: 'applied', content };
  });
  const owner = new MachineSettingsOwner({
    filesystem: {
      readFileStream: reads,
      writeFileChecked: writes,
      watch: watches,
    },
    definitions: [definition],
  });
  return {
    owner,
    reads,
    writes,
    watches,
    unwatch,
    bytes(next: Uint8Array<ArrayBuffer>) {
      content = next;
      onChange({ type: 'change', path: machineSettingsPath({ typeId }) });
    },
    external(next: MachineSettingsRecord) {
      content = new TextEncoder().encode(serializeMachineSettings({ record: next }));
      onChange({ type: 'change', path: machineSettingsPath({ typeId }) });
    },
    replace(next: MachineSettingsRecord) {
      content = new TextEncoder().encode(serializeMachineSettings({ record: next }));
    },
    content: () => content,
  };
};

describe('root-owned machine settings', () => {
  it('should use one bounded cold read and reuse warm acquisitions across consumers', async () => {
    const { owner, reads, watches } = fixture();
    const [pane, agent, profiles] = await Promise.all([
      owner.read({ typeId }),
      owner.read({ typeId }),
      owner.read({ typeId }),
    ]);
    expect(pane).toBe(agent);
    expect(agent).toBe(profiles);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(watches).toHaveBeenCalledTimes(1);
    expect(reads.mock.calls[0]?.[1]).toEqual({ length: 262_145 });
    for (let index = 0; index < 100; index += 1) {
      expect(await owner.read({ typeId })).toBe(pane);
    }
    expect(reads).toHaveBeenCalledTimes(1);
    expect(watches).toHaveBeenCalledTimes(1);
    owner.dispose();
    await expect(owner.read({ typeId })).rejects.toThrow('closed');
  });
  it('should bound a hundred-type farm and reuse two warmed types across machine switches', async () => {
    const { owner, reads, watches, writes, unwatch } = fixture();
    reads.mockImplementation((path) => {
      const id = path
        .split('/')
        .at(-1)
        ?.replace(/\.json$/u, '') as MachineSettingsRecord['typeId'];
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(serializeMachineSettings({ record: { ...base, typeId: id } })));
          controller.close();
        },
      });
    });
    try {
      for (let index = 0; index < 100; index += 1) {
        const record = await owner.read({ typeId: `fixture.type${index}` });
        expect(record.status).toBe('current');
      }
      expect(reads).toHaveBeenCalledTimes(100);
      expect(unwatch).toHaveBeenCalledTimes(68);
      const left = await owner.read({ typeId: 'fixture.type98' });
      const right = await owner.read({ typeId: 'fixture.type99' });
      for (let index = 0; index < 100; index += 1) {
        expect(await owner.read({ typeId: index % 2 ? 'fixture.type98' : 'fixture.type99' })).toBe(
          index % 2 ? left : right,
        );
      }
      expect(reads).toHaveBeenCalledTimes(100);
      expect(watches).toHaveBeenCalledTimes(100);
      expect(writes).not.toHaveBeenCalled();
    } finally {
      owner.dispose();
    }
    expect(unwatch).toHaveBeenCalledTimes(100);
  });
  it('should reacquire uncovered bytes without claiming watch-backed freshness', async () => {
    const state = fixture();
    const owner = new MachineSettingsOwner({
      definitions: [definition],
      filesystem: { readFileStream: state.reads, writeFileChecked: state.writes },
    });
    try {
      await owner.read({ typeId });
      state.replace(editValue(base, 'walls', 4));
      const second = await owner.read({ typeId });
      expect(state.reads).toHaveBeenCalledTimes(2);
      expect(state.watches).not.toHaveBeenCalled();
      expect(second).toMatchObject({
        status: 'current',
        record: { profiles: { default: { configurations: { 'fixture.preferences': { values: { walls: 4 } } } } } },
      });
    } finally {
      owner.dispose();
      state.owner.dispose();
    }
  });
  it('should reuse checked responses, apply selection without a read, and make operations idempotent', async () => {
    const { owner, reads, writes } = fixture();
    await owner.read({ typeId });
    const input = {
      operationId: 'select-fine',
      typeId,
      base,
      next: { ...base, activeProfile: 'fine' },
    } as const;
    const [first, second] = await Promise.all([owner.edit(input), owner.edit(input)]);
    expect(first).toEqual(second);
    expect(first.status).toBe('saved');
    expect(writes).toHaveBeenCalledTimes(1);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(await owner.settlement(input.operationId)).toEqual(first);
    await expect(owner.edit({ ...input, next: base })).rejects.toThrow('identity was reused');
  });
  it('should rebase disjoint fields against returned conflict bytes and refuse same-field conflicts', async () => {
    const { owner, reads, writes, replace } = fixture();
    await owner.read({ typeId });
    replace(editValue(base, 'speed', 80));
    const result = await owner.edit({
      operationId: 'walls',
      typeId,
      base,
      next: editValue(base, 'walls', 3),
    });
    expect(result.status).toBe('saved');
    expect(writes).toHaveBeenCalledTimes(2);
    expect(reads).toHaveBeenCalledTimes(1);
    if (result.status !== 'saved') {
      throw new Error('Expected save');
    }
    expect(result.record.profiles['default']?.configurations['fixture.preferences']?.values).toEqual({
      walls: 3,
      speed: 80,
    });
    replace(editValue(result.record, 'walls', 4));
    expect(
      await owner.edit({
        operationId: 'same-field',
        typeId,
        base: result.record,
        next: editValue(result.record, 'walls', 5),
      }),
    ).toMatchObject({ status: 'conflict' });
    expect(reads).toHaveBeenCalledTimes(1);
  });
  it('should keep pending edits on their captured type and never recreate a deleted profile', async () => {
    const { owner, replace } = fixture();
    await owner.read({ typeId });
    const deleted: MachineSettingsRecord = {
      ...base,
      activeProfile: 'fine',
      profiles: { fine: base.profiles['fine'] },
    };
    replace(deleted);
    expect(
      await owner.edit({
        operationId: 'late-default',
        typeId,
        base,
        next: editValue(base, 'walls', 3),
      }),
    ).toMatchObject({ status: 'conflict' });
    const mini: MachineSettingsRecord = { ...base, typeId: 'bambu.a1-mini' };
    await expect(owner.edit({ operationId: 'wrong-type', typeId, base, next: mini })).rejects.toThrow('identity');
  });
  it('should detach a caller transition before awaits and retain unresolved writes independently of read health', async () => {
    const { owner, writes, external } = fixture();
    await owner.read({ typeId });
    writes.mockRejectedValueOnce(
      Object.assign(new Error('Reply lost after acceptance'), {
        applicationState: 'potentially-applied',
      }),
    );
    expect(
      await owner.edit({
        operationId: 'uncertain',
        typeId,
        base,
        next: editValue(base, 'walls', 3),
      }),
    ).toMatchObject({ status: 'uncertain' });
    external(base);
    const read = await owner.read({ typeId });
    expect(read.status).toBe('current');
    expect(await owner.settlement('uncertain')).toMatchObject({
      status: 'uncertain',
    });
    expect(
      await owner.edit({
        operationId: 'no-retry',
        typeId,
        base,
        next: editValue(base, 'walls', 4),
      }),
    ).toMatchObject({ status: 'uncertain' });
    expect(writes).toHaveBeenCalledTimes(1);
  });
  it('should preserve malformed/future records and refuse invalid active configurations before writing', async () => {
    const { owner, writes } = fixture();
    await owner.read({ typeId });
    await expect(
      owner.edit({
        operationId: 'invalid',
        typeId,
        base,
        next: editValue(base, 'walls', Number.NaN),
      }),
    ).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
  });
  it('should arm coverage before reading and discard a load overtaken by a watch event', async () => {
    const { owner, reads, watches, external } = fixture();
    let finish!: () => void;
    reads.mockImplementationOnce(() => {
      expect(watches).toHaveBeenCalledOnce();
      return new ReadableStream({
        start(controller) {
          finish = () => {
            controller.enqueue(new TextEncoder().encode(serializeMachineSettings({ record: base })));
            controller.close();
          };
        },
      });
    });
    const pending = Array.from({ length: 20 }, async () => owner.read({ typeId }));
    await vi.waitFor(() => {
      expect(reads).toHaveBeenCalledOnce();
    });
    external({ ...base, activeProfile: 'fine' });
    finish();
    const results = await Promise.all(pending);
    expect(results.every((result) => result.status === 'current' && result.record.activeProfile === 'fine')).toBe(true);
    expect(reads).toHaveBeenCalledTimes(2);
    owner.dispose();
  });
  it('should preserve future bytes and opaque inactive blocks while refusing destructive writes', async () => {
    const { owner, bytes, writes, content } = fixture();
    const future = new TextEncoder().encode(JSON.stringify({ ...base, version: 2 }));
    bytes(future);
    expect(await owner.read({ typeId })).toMatchObject({ status: 'refused', code: 'NEWER_RECORD' });
    expect(await owner.edit({ operationId: 'reset-future', typeId, base: null, next: base })).toMatchObject({
      status: 'refused',
    });
    expect(content()).toEqual(future);
    expect(writes).not.toHaveBeenCalled();
    owner.dispose();
  });
  it('should release aborted observers and evict only clean unobserved types at capacity', async () => {
    const { owner, unwatch } = fixture();
    const controller = new AbortController();
    const ids = Array.from({ length: 32 }, (_value, index) => `fixture.type${index}` as const);
    for (const id of ids) {
      owner.subscribe(id, () => undefined, { signal: controller.signal });
      await owner.read({ typeId: id });
    }
    await expect(owner.read({ typeId: 'fixture.extra' })).rejects.toThrow('capacity');
    controller.abort();
    await owner.read({ typeId: 'fixture.extra' });
    expect(unwatch).toHaveBeenCalledOnce();
    owner.dispose();
    expect(unwatch).toHaveBeenCalledTimes(33);
  });
});
