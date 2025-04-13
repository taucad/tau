export type KeyCombination = Pick<KeyboardEvent, 'key'> &
  Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>> & {
    /**
     * Whether to require all modifiers to be pressed
     */
    requireAllModifiers?: boolean;
  };

/**
 * Formats special keys into symbols or readable names
 */
const formatKey = (key: KeyCombination['key']): string => {
  /* eslint-disable @typescript-eslint/naming-convention -- these are the key codes from the KeyboardEvent interface */
  const specialKeys: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: '↵',
    Escape: 'Esc',
    Backspace: '⌫',
    Delete: 'Del',
    ' ': 'Space',
  };
  /* eslint-enable @typescript-eslint/naming-convention -- these are the key codes from the KeyboardEvent interface */

  const specialKey = specialKeys[key];

  if (specialKey) return specialKey;

  return key.length === 1 ? key.toUpperCase() : key;
};

/**
 * Formats a key combination into platform-specific notation
 */
export const formatKeyCombination = (combo: KeyCombination): string => {
  // TODO: Add support for non-mac platforms
  // const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
  const parts: string[] = [];

  // Add modifiers in the correct order
  if (combo.altKey) parts.push('⌥');
  if (combo.shiftKey) parts.push('⇧');
  if (combo.metaKey && combo.ctrlKey) parts.push('⌘');
  if (combo.metaKey) parts.push('⌘');
  if (combo.ctrlKey) parts.push('⌃');

  // Format the main key
  const formattedKey = formatKey(combo.key);
  if (formattedKey) parts.push(formattedKey);

  return parts.join('');
};
