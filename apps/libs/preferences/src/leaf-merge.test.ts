import { describe, expect, it } from 'vitest';
import {
  emptyPersonProfile,
  emptyViewerPreferences,
  mergeLeaves,
  overlayLeaves,
  personProfileSchema,
  resetLeaf,
  viewerPreferencesSchema,
} from '@taucad/preferences';
import type { PersonProfile, ViewerPreferences } from '@taucad/preferences';

const viewer: ViewerPreferences = {
  version: 1,
  controls: { preset: 'middle-ctrl', invertZoom: true },
  gizmo: { style: 'axes' },
  viewDefaults: { 'display.grid': false, fieldOfView: 0 },
};

describe('mergeLeaves', () => {
  it('sets the leaves a write names and leaves every other leaf as stored', () => {
    const next = mergeLeaves(viewer, { viewDefaults: { 'grid.unit': 'in' }, controls: { zoomToCursor: false } });
    expect(next).toEqual({
      version: 1,
      controls: { preset: 'middle-ctrl', invertZoom: true, zoomToCursor: false },
      gizmo: { style: 'axes' },
      viewDefaults: { 'display.grid': false, fieldOfView: 0, 'grid.unit': 'in' },
    });
    expect(viewerPreferencesSchema.parse(next)).toEqual(next);
  });

  it('stores a set leaf whatever its value, even one equal to the default', () => {
    const next = mergeLeaves(emptyViewerPreferences, {
      controls: { preset: 'tau' },
      viewDefaults: { fieldOfView: 60 },
    });
    expect(next.controls).toEqual({ preset: 'tau' });
    expect(next.viewDefaults).toEqual({ fieldOfView: 60 });
  });

  it('removes a leaf only when the write resets it', () => {
    const next = mergeLeaves(viewer, { controls: { preset: resetLeaf }, viewDefaults: { 'display.grid': resetLeaf } });
    expect(next.controls).toEqual({ invertZoom: true });
    expect(next.viewDefaults).toEqual({ fieldOfView: 0 });
  });

  it('replaces arrays whole and never writes the version', () => {
    const profile: PersonProfile = { ...emptyPersonProfile, goals: ['printing'] };
    const next = mergeLeaves(profile, { goals: ['art', 'electronics'], languages: [] });
    expect(next).toEqual({ version: 1, goals: ['art', 'electronics'], languages: [] });
    expect(personProfileSchema.parse(next)).toEqual(next);
    // @ts-expect-error the version is never part of a write.
    expect(mergeLeaves(profile, { version: 2 }).version).toBe(1);
  });

  it('does not mutate what is stored', () => {
    const snapshot = structuredClone(viewer);
    mergeLeaves(viewer, { viewDefaults: { 'display.grid': true }, gizmo: { style: resetLeaf } });
    expect(viewer).toEqual(snapshot);
  });

  it('cannot reset a required leaf', () => {
    // @ts-expect-error goals are always stored; clearing them writes an empty list.
    const patch: Parameters<typeof mergeLeaves<PersonProfile>>[1] = { goals: resetLeaf };
    expect(patch).toBeDefined();
  });

  it('applies the person-profile reset of an optional leaf', () => {
    const blender: PersonProfile = { ...emptyPersonProfile, tool: 'blender' };
    const next = mergeLeaves(blender, { tool: resetLeaf });
    expect(next).not.toHaveProperty('tool');
  });
});

describe('overlayLeaves', () => {
  it('lets every leaf of the top copy win and fills only the leaves it lacks', () => {
    const device: ViewerPreferences = {
      version: 1,
      controls: { preset: 'alt', zoomToCursor: false },
      gizmo: {},
      viewDefaults: { 'display.axes': false },
    };
    const account: ViewerPreferences = {
      version: 1,
      controls: { preset: 'middle-ctrl' },
      gizmo: { style: 'cube' },
      viewDefaults: {},
    };
    expect(overlayLeaves(device, account)).toEqual({
      version: 1,
      controls: { preset: 'middle-ctrl', zoomToCursor: false },
      gizmo: { style: 'cube' },
      viewDefaults: { 'display.axes': false },
    });
  });
});
