// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Matrix4, Mesh, MeshStandardMaterial, Plane, Scene } from 'three';
import type { Group } from 'three';
import {
  createModelEmphasisResources,
  modelEmphasisMaskPriority,
  modelEmphasisOverlayPriority,
  syncModelEmphasisFrame,
  syncModelEmphasisProxies,
} from '#components/geometry/graphics/three/react/model-emphasis-overlay.js';
import {
  emptyModelEmphasisSet,
  getModelEmphasisSet,
  setModelEmphasisSet,
} from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';

const makeSource = (metalness = 0.7): Mesh => new Mesh(new BoxGeometry(), new MeshStandardMaterial({ metalness }));

describe('model emphasis overlay resources', () => {
  it('proxies each emphasised mesh once into the mask scene and the wash group, sharing four materials', () => {
    const resources = createModelEmphasisResources('webgl');
    const hovered = makeSource();
    const selected = makeSource();

    syncModelEmphasisProxies(resources, { hover: [hovered], selected: [selected] });

    expect(resources.maskScene.children).toHaveLength(2);
    const washGroup = resources.overlayGroup.children[0] as Group;
    expect(washGroup.children).toHaveLength(2);
    const [hoverMask, selectedMask] = resources.maskScene.children as Mesh[];
    expect(hoverMask!.material).toBe(resources.mask.hover);
    expect(selectedMask!.material).toBe(resources.mask.selected);
    expect(hoverMask!.geometry).toBe(hovered.geometry);
    // The wash never touches the source material, so metalness/maps/vertex colours are irrelevant.
    expect((washGroup.children[0] as Mesh).material).toBe(resources.wash.hover);
    expect(hovered.material).toBeInstanceOf(MeshStandardMaterial);
    expect(resources.wash.hover.polygonOffset).toBe(true);
    expect(resources.wash.selected.opacity).toBeGreaterThan(resources.wash.hover.opacity);

    syncModelEmphasisProxies(resources, emptyModelEmphasisSet);
    expect(resources.maskScene.children).toHaveLength(0);
    expect(resources.proxies).toHaveLength(0);
    resources.dispose();
  });

  it('follows source world transforms and clipping without traversing the scene', () => {
    const resources = createModelEmphasisResources('webgpu');
    const source = makeSource();
    const plane = new Plane();
    (source.material as MeshStandardMaterial).clippingPlanes = [plane];
    source.position.set(1, 2, 3);
    source.updateMatrixWorld(true);
    syncModelEmphasisProxies(resources, { hover: [], selected: [source] });

    syncModelEmphasisFrame(resources);

    const proxy = resources.maskScene.children[0] as Mesh;
    expect(proxy.matrixWorld.equals(new Matrix4().makeTranslation(1, 2, 3))).toBe(true);
    expect(proxy.matrixWorldAutoUpdate).toBe(false);
    expect(resources.wash.selected.clippingPlanes).toEqual([plane]);
    expect(resources.mask.selected.clippingPlanes).toEqual([plane]);
    resources.dispose();
  });

  it('renders the mask after the main pass and the overlay before grid/axes', () => {
    expect(modelEmphasisMaskPriority).toBeGreaterThan(1);
    expect(modelEmphasisOverlayPriority).toBeGreaterThan(modelEmphasisMaskPriority);
    expect(modelEmphasisOverlayPriority).toBeLessThan(2);
  });

  it('disposes the mask target, composite and shared materials once', () => {
    const resources = createModelEmphasisResources('webgl');
    const disposeTarget = vi.spyOn(resources.maskTarget, 'dispose');
    const disposeComposite = vi.spyOn(resources.composite, 'dispose');
    resources.dispose();
    expect(disposeTarget).toHaveBeenCalledTimes(1);
    expect(disposeComposite).toHaveBeenCalledTimes(1);
  });
});

describe('model emphasis registry', () => {
  it('publishes only when the emphasised mesh set actually changes', () => {
    const root = new Scene();
    const mesh = makeSource();
    const listener = vi.fn();
    // Subscribe through the same store the hook uses.
    const set = { hover: [mesh], selected: [] };
    setModelEmphasisSet(root, set);
    expect(getModelEmphasisSet(root).hover).toEqual([mesh]);
    setModelEmphasisSet(root, { hover: [mesh], selected: [] });
    expect(getModelEmphasisSet(root)).toBe(set);
    setModelEmphasisSet(root, { hover: [], selected: [] });
    expect(getModelEmphasisSet(root)).toBe(emptyModelEmphasisSet);
    expect(listener).not.toHaveBeenCalled();
  });
});
