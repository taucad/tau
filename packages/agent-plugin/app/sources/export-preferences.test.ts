import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultExportPreferences } from '@taucad/workbench-panes/export/export-source';
import type { ExportPreferences, ExportPreferencesState } from '@taucad/workbench-panes/export/export-source';
import { createExportOptionStorage, createExportPreferences } from '#app/sources/export-preferences.js';

/** A `localStorage` stand-in that outlives the stores made over it, as the frame's storage outlives a reload. */
const frameStorage = () => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
};

/** Render the hook once, the way the pane calls it. */
const readHook = (usePreferences: () => ExportPreferencesState): ExportPreferencesState => {
  let state: ExportPreferencesState | undefined;
  const probe = () => {
    state = usePreferences();
    return null;
  };
  renderToString(createElement(probe));
  return state!;
};

const chosen: ExportPreferences = {
  ...defaultExportPreferences,
  selectedFormats: ['step', 'stl'],
  formatOptions: { step: { schema: 'AP214' } },
  formatContent: { glb: { includeTopology: true } },
  zipMultiple: true,
};

describe('createExportPreferences', () => {
  it("should keep each format's options and content under the Tau app's keys, and restore them after a reload", () => {
    const storage = frameStorage();
    const [initial, persist] = readHook(createExportPreferences(createExportOptionStorage('p1', storage)));
    expect(initial).toEqual(defaultExportPreferences);

    persist(chosen);

    const options = createExportOptionStorage('p1', storage);
    expect(options.readOption('export/step/options')).toEqual({
      schema: 'AP214',
    });
    expect(options.readOption('export/glb/content')).toEqual({
      includeTopology: true,
    });
    expect(options.readOption('export/stl/options')).toBeUndefined();
    const [reloaded] = readHook(createExportPreferences(options));
    expect(reloaded).toEqual(chosen);
    /* Another project keeps its own choices. */
    expect(readHook(createExportPreferences(createExportOptionStorage('p2', storage)))[0]).toEqual(
      defaultExportPreferences,
    );
  });

  it('should drop values a stored record cannot hold', () => {
    const storage = frameStorage();
    storage.setItem(
      'tau-viewer:export:p1',
      JSON.stringify({
        'export/preferences': {
          selectedFormats: ['step', 'no-such-format', 3],
          shouldDownload: 'yes',
        },
        'export/step/options': 'not an object',
      }),
    );
    const [read] = readHook(createExportPreferences(createExportOptionStorage('p1', storage)));
    expect(read).toEqual({
      ...defaultExportPreferences,
      selectedFormats: ['step'],
    });
  });

  it('should keep the choices in memory when the host refuses the frame storage', () => {
    const refusing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    const usePreferences = createExportPreferences(createExportOptionStorage('p1', refusing));
    const [, persist] = readHook(usePreferences);
    persist(chosen);
    expect(readHook(usePreferences)[0]).toEqual(chosen);
  });
});
