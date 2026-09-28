import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import {
  applyModelMaterialAppearance,
  applyModelMaterialOpacityOverride,
  captureModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
  mixModelEmphasisTint,
  modelHighlightAppearance,
  modelHoverAppearance,
  resolveModelMaterialBaseTintHex,
  resolveModelComponentEmphasis,
  updateCapturedModelMaterialBaseColor,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
  gltfEdgeHoverColor,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';

const componentId = 'component:main';

describe('model component appearance', () => {
  it('keeps only the cap tint contract on the appearance constants', () => {
    expect(modelHighlightAppearance.color).toBe(gltfEdgeHoverColor);
    expect(modelHighlightAppearance.capTintMix).toBe(0.7);
    expect(modelHoverAppearance.color).toBe(modelHighlightAppearance.color);
    expect(modelHoverAppearance.capTintMix).toBeLessThan(modelHighlightAppearance.capTintMix);
  });

  it('mixes cap tint by emphasis while preserving selected highlight strength', () => {
    expect(mixModelEmphasisTint(0x00_00_00, 'none')).toBe(0x00_00_00);
    expect(mixModelEmphasisTint(0x00_00_00, 'hover')).toBe(0x59_4b_1a);
    expect(mixModelEmphasisTint(0x00_00_00, 'selected')).toBe(0xb3_95_34);
    expect(mixModelEmphasisTint(0xdd_dd_dd, 'selected')).toBe(0xf5_d7_76);
    expect(mixModelEmphasisTint(0xdd_dd_dd, 'focused')).toBe(mixModelEmphasisTint(0xdd_dd_dd, 'selected'));
    expect(mixModelEmphasisTint(0xff_ff_ff, 'hover')).not.toBe(0xff_ff_ff);
    expect(mixModelEmphasisTint(0x20_40_60, 'hover')).not.toBe(mixModelEmphasisTint(0x20_40_60, 'selected'));
  });

  it('keeps captured base tint stable after live material color mutation', () => {
    const material = new MeshBasicMaterial({ color: 0xaa_44_22 });
    const snapshot = getOrCaptureModelMaterialAppearance(material);

    material.color.setHex(0x11_22_33);

    expect(snapshot.color?.getHex()).toBe(0xaa_44_22);
    expect(getOrCaptureModelMaterialAppearance(material)).toBe(snapshot);
    expect(resolveModelMaterialBaseTintHex(material)).toBe(0xaa_44_22);
  });

  it('lets theme-owned edge colors replace the captured base tint before visual-state restore', () => {
    const material = new MeshBasicMaterial({ color: gltfEdgeColorLightMode });
    const initialSnapshot = getOrCaptureModelMaterialAppearance(material);

    material.color.setHex(gltfEdgeColorDarkMode);
    const updatedSnapshot = updateCapturedModelMaterialBaseColor(material, gltfEdgeColorDarkMode);
    applyModelMaterialAppearance(material, updatedSnapshot, 1);

    expect(updatedSnapshot).not.toBe(initialSnapshot);
    expect(updatedSnapshot.opacity).toBe(initialSnapshot.opacity);
    expect(updatedSnapshot.transparent).toBe(initialSnapshot.transparent);
    expect(updatedSnapshot.depthWrite).toBe(initialSnapshot.depthWrite);
    expect(getOrCaptureModelMaterialAppearance(material)).toBe(updatedSnapshot);
    expect(resolveModelMaterialBaseTintHex(material)).toBe(gltfEdgeColorDarkMode);
    expect(material.color.getHex()).toBe(gltfEdgeColorDarkMode);
  });

  it('never tints a component material for emphasis; the overlay owns hover and selection', () => {
    const material = new MeshStandardMaterial({
      color: 0x33_44_55,
      emissive: 0x11_22_33,
      emissiveIntensity: 0.7,
      metalness: 0.7,
      opacity: 0.8,
      transparent: true,
    });
    const snapshot = captureModelMaterialAppearance(material);

    applyModelMaterialAppearance(material, snapshot, 1);

    expect(material.color.getHex()).toBe(0x33_44_55);
    expect(material.emissive.getHex()).toBe(0x11_22_33);
    expect(material.emissiveIntensity).toBe(0.7);
    expect(material.opacity).toBe(0.8);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(true);
  });

  it('preserves opacity semantics independently from highlight strength', () => {
    const material = new MeshBasicMaterial({ color: 0x80_80_80 });
    const snapshot = captureModelMaterialAppearance(material);

    applyModelMaterialAppearance(material, snapshot, 0.5);

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);
    expect(material.depthWrite).toBe(false);

    applyModelMaterialAppearance(material, snapshot, 1);

    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.depthWrite).toBe(true);
  });

  it('should keep compiled material versions stable until transparency or depth-write state changes', () => {
    const material = new MeshStandardMaterial({ color: 0x28_5e_88, metalness: 0.65, roughness: 0.32 });
    const snapshot = captureModelMaterialAppearance(material);
    const initialVersion = material.version;

    applyModelMaterialAppearance(material, snapshot, 1);
    applyModelMaterialAppearance(material, snapshot, 1);
    expect(material.version).toBe(initialVersion);

    applyModelMaterialAppearance(material, snapshot, 0.5);
    expect(material.version).toBe(initialVersion + 1);
    applyModelMaterialAppearance(material, snapshot, 0.25);
    expect(material.opacity).toBe(0.25);
    expect(material.version).toBe(initialVersion + 1);

    applyModelMaterialAppearance(material, snapshot, 1);
    expect(material.version).toBe(initialVersion + 2);
    applyModelMaterialAppearance(material, snapshot, 1);
    expect(material.version).toBe(initialVersion + 2);
    expect(material.metalness).toBe(0.65);
    expect(material.roughness).toBe(0.32);
  });

  it('should restore the original depth-write state after temporary model dimming', () => {
    const material = new MeshBasicMaterial({ color: 0x40_40_40, opacity: 0.75, transparent: true });
    material.depthWrite = false;
    const snapshot = captureModelMaterialAppearance(material);

    applyModelMaterialAppearance(material, snapshot, 0.25);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.25);
    expect(material.depthWrite).toBe(false);

    applyModelMaterialAppearance(material, snapshot, 1);

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.75);
    expect(material.depthWrite).toBe(false);
  });

  it('should apply translucent model opacity without writing depth', () => {
    const material = new MeshBasicMaterial({ color: 0x40_40_40 });

    applyModelMaterialOpacityOverride(material, 0.5);

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);
    expect(material.depthWrite).toBe(false);
  });

  it('resolves emphasis by focus, selection, hover priority', () => {
    expect(
      resolveModelComponentEmphasis(
        { hoveredComponentId: componentId, selectedComponentIds: [], focusedComponentId: undefined },
        componentId,
      ),
    ).toBe('hover');
    expect(
      resolveModelComponentEmphasis(
        { hoveredComponentId: undefined, selectedComponentIds: [componentId], focusedComponentId: undefined },
        componentId,
      ),
    ).toBe('selected');
    expect(
      resolveModelComponentEmphasis(
        { hoveredComponentId: componentId, selectedComponentIds: [componentId], focusedComponentId: undefined },
        componentId,
      ),
    ).toBe('selected');
    expect(
      resolveModelComponentEmphasis(
        { hoveredComponentId: componentId, selectedComponentIds: [componentId], focusedComponentId: componentId },
        componentId,
      ),
    ).toBe('focused');
    expect(
      resolveModelComponentEmphasis(
        { hoveredComponentId: undefined, selectedComponentIds: [], focusedComponentId: undefined },
        componentId,
      ),
    ).toBe('none');
  });
});
