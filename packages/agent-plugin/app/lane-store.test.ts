import { describe, expect, it } from 'vitest';
import { createLaneStore, laneStoreFor } from '#app/lane-store.js';

/** A `localStorage` stand-in over a map. */
const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
};

describe('createLaneStore', () => {
  it('keeps each project under its own key, in the device record shape desktop uses', () => {
    const storage = memoryStorage();
    const gears = createLaneStore('aaaa', storage);
    gears.writeLaneOpen(false);
    gears.writeLaneLayout({ open: ['model', 'export'], active: 'export', width: 420 });
    gears.writeSections('model', { 'gear.ts': { expanded: false, size: 120 } });
    gears.writeOption('export/stl/options', { tolerance: 0.1 });

    expect(createLaneStore('aaaa', storage).readLane()).toEqual({
      isOpen: false,
      open: ['model', 'export'],
      active: 'export',
      width: 420,
    });
    expect(createLaneStore('aaaa', storage).readSections('model')).toEqual({
      'gear.ts': { expanded: false, size: 120 },
    });
    expect(createLaneStore('aaaa', storage).readOption('export/stl/options')).toEqual({ tolerance: 0.1 });
    expect(JSON.parse(storage.items.get('tau-viewer:lane:aaaa')!)).toMatchObject({ laneWidths: { workbench: 420 } });
    expect(createLaneStore('bbbb', storage).readLane()).toEqual({});
  });

  it('shares one key when the server names no project', () => {
    const storage = memoryStorage();
    createLaneStore(undefined, storage).writeLaneOpen(true);

    expect(createLaneStore(undefined, storage).readLane()).toEqual({ isOpen: true });
  });

  it('keeps values in memory when the frame refuses storage', () => {
    const refusing = {
      getItem: (): string => {
        throw new DOMException('Refused', 'SecurityError');
      },
      setItem: (): void => {
        throw new DOMException('Refused', 'SecurityError');
      },
    };
    const store = createLaneStore('aaaa', refusing);
    store.writeOption('export/stl/options', { binary: true });

    expect(store.readOption('export/stl/options')).toEqual({ binary: true });
    expect(createLaneStore('aaaa', undefined).readLane()).toEqual({});
  });

  it('drops what it cannot trust: unknown panes, bad sections and unreadable records', () => {
    const storage = memoryStorage();
    storage.items.set(
      'tau-viewer:lane:aaaa',
      JSON.stringify({
        lane: { open: ['model', 'gallery'], active: 'gallery' },
        sections: { model: { 'gear.ts': { expanded: 'yes' }, properties: { expanded: true, size: 80 } } },
      }),
    );
    storage.items.set('tau-viewer:lane:bbbb', '{not json');

    expect(createLaneStore('aaaa', storage).readLane()).toEqual({ open: ['model'] });
    expect(createLaneStore('aaaa', storage).readSections('model')).toEqual({
      properties: { expanded: true, size: 80 },
    });
    expect(createLaneStore('bbbb', storage).readLane()).toEqual({});
  });

  it('removes an option written as undefined', () => {
    const store = createLaneStore('aaaa', memoryStorage());
    store.writeOption('export/stl/options', { binary: true });
    store.writeOption('export/stl/options', undefined);

    expect(store.readOption('export/stl/options')).toBeUndefined();
  });
});

describe('laneStoreFor', () => {
  it("hands every surface of a project one store, so the lane's writes and the Export pane's keep each other's", () => {
    const store = laneStoreFor('shared-project');
    expect(laneStoreFor('shared-project')).toBe(store);
    expect(laneStoreFor('other-project')).not.toBe(store);

    store.writeLaneLayout({ open: ['export'], active: 'export', width: 360 });
    laneStoreFor('shared-project').writeOption('export/preferences', { selectedFormats: ['stl'] });

    expect(store.readLane()).toMatchObject({ open: ['export'], width: 360 });
    expect(store.readOption('export/preferences')).toEqual({ selectedFormats: ['stl'] });
  });
});
