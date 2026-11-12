import { describe, expect, it } from 'vitest';
import {
  cameraMappings,
  cameraPresetIds,
  resolveCameraMapping,
  resolveDrag,
  resolveWheel,
  toCameraDragButton,
} from '#graphics/three/controls/camera-presets.js';
import type {
  CameraDragButton,
  CameraGesture,
  CameraMappingId,
  CameraModifier,
  CameraModifiers,
} from '#graphics/three/controls/camera-presets.js';

const toModifiers = (names: readonly CameraModifier[]): CameraModifiers => ({
  shift: names.includes('shift'),
  ctrl: names.includes('ctrl'),
  alt: names.includes('alt'),
});

/** Blueprint C1 to C7: every listed drag, by preset. */
const listedDrags: ReadonlyArray<
  Readonly<{
    mapping: CameraMappingId;
    button: CameraDragButton;
    modifiers: CameraModifier[];
    gesture: CameraGesture;
  }>
> = [
  // C1, P1 Tau default.
  { mapping: 'tau', button: 'left', modifiers: [], gesture: 'orbit' },
  { mapping: 'tau', button: 'right', modifiers: [], gesture: 'pan' },
  { mapping: 'tau', button: 'middle', modifiers: [], gesture: 'pan' },
  { mapping: 'tau', button: 'left', modifiers: ['shift'], gesture: 'pan' },
  // C2, P2 Right-drag orbit.
  { mapping: 'right-orbit', button: 'right', modifiers: [], gesture: 'orbit' },
  { mapping: 'right-orbit', button: 'middle', modifiers: [], gesture: 'pan' },
  {
    mapping: 'right-orbit',
    button: 'right',
    modifiers: ['ctrl'],
    gesture: 'pan',
  },
  // C3, P3 Middle-drag orbit, Ctrl pan.
  { mapping: 'middle-ctrl', button: 'middle', modifiers: [], gesture: 'orbit' },
  {
    mapping: 'middle-ctrl',
    button: 'middle',
    modifiers: ['ctrl'],
    gesture: 'pan',
  },
  {
    mapping: 'middle-ctrl',
    button: 'middle',
    modifiers: ['shift'],
    gesture: 'zoom',
  },
  // C4, P4 Middle-drag orbit, Shift pan.
  {
    mapping: 'middle-shift',
    button: 'middle',
    modifiers: [],
    gesture: 'orbit',
  },
  {
    mapping: 'middle-shift',
    button: 'middle',
    modifiers: ['shift'],
    gesture: 'pan',
  },
  {
    mapping: 'middle-shift',
    button: 'middle',
    modifiers: ['ctrl'],
    gesture: 'zoom',
  },
  // C5, P5 Middle-drag pan, Shift orbit.
  {
    mapping: 'shift-middle',
    button: 'middle',
    modifiers: ['shift'],
    gesture: 'orbit',
  },
  { mapping: 'shift-middle', button: 'middle', modifiers: [], gesture: 'pan' },
  // C6, P6 Alt-drag navigation.
  { mapping: 'alt', button: 'left', modifiers: ['alt'], gesture: 'orbit' },
  { mapping: 'alt', button: 'middle', modifiers: ['alt'], gesture: 'pan' },
  { mapping: 'alt', button: 'right', modifiers: ['alt'], gesture: 'zoom' },
  // C7, P7 Trackpad.
  { mapping: 'trackpad', button: 'left', modifiers: [], gesture: 'orbit' },
  { mapping: 'trackpad', button: 'left', modifiers: ['shift'], gesture: 'pan' },
];

const mappingIds: readonly CameraMappingId[] = [...cameraPresetIds, 'trackpad'];
const buttons: readonly CameraDragButton[] = ['left', 'middle', 'right'];
const modifierSets: ReadonlyArray<readonly CameraModifier[]> = [
  [],
  ['shift'],
  ['ctrl'],
  ['alt'],
  ['shift', 'ctrl'],
  ['shift', 'alt'],
  ['ctrl', 'alt'],
  ['shift', 'ctrl', 'alt'],
];

describe('resolveDrag', () => {
  it.each(listedDrags)('$mapping: $modifiers + $button drag → $gesture', ({ mapping, button, modifiers, gesture }) => {
    expect(resolveDrag(mapping, button, toModifiers(modifiers))).toBe(gesture);
  });

  // C8: every combination a preset's row does not list leaves the camera alone.
  const isListed = (
    mapping: CameraMappingId,
    button: CameraDragButton,
    modifiers: readonly CameraModifier[],
  ): boolean =>
    listedDrags.some(
      (row) =>
        row.mapping === mapping &&
        row.button === button &&
        row.modifiers.length === modifiers.length &&
        row.modifiers.every((name) => modifiers.includes(name)),
    );
  const unlisted: Array<
    Readonly<{
      mapping: CameraMappingId;
      button: CameraDragButton;
      modifiers: readonly CameraModifier[];
    }>
  > = [];
  for (const mapping of mappingIds) {
    for (const button of buttons) {
      for (const modifiers of modifierSets) {
        if (!isListed(mapping, button, modifiers)) {
          unlisted.push({ mapping, button, modifiers });
        }
      }
    }
  }

  it('covers every combination once', () => {
    expect(listedDrags.length + unlisted.length).toBe(mappingIds.length * buttons.length * modifierSets.length);
  });

  it.each(unlisted)('$mapping: $modifiers + $button drag does nothing', ({ mapping, button, modifiers }) => {
    expect(resolveDrag(mapping, button, toModifiers(modifiers))).toBe('none');
  });

  it('lists exactly the rows the data holds', () => {
    const fromData = mappingIds.flatMap((mapping) =>
      cameraMappings[mapping].drag.map((binding) => ({
        mapping,
        button: binding.button,
        modifiers: [...binding.modifiers],
        gesture: binding.gesture,
      })),
    );
    expect(fromData).toEqual(expect.arrayContaining(listedDrags));
    expect(fromData).toHaveLength(listedDrags.length);
  });
});

describe('resolveWheel', () => {
  it.each(
    cameraPresetIds.flatMap((mapping) =>
      modifierSets.flatMap((modifiers) => [
        { mapping, pinch: false, modifiers },
        { mapping, pinch: true, modifiers },
      ]),
    ),
  )('$mapping: a wheel (pinch $pinch) with $modifiers zooms', ({ mapping, pinch, modifiers }) => {
    expect(resolveWheel(mapping, { pinch, modifiers: toModifiers(modifiers) })).toBe('zoom');
  });

  it.each([
    { pinch: false, modifiers: [], gesture: 'pan' },
    { pinch: false, modifiers: ['shift'], gesture: 'pan' },
    { pinch: false, modifiers: ['alt'], gesture: 'orbit' },
    { pinch: true, modifiers: [], gesture: 'zoom' },
    { pinch: true, modifiers: ['alt'], gesture: 'zoom' },
  ] as const)('trackpad: a wheel (pinch $pinch) with $modifiers → $gesture', ({ pinch, modifiers, gesture }) => {
    expect(resolveWheel('trackpad', { pinch, modifiers: toModifiers(modifiers) })).toBe(gesture);
  });
});

describe('resolveCameraMapping', () => {
  it.each([
    { preset: undefined, inputDevice: undefined, mapping: 'tau' },
    { preset: 'alt', inputDevice: undefined, mapping: 'alt' },
    { preset: 'alt', inputDevice: 'mouse', mapping: 'alt' },
    { preset: 'alt', inputDevice: 'trackpad', mapping: 'trackpad' },
    { preset: undefined, inputDevice: 'trackpad', mapping: 'trackpad' },
  ] as const)('preset $preset on $inputDevice → $mapping', ({ preset, inputDevice, mapping }) => {
    expect(resolveCameraMapping({ preset, inputDevice })).toBe(mapping);
  });
});

describe('toCameraDragButton', () => {
  it.each([
    { button: 0, name: 'left' },
    { button: 1, name: 'middle' },
    { button: 2, name: 'right' },
    { button: 3, name: undefined },
    { button: 4, name: undefined },
  ])('button $button is $name', ({ button, name }) => {
    expect(toCameraDragButton(button)).toBe(name);
  });
});
