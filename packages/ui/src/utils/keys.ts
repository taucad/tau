import { serverPlatform } from '#utils/platform.js';

/**
 * A key and the modifiers pressed with it; `modKey` is Command on macOS and Control elsewhere.
 *
 * @public
 */
export type KeyCombination = Pick<KeyboardEvent, 'key'> &
  Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>> & {
    /**
     * Whether to require all modifiers to be pressed
     */
    requireAllModifiers?: boolean;
    /**
     * Platform-aware "primary modifier". Resolves to Cmd (metaKey) on macOS, Ctrl (ctrlKey) elsewhere.
     * Equivalent to VS Code's KeyMod.CtrlCmd.
     * When true, do not set `metaKey` or `ctrlKey` alongside it.
     */
    modKey?: boolean;
  };

/**
 * Detected platform for matching real key events.
 * Set by KeyboardProvider on mount; defaults to `serverPlatform` until then.
 *
 * Formatting a label from this value during a render is a hydration hazard, because it
 * flips once the provider has mounted while the server markup still reads `⌘`. Rendered
 * labels pass the platform from `usePlatform` (`@taucad/ui/hooks/use-platform`) instead.
 */
let detectedPlatform: 'mac' | 'other' = serverPlatform;

/**
 * Sets the detected platform. Called by KeyboardProvider on mount.
 * @public
 */
export function setPlatform(platform: 'mac' | 'other'): void {
  detectedPlatform = platform;
}

/**
 * Returns the currently detected platform.
 * @public
 */
export function getPlatform(): 'mac' | 'other' {
  return detectedPlatform;
}

/* eslint-disable @typescript-eslint/naming-convention -- these are the key codes from the KeyboardEvent interface */
const specialKeys: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '⏎',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: 'Del',
  ' ': 'Space',
  Shift: '⇧',
  Control: '⌃',
  Alt: '⌥',
  Meta: '⌘',
};
/* eslint-enable @typescript-eslint/naming-convention -- these are the key codes from the KeyboardEvent interface */

/**
 * Formats special keys into symbols or readable names
 */
const formatKey = (key: KeyCombination['key']): string => {
  const specialKey = specialKeys[key];

  if (specialKey) {
    return specialKey;
  }

  return key.length === 1 ? key.toUpperCase() : key;
};

/**
 * Formats a key combination into platform-specific notation.
 *
 * @param combo - The combination to label.
 * @param platform - The platform to label it for. A render passes `usePlatform()`
 *   (`@taucad/ui/hooks/use-platform`), which keeps the label stable through hydration;
 *   the default suits callers outside a render.
 * @public
 */
export function formatKeyCombination(combo: KeyCombination, platform: 'mac' | 'other' = detectedPlatform): string {
  const isMac = platform === 'mac';
  const parts: string[] = [];

  // Resolve modKey to the platform-specific modifier
  const effectiveMetaKey = combo.modKey ? isMac : Boolean(combo.metaKey);
  const effectiveCtrlKey = combo.modKey ? !isMac : Boolean(combo.ctrlKey);

  // Add modifiers in the correct order
  if (combo.altKey) {
    parts.push(isMac ? '⌥' : 'Alt+');
  }

  if (combo.shiftKey) {
    parts.push(isMac ? '⇧' : 'Shift+');
  }

  if (effectiveMetaKey && effectiveCtrlKey) {
    parts.push(isMac ? '⌘' : 'Ctrl+');
  } else if (effectiveMetaKey) {
    parts.push(isMac ? '⌘' : 'Win+');
  } else if (effectiveCtrlKey) {
    parts.push(isMac ? '⌃' : 'Ctrl+');
  }

  // Format the main key
  const formattedKey = formatKey(combo.key);
  if (formattedKey) {
    parts.push(formattedKey);
  }

  return parts.join('');
}

/**
 * Formats a key combination as an `aria-keyshortcuts` value (modifiers first,
 * `+`-joined, the platform's modifier for `modKey`).
 *
 * @param combo - The combination to describe.
 * @param platform - The platform to describe it for, as {@link formatKeyCombination}.
 * @public
 */
export function ariaKeyShortcuts(combo: KeyCombination, platform: 'mac' | 'other' = detectedPlatform): string {
  const isMac = platform === 'mac';
  return [
    (combo.modKey ? !isMac : combo.ctrlKey) && 'Control',
    combo.altKey && 'Alt',
    combo.shiftKey && 'Shift',
    (combo.modKey ? isMac : combo.metaKey) && 'Meta',
    combo.key === ' ' ? 'Space' : combo.key,
  ]
    .filter(Boolean)
    .join('+');
}
