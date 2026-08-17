import { describe, it, expect } from 'vitest';
import {
  copyEventAuthorities,
  getEventAuthorities,
  getEventOrigin,
  isEventGloballyVisible,
  tagEventAuthorities,
  tagEventOrigin,
} from '#event-origin-registry.js';
import type { ChangeEvent } from '#types.js';

const mockBackend = 'memory';

function fileWrittenEvent(path: string): ChangeEvent {
  return { type: 'fileWritten', path, backend: mockBackend };
}

describe('event-origin-registry', () => {
  it('should return undefined when event is untagged', () => {
    const event = fileWrittenEvent('/a.txt');
    expect(getEventOrigin(event)).toBeUndefined();
  });

  it('should round-trip tagEventOrigin and getEventOrigin', () => {
    const event = fileWrittenEvent('/b.txt');
    tagEventOrigin(event, 'port_xyz');
    expect(getEventOrigin(event)).toBe('port_xyz');
  });

  it('should allow overwriting an existing tag', () => {
    const event = fileWrittenEvent('/c.txt');
    tagEventOrigin(event, 'first');
    tagEventOrigin(event, 'second');
    expect(getEventOrigin(event)).toBe('second');
  });

  it('should not leak tag to a different object', () => {
    const event1 = fileWrittenEvent('/d.txt');
    const event2 = fileWrittenEvent('/d.txt');
    tagEventOrigin(event1, 'only-one');
    expect(getEventOrigin(event1)).toBe('only-one');
    expect(getEventOrigin(event2)).toBeUndefined();
  });

  it('should drop mapping when event is GC-eligible', () => {
    const { gc } = globalThis as typeof globalThis & { gc?: () => void };
    if (typeof gc !== 'function') {
      // Node without --expose-gc: skip GC assertion.
      return;
    }

    function allocateAndTag(): void {
      const ephemeral = fileWrittenEvent('/gc.txt');
      tagEventOrigin(ephemeral, 'ephemeral-port');
      expect(getEventOrigin(ephemeral)).toBe('ephemeral-port');
    }

    allocateAndTag();
    gc();

    const fresh = fileWrittenEvent('/gc.txt');
    expect(getEventOrigin(fresh)).toBeUndefined();
  });

  it('copies captured authority visibility without copying origin', () => {
    const source = fileWrittenEvent('/captured.txt');
    const target = { ...source };
    const authority = {};
    tagEventOrigin(source, 'port');
    tagEventAuthorities(source, [authority], false);

    copyEventAuthorities(source, target);

    expect(getEventAuthorities(target)).toEqual([authority]);
    expect(isEventGloballyVisible(target)).toBe(false);
    expect(getEventOrigin(target)).toBeUndefined();
  });
});
