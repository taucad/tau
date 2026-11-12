import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PersonalViewDefaults } from '@taucad/preferences';
import { exceptionsForView, viewExceptions, viewExceptionsStore } from '#workbench-records/view-exceptions.js';
import { markViewFieldsSet } from '#workbench-records/view-fields-set.js';

let defaults: PersonalViewDefaults = {};
const ports = {
  projectId: 'p',
  personDefaults: () => defaults,
  addException: viewExceptions.add,
  removeException: viewExceptions.remove,
};
const exceptions = () => exceptionsForView(viewExceptionsStore.read(), 'p', 'v-1');

beforeEach(() => {
  globalThis.localStorage.clear();
  defaults = {};
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe("arrange_workbench's leaves on the device (BD7, V8)", () => {
  it('keeps a leaf the agent set to the format value over a personal default, as the menu does', () => {
    defaults = { 'display.grid': false, fieldOfView: 30 };
    markViewFieldsSet(ports, 'v-1', { 'display.grid': true, 'display.axes': true, fieldOfView: 45 });
    // The grid is at the format value over a default: set. Axes have no default; field of view is away from it.
    expect(exceptions()).toEqual(['display.grid']);
  });

  it('clears an exception when the agent sets a value away from the format value', () => {
    defaults = { 'display.grid': false };
    viewExceptions.add('p', 'v-1', 'display.grid');
    markViewFieldsSet(ports, 'v-1', { 'display.grid': false });
    expect(exceptions()).toEqual([]);
  });

  it('touches no leaf the call did not name, and never the up axis', () => {
    defaults = { 'display.grid': false };
    viewExceptions.add('p', 'v-1', 'display.grid');
    markViewFieldsSet(ports, 'v-1', { upDirection: 'z', 'grid.unit': 'mm' });
    expect(exceptions()).toEqual(['display.grid']);
  });

  it('returns the leaves whose exception write the store refused or found newer', () => {
    defaults = { 'display.grid': false };
    const unsaved = markViewFieldsSet(
      {
        ...ports,
        addException: () => 'refused',
        removeException: () => 'newer',
      },
      'v-1',
      { 'display.grid': true, 'display.axes': true },
    );
    expect(unsaved).toEqual(['display.grid', 'display.axes']);
  });

  it('returns no leaf when every exception write was saved', () => {
    defaults = { 'display.grid': false };
    expect(markViewFieldsSet(ports, 'v-1', { 'display.grid': true, 'display.axes': true })).toEqual([]);
  });
});
