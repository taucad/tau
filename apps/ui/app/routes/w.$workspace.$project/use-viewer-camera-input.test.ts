import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { gizmoStyleIds as preferenceGizmoIds, mousePresetIds } from '@taucad/preferences';
import type { GizmoStyleId as PreferenceGizmoId, MousePresetId } from '@taucad/preferences';
import { cameraPresetIds } from '@taucad/viewer/graphics/three/controls/camera-presets';
import type { CameraPresetId } from '@taucad/viewer/graphics/three/controls/camera-presets';
import { gizmoStyleIds as viewerGizmoIds } from '@taucad/viewer/graphics/three/controls/viewport-gizmo-styles';
import type { GizmoStyleId as ViewerGizmoId } from '@taucad/viewer/graphics/three/controls/viewport-gizmo-styles';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useViewerCameraInput } from '#routes/w.$workspace.$project/use-viewer-camera-input.js';

const flags = vi.hoisted(() => ({ viewerControls: true }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => (flag === 'viewerControls' ? flags.viewerControls : false),
}));

afterEach(() => {
  globalThis.localStorage.clear();
  flags.viewerControls = true;
});

/* BD12: the viewer and the preferences library each declare their closed enums; they must stay equal. */
describe('the preset and gizmo enums', () => {
  it('are the same in the viewer and the preferences library', () => {
    expectTypeOf<CameraPresetId>().toEqualTypeOf<MousePresetId>();
    expectTypeOf<ViewerGizmoId>().toEqualTypeOf<PreferenceGizmoId>();
    expect([...cameraPresetIds]).toEqual([...mousePresetIds]);
    expect([...viewerGizmoIds]).toEqual([...preferenceGizmoIds]);
  });
});

const renderRecords = () => {
  const person = renderHook(() => usePersonRecord());
  const input = renderHook(() => useViewerCameraInput());
  return { person, input };
};

describe('useViewerCameraInput (C9)', () => {
  it('follows a change of the tool answer while no preset or style is stored', () => {
    const { person, input } = renderRecords();
    expect(input.result.current).toEqual({ cameraInput: { preset: 'tau' }, gizmoStyle: 'cube' });
    act(() => {
      person.result.current.writeProfile({ tool: 'blender' });
    });
    expect(input.result.current).toEqual({ cameraInput: { preset: 'middle-shift' }, gizmoStyle: 'axis-balls' });
    act(() => {
      person.result.current.writeProfile({ tool: 'fusion' });
    });
    expect(input.result.current).toEqual({ cameraInput: { preset: 'shift-middle' }, gizmoStyle: 'cube' });
  });

  it('keeps a stored preset and style when the tool answer changes', () => {
    const { person, input } = renderRecords();
    act(() => {
      person.result.current.writeProfile({ tool: 'solidworks' });
      person.result.current.writeViewer({ controls: { preset: 'alt' }, gizmo: { style: 'classic-cube' } });
    });
    act(() => {
      person.result.current.writeProfile({ tool: 'blender' });
    });
    expect(input.result.current.cameraInput?.preset).toBe('alt');
    expect(input.result.current.gizmoStyle).toBe('classic-cube');
  });

  it('passes the stored toggles', () => {
    const { person, input } = renderRecords();
    act(() => {
      person.result.current.writeViewer({
        controls: { zoomToCursor: false, orbitAboutCursor: true, invertZoom: true },
      });
    });
    expect(input.result.current.cameraInput).toEqual({
      preset: 'tau',
      zoomToCursor: false,
      orbitAboutCursor: true,
      invertZoom: true,
    });
  });

  it("passes nothing with viewerControls off, so the viewer keeps today's bindings", () => {
    flags.viewerControls = false;
    const { person, input } = renderRecords();
    act(() => {
      person.result.current.writeViewer({ controls: { preset: 'alt' } });
    });
    expect(input.result.current).toEqual({});
  });
});
