import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { mock } from 'vitest-mock-extended';
import type {
  SectionPlanePicker,
  SectionPlanePickerRenderer,
} from '#components/geometry/graphics/three/controls/section-plane-picker.js';
import {
  bindViewportGizmoInvalidationEvents,
  readGizmoViewport,
  renderViewportGizmoFrame,
} from '#components/geometry/graphics/three/controls/viewport-gizmo-render-loop.js';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';

class FakeGizmo {
  public animating = false;

  public readonly render = vi.fn();

  private readonly listeners = new Map<string, Set<ControlEventListener>>();

  public addEventListener(type: string, listener: ControlEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<ControlEventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: ControlEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ type });
    }
  }
}

describe('viewport-gizmo-render-loop', () => {
  it('renders, syncs controls, then invalidates while animating', () => {
    const calls: string[] = [];
    const gizmo = new FakeGizmo();
    gizmo.animating = true;
    gizmo.render.mockImplementation(() => {
      calls.push('render');
    });
    const controlsBinding = {
      detach: vi.fn(),
      afterGizmoRender: vi.fn(() => {
        calls.push('sync');
      }),
    };
    const invalidate = vi.fn(() => {
      calls.push('invalidate');
    });
    const renderer = {
      toneMapping: THREE.ACESFilmicToneMapping,
    };

    renderViewportGizmoFrame({ gizmo, renderer, controlsBinding, invalidate });

    expect(calls).toEqual(['render', 'sync', 'invalidate']);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  });

  it('does not keep demand rendering alive when the gizmo is idle', () => {
    const gizmo = new FakeGizmo();
    const invalidate = vi.fn();

    renderViewportGizmoFrame({
      gizmo,
      renderer: { toneMapping: THREE.CineonToneMapping },
      controlsBinding: { detach: vi.fn(), afterGizmoRender: vi.fn() },
      invalidate,
    });

    expect(gizmo.render).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('invalidates on all visible gizmo state-change events and cleans up listeners', () => {
    const gizmo = new FakeGizmo();
    const invalidate = vi.fn();
    const cleanup = bindViewportGizmoInvalidationEvents({ gizmo, invalidate });

    gizmo.emit('start');
    gizmo.emit('change');
    gizmo.emit('hoverchange');
    gizmo.emit('end');

    expect(invalidate).toHaveBeenCalledTimes(4);

    cleanup();
    gizmo.emit('change');

    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  it('should draw the section plane picker first, beside the viewport the cube was placed in', () => {
    const calls: string[] = [];
    const gizmo = Object.assign(new FakeGizmo(), { _viewport: [704, 494, 96, 96] });
    gizmo.render.mockImplementation(() => {
      calls.push('cube');
    });
    const picker = mock<SectionPlanePicker>();
    picker.render.mockImplementation(() => {
      calls.push('picker');
    });
    const pickerRenderer = mock<SectionPlanePickerRenderer>();
    const camera = new THREE.PerspectiveCamera();

    renderViewportGizmoFrame({
      gizmo,
      renderer: { toneMapping: THREE.NoToneMapping },
      invalidate: vi.fn(),
      planePicker: { picker, renderer: pickerRenderer, camera },
    });

    expect(calls).toEqual(['picker', 'cube']);
    expect(picker.render).toHaveBeenCalledWith({ renderer: pickerRenderer, camera, cubeViewport: [704, 494, 96, 96] });
  });

  it('should skip the picker while the cube has no readable viewport', () => {
    expect(readGizmoViewport({ _viewport: [0, 0, 0, 0] })).toBeUndefined();
    expect(readGizmoViewport({})).toBeUndefined();
    expect(readGizmoViewport({ _viewport: [1, 2, 3, 3] })).toEqual([1, 2, 3, 3]);
  });
});
