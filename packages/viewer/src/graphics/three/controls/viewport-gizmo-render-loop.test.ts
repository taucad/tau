import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { mock } from 'vitest-mock-extended';
import type { SectionPlanePicker, SectionPlanePickerRenderer } from '#graphics/three/controls/section-plane-picker.js';
import { readGizmoViewport, renderViewportGizmoFrame } from '#graphics/three/controls/viewport-gizmo-render-loop.js';

const empty = { x: 0, y: 0, width: 0, height: 0 };
const fakeGizmo = (viewport: typeof empty = empty) => ({ viewport, render: vi.fn() });

describe('viewport-gizmo-render-loop', () => {
  it('should draw the section plane picker first, beside the viewport the cube was placed in', () => {
    const calls: string[] = [];
    const gizmo = fakeGizmo({ x: 704, y: 494, width: 96, height: 96 });
    gizmo.render.mockImplementation(() => {
      calls.push('cube');
    });
    const picker = mock<SectionPlanePicker>();
    picker.render.mockImplementation(() => {
      calls.push('picker');
    });
    const pickerRenderer = mock<SectionPlanePickerRenderer>();
    const camera = new THREE.PerspectiveCamera();

    renderViewportGizmoFrame({ gizmo, planePicker: { picker, renderer: pickerRenderer, camera } });

    expect(calls).toEqual(['picker', 'cube']);
    expect(picker.render).toHaveBeenCalledWith({ renderer: pickerRenderer, camera, cubeViewport: [704, 494, 96, 96] });
  });

  it('should skip the picker while the cube has no measured viewport', () => {
    expect(readGizmoViewport(fakeGizmo())).toBeUndefined();
    expect(readGizmoViewport(fakeGizmo({ x: 1, y: 2, width: 3, height: 3 }))).toEqual([1, 2, 3, 3]);
  });
});
