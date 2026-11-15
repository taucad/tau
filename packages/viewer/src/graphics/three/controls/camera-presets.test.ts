import { describe, expect, it } from 'vitest';
import {
  cameraMappings,
  cameraPresetIds,
  resolveDrag,
  toCameraDragButton,
} from '#graphics/three/controls/camera-presets.js';
import type {
  CameraDragButton,
  CameraGesture,
  CameraModifier,
  CameraPresetId,
  CameraModifiers,
} from '#graphics/three/controls/camera-presets.js';

const toModifiers = (names: readonly CameraModifier[]): CameraModifiers => ({
  shift: names.includes('shift'),
  ctrl: names.includes('ctrl'),
  alt: names.includes('alt'),
});

/** Blueprint C1 to C6: every listed drag, by preset. */
const listedDrags: ReadonlyArray<
  Readonly<{
    mapping: CameraPresetId;
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
];

const mappingIds: readonly CameraPresetId[] = cameraPresetIds;
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
  const isListed = (mapping: CameraPresetId, button: CameraDragButton, modifiers: readonly CameraModifier[]): boolean =>
    listedDrags.some(
      (row) =>
        row.mapping === mapping &&
        row.button === button &&
        row.modifiers.length === modifiers.length &&
        row.modifiers.every((name) => modifiers.includes(name)),
    );
  const unlisted: Array<
    Readonly<{
      mapping: CameraPresetId;
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
    expect(fromData).toEqual(expect.arrayContaining([...listedDrags]));
    expect(fromData).toHaveLength(listedDrags.length);
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
