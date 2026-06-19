import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshStandardMaterial, Color } from 'three';
import {
  applyModelMaterialAppearance,
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
} from '#components/geometry/graphics/three/overlay-colors.constants.js';

const componentId = 'component:main';

describe('model component appearance', () => {
  it('uses reduced highlight strength constants', () => {
    expect(modelHighlightAppearance.color).toBe(0x9b_e7_ff);
    expect(modelHighlightAppearance.emissiveIntensity).toBeLessThanOrEqual(0.175);
    expect(modelHighlightAppearance.colorMix).toBeLessThanOrEqual(0.125);
    expect(modelHighlightAppearance.capTintMix).toBe(0.4);
    expect(modelHoverAppearance.color).toBe(modelHighlightAppearance.color);
    expect(modelHoverAppearance.emissiveIntensity).toBeLessThan(modelHighlightAppearance.emissiveIntensity);
    expect(modelHoverAppearance.colorMix).toBeLessThan(modelHighlightAppearance.colorMix);
    expect(modelHoverAppearance.capTintMix).toBeLessThan(modelHighlightAppearance.capTintMix);
  });

  it('mixes cap tint by emphasis while preserving selected highlight strength', () => {
    expect(mixModelEmphasisTint(0x00_00_00, 'none')).toBe(0x00_00_00);
    expect(mixModelEmphasisTint(0x00_00_00, 'hover')).toBe(0x19_25_29);
    expect(mixModelEmphasisTint(0x00_00_00, 'selected')).toBe(0x3e_5c_66);
    expect(mixModelEmphasisTint(0xdd_dd_dd, 'selected')).toBe(0xc3_e1_eb);
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
    applyModelMaterialAppearance(material, updatedSnapshot, { opacity: 1, emphasis: 'none' });

    expect(updatedSnapshot).not.toBe(initialSnapshot);
    expect(updatedSnapshot.opacity).toBe(initialSnapshot.opacity);
    expect(updatedSnapshot.transparent).toBe(initialSnapshot.transparent);
    expect(getOrCaptureModelMaterialAppearance(material)).toBe(updatedSnapshot);
    expect(resolveModelMaterialBaseTintHex(material)).toBe(gltfEdgeColorDarkMode);
    expect(material.color.getHex()).toBe(gltfEdgeColorDarkMode);
  });

  it('applies reduced blue emissive highlight and restores the original material state', () => {
    const material = new MeshStandardMaterial({
      color: 0x33_44_55,
      emissive: 0x11_22_33,
      emissiveIntensity: 0.7,
      opacity: 0.8,
      transparent: true,
    });
    const snapshot = captureModelMaterialAppearance(material);

    applyModelMaterialAppearance(material, snapshot, { opacity: 1, emphasis: 'selected' });

    expect(material.emissive.getHex()).toBe(modelHighlightAppearance.color);
    expect(material.emissiveIntensity).toBe(modelHighlightAppearance.emissiveIntensity);

    applyModelMaterialAppearance(material, snapshot, { opacity: 1, emphasis: 'none' });

    expect(material.emissive.getHex()).toBe(0x11_22_33);
    expect(material.emissiveIntensity).toBe(0.7);
    expect(material.opacity).toBe(0.8);
    expect(material.transparent).toBe(true);
  });

  it('mixes color-only materials toward blue rather than white', () => {
    const material = new MeshBasicMaterial({ color: 0x20_40_60 });
    const snapshot = captureModelMaterialAppearance(material);
    const expectedBlueMix = new Color(0x20_40_60)
      .lerp(new Color(modelHighlightAppearance.color), modelHighlightAppearance.colorMix)
      .getHex();
    const legacyWhiteMix = new Color(0x20_40_60).lerp(new Color(0xff_ff_ff), 0.25).getHex();

    applyModelMaterialAppearance(material, snapshot, { opacity: 1, emphasis: 'selected' });

    expect(material.color.getHex()).toBe(expectedBlueMix);
    expect(material.color.getHex()).not.toBe(legacyWhiteMix);

    applyModelMaterialAppearance(material, snapshot, { opacity: 1, emphasis: 'none' });

    expect(material.color.getHex()).toBe(0x20_40_60);
  });

  it('applies weaker hover material emphasis than selected emphasis', () => {
    const material = new MeshStandardMaterial({
      color: 0x33_44_55,
      emissive: 0x00_00_00,
      emissiveIntensity: 0,
    });
    const snapshot = captureModelMaterialAppearance(material);

    applyModelMaterialAppearance(material, snapshot, { opacity: 1, emphasis: 'hover' });
    expect(material.emissive.getHex()).toBe(modelHighlightAppearance.color);
    expect(material.emissiveIntensity).toBe(modelHoverAppearance.emissiveIntensity);

    applyModelMaterialAppearance(material, snapshot, { opacity: 1, emphasis: 'selected' });
    expect(material.emissive.getHex()).toBe(modelHighlightAppearance.color);
    expect(material.emissiveIntensity).toBe(modelHighlightAppearance.emissiveIntensity);
    expect(modelHoverAppearance.emissiveIntensity).toBeLessThan(modelHighlightAppearance.emissiveIntensity);
  });

  it('preserves opacity semantics independently from highlight strength', () => {
    const material = new MeshBasicMaterial({ color: 0x80_80_80 });
    const snapshot = captureModelMaterialAppearance(material);

    applyModelMaterialAppearance(material, snapshot, { opacity: 0.5, emphasis: 'selected' });

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);

    applyModelMaterialAppearance(material, snapshot, { opacity: 1, emphasis: 'none' });

    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
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
