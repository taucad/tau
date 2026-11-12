/**
 * Camera presets as data: which button and modifiers orbit, pan and zoom under each mouse preset (P1 to P6 of the
 * camera research) and under the trackpad mapping (P7), and the pure resolvers the input router applies.
 *
 * A binding matches only its exact modifier set, so a button and modifier combination a preset does not list does not
 * move the camera (C8). The wheel is not a drag: under every mouse preset it zooms, whatever modifiers it carries, so a
 * trackpad pinch (a `ctrlKey` wheel) zooms as a plain wheel does (PF1).
 */

/**
 * The mouse presets, P1 to P6 in the camera research's order. Trackpad gestures are an input device, not a preset.
 *
 * @public
 */
export const cameraPresetIds = ['tau', 'right-orbit', 'middle-ctrl', 'middle-shift', 'shift-middle', 'alt'] as const;

/**
 * One of {@link cameraPresetIds}.
 *
 * @public
 */
export type CameraPresetId = (typeof cameraPresetIds)[number];

/**
 * What the person navigates with on this device. `trackpad` replaces the mouse preset with the trackpad mapping (P7).
 *
 * @public
 */
export const cameraInputDevices = ['mouse', 'trackpad'] as const;

/**
 * One of {@link cameraInputDevices}.
 *
 * @public
 */
export type CameraInputDevice = (typeof cameraInputDevices)[number];

/**
 * The mapping the router applies: a mouse preset, or the trackpad mapping.
 *
 * @public
 */
export type CameraMappingId = CameraPresetId | 'trackpad';

/**
 * What a gesture does to the camera. `none` leaves it where it is.
 *
 * @public
 */
export type CameraGesture = 'orbit' | 'pan' | 'zoom' | 'none';

/**
 * A mouse button by its `PointerEvent.button` number name.
 *
 * @public
 */
export type CameraDragButton = 'left' | 'middle' | 'right';

/**
 * The modifiers a gesture carries. `ctrl` is Control, or Command on macOS.
 *
 * @public
 */
export type CameraModifiers = Readonly<{
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}>;

/**
 * A modifier a binding names.
 *
 * @public
 */
export type CameraModifier = keyof CameraModifiers;

/**
 * One drag binding: a button and the exact set of modifiers held with it.
 *
 * @public
 */
export type CameraDragBinding = Readonly<{
  button: CameraDragButton;
  modifiers: readonly CameraModifier[];
  gesture: Exclude<CameraGesture, 'none'>;
}>;

/**
 * One wheel binding. `pinch` is a trackpad pinch: a `ctrlKey` wheel, or a Safari gesture.
 *
 * @public
 */
export type CameraWheelBinding = Readonly<{
  input: 'scroll' | 'pinch';
  modifiers: readonly CameraModifier[];
  gesture: Exclude<CameraGesture, 'none'>;
}>;

/**
 * A mapping's bindings, and its number in the camera research.
 *
 * @public
 */
export type CameraMapping = Readonly<{
  id: CameraMappingId;
  /** The camera research's preset number, kept for cross-reference. */
  ref: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7';
  drag: readonly CameraDragBinding[];
  wheel: readonly CameraWheelBinding[];
}>;

const mouseWheel: readonly CameraWheelBinding[] = [{ input: 'scroll', modifiers: [], gesture: 'zoom' }];

/**
 * Every mapping's bindings (blueprint C1 to C7).
 *
 * @public
 */
export const cameraMappings: Readonly<Record<CameraMappingId, CameraMapping>> = Object.freeze({
  tau: {
    id: 'tau',
    ref: 'P1',
    drag: [
      { button: 'left', modifiers: [], gesture: 'orbit' },
      { button: 'right', modifiers: [], gesture: 'pan' },
      { button: 'middle', modifiers: [], gesture: 'pan' },
      { button: 'left', modifiers: ['shift'], gesture: 'pan' },
    ],
    wheel: mouseWheel,
  },
  'right-orbit': {
    id: 'right-orbit',
    ref: 'P2',
    drag: [
      { button: 'right', modifiers: [], gesture: 'orbit' },
      { button: 'middle', modifiers: [], gesture: 'pan' },
      { button: 'right', modifiers: ['ctrl'], gesture: 'pan' },
    ],
    wheel: mouseWheel,
  },
  'middle-ctrl': {
    id: 'middle-ctrl',
    ref: 'P3',
    drag: [
      { button: 'middle', modifiers: [], gesture: 'orbit' },
      { button: 'middle', modifiers: ['ctrl'], gesture: 'pan' },
      { button: 'middle', modifiers: ['shift'], gesture: 'zoom' },
    ],
    wheel: mouseWheel,
  },
  'middle-shift': {
    id: 'middle-shift',
    ref: 'P4',
    drag: [
      { button: 'middle', modifiers: [], gesture: 'orbit' },
      { button: 'middle', modifiers: ['shift'], gesture: 'pan' },
      { button: 'middle', modifiers: ['ctrl'], gesture: 'zoom' },
    ],
    wheel: mouseWheel,
  },
  'shift-middle': {
    id: 'shift-middle',
    ref: 'P5',
    drag: [
      { button: 'middle', modifiers: ['shift'], gesture: 'orbit' },
      { button: 'middle', modifiers: [], gesture: 'pan' },
    ],
    wheel: mouseWheel,
  },
  alt: {
    id: 'alt',
    ref: 'P6',
    drag: [
      { button: 'left', modifiers: ['alt'], gesture: 'orbit' },
      { button: 'middle', modifiers: ['alt'], gesture: 'pan' },
      { button: 'right', modifiers: ['alt'], gesture: 'zoom' },
    ],
    wheel: mouseWheel,
  },
  trackpad: {
    id: 'trackpad',
    ref: 'P7',
    drag: [
      { button: 'left', modifiers: [], gesture: 'orbit' },
      { button: 'left', modifiers: ['shift'], gesture: 'pan' },
    ],
    wheel: [
      { input: 'scroll', modifiers: [], gesture: 'pan' },
      { input: 'scroll', modifiers: ['alt'], gesture: 'orbit' },
      { input: 'pinch', modifiers: [], gesture: 'zoom' },
    ],
  },
});

const modifierNames: readonly CameraModifier[] = ['shift', 'ctrl', 'alt'];

const matchesModifiers = (binding: readonly CameraModifier[], modifiers: CameraModifiers): boolean =>
  modifierNames.every((name) => binding.includes(name) === modifiers[name]);

const dragButtons: readonly CameraDragButton[] = ['left', 'middle', 'right'];

/**
 * The drag button a `PointerEvent.button` number names, or `undefined` for the back and forward buttons.
 *
 * @param button - The `PointerEvent.button` number of the press.
 * @returns `left`, `middle` or `right`.
 * @public
 */
export const toCameraDragButton = (button: number): CameraDragButton | undefined => dragButtons[button];

/**
 * The mapping in effect: the trackpad mapping on a trackpad device, else the mouse preset (Tau's default when absent).
 *
 * @param input - The stored or suggested preset and this device's input device.
 * @returns The mapping the router applies.
 * @public
 */
export const resolveCameraMapping = ({
  preset,
  inputDevice,
}: Readonly<{
  preset?: CameraPresetId;
  inputDevice?: CameraInputDevice;
}>): CameraMappingId => (inputDevice === 'trackpad' ? 'trackpad' : (preset ?? 'tau'));

/**
 * What a drag with this button and these modifiers does under a mapping. A combination the mapping does not list does
 * nothing (C8).
 *
 * @param mapping - The mapping in effect.
 * @param button - The button held.
 * @param modifiers - The modifiers held at the press.
 * @returns The gesture.
 * @public
 * @example <caption>SolidWorks' pan</caption>
 * ```typescript
 * import { resolveDrag } from '@taucad/viewer/graphics/three/controls/camera-presets';
 *
 * console.log(resolveDrag('middle-ctrl', 'middle', { shift: false, ctrl: true, alt: false })); // 'pan'
 * ```
 */
export const resolveDrag = (
  mapping: CameraMappingId,
  button: CameraDragButton,
  modifiers: CameraModifiers,
): CameraGesture =>
  cameraMappings[mapping].drag.find(
    (binding) => binding.button === button && matchesModifiers(binding.modifiers, modifiers),
  )?.gesture ?? 'none';

/**
 * What a wheel step does under a mapping. Under a mouse preset the wheel zooms with any modifiers, a pinch included.
 * Under the trackpad mapping a pinch zooms, an Alt scroll orbits and every other scroll pans.
 *
 * @param mapping - The mapping in effect.
 * @param input - Whether the step is a pinch, and the modifiers it carries (a pinch's own `ctrlKey` excluded).
 * @returns The gesture.
 * @public
 */
export const resolveWheel = (
  mapping: CameraMappingId,
  input: Readonly<{ pinch: boolean; modifiers: CameraModifiers }>,
): CameraGesture => {
  if (mapping !== 'trackpad') {
    return 'zoom';
  }
  if (input.pinch) {
    return 'zoom';
  }
  return input.modifiers.alt ? 'orbit' : 'pan';
};
