import { describe, expect, it, vi } from 'vitest';
import {
  setViewerPersonProperties,
  viewerPersonPropertyNames,
} from '#components/settings/viewer/viewer-person-properties.js';

describe('setViewerPersonProperties', () => {
  it('should set the changed properties under their analytics names on the injected analytics', () => {
    const capture = vi.fn();

    setViewerPersonProperties({ capture }, { mousePreset: 'middle-shift', gizmoStyle: 'cube' });

    expect(capture).toHaveBeenCalledExactlyOnceWith('$set', {
      $set: { [viewerPersonPropertyNames.mousePreset]: 'middle-shift', [viewerPersonPropertyNames.gizmoStyle]: 'cube' },
    });
  });

  it('should send only the properties that changed', () => {
    const capture = vi.fn();

    setViewerPersonProperties({ capture }, { gizmoStyle: 'cube' });

    expect(capture).toHaveBeenCalledExactlyOnceWith('$set', {
      $set: { [viewerPersonPropertyNames.gizmoStyle]: 'cube' },
    });
  });
});
