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

  return specialKeys[key] || key.length === 1 ? key.toUpperCase() : key;
};

/**
 * Formats a key combination into platform-specific notation
 */
export const formatKeyCombination = (combo: KeyCombination): string => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
  const parts: string[] = [];

  // Add modifiers in the correct order
  if (combo.altKey) parts.push(isMac ? '⌥' : 'Alt+');
  if (combo.shiftKey) parts.push(isMac ? '⇧' : 'Shift+');
  if (combo.metaKey && combo.ctrlKey) parts.push(isMac ? '⌘' : 'Ctrl+');
  if (combo.metaKey) parts.push(isMac ? '⌘' : 'Ctrl+');
  if (combo.ctrlKey) parts.push(isMac ? '⌃' : 'Ctrl+');

  // Format the main key
  const formattedKey = formatKey(combo.key);
  if (formattedKey) parts.push(formattedKey);

  return parts.join('');
};
