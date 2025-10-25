import { useEffect, useCallback, useMemo, useState } from 'react';
import { formatKeyCombination } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';

type KeydownOptions = {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  repeat?: boolean;
  enableKeydownCallback?: boolean;
  enableKeyupCallback?: boolean;
};

/**
 * Hook to handle keyboard shortcuts
 */
export function useKeydown(
  keyCombination: KeyCombination,
  callback: (event: KeyboardEvent) => void,
  options: KeydownOptions = {},
): {
  /**
   * The original key combination configuration
   */
  originalKeyCombination: KeyCombination;
  /**
   * The key combination, formatted by navigator platform
   */
  formattedKeyCombination: string;
  /**
   * Whether the key is currently pressed
   */
  isKeyPressed: boolean;
} {
  const {
    preventDefault = true,
    stopPropagation = true,
    repeat = false,
    enableKeydownCallback = true,
    enableKeyupCallback = false,
  } = options;
  const [isKeyPressed, setIsKeyPressed] = useState(false);

  const handler = useCallback(
    (event: KeyboardEvent) => {
      if (!repeat && event.repeat) {
        return;
      }

      // Check if the main key matches
      const keyMatches = event.key.toLowerCase() === keyCombination.key.toLowerCase();

      if (!keyMatches) {
        return;
      }

      // For modifier keys (Shift, Control, Alt, Meta), we don't check their own modifier state
      const isModifierKey = ['shift', 'control', 'alt', 'meta'].includes(keyCombination.key.toLowerCase());

      // Check modifier keys only if the target key is not itself a modifier
      const modifiersMatch =
        isModifierKey ||
        (Boolean(event.metaKey) === Boolean(keyCombination.metaKey) &&
          Boolean(event.ctrlKey) === Boolean(keyCombination.ctrlKey) &&
          Boolean(event.altKey) === Boolean(keyCombination.altKey) &&
          Boolean(event.shiftKey) === Boolean(keyCombination.shiftKey));

      if (modifiersMatch) {
        if (preventDefault) {
          event.preventDefault();
        }

        if (stopPropagation) {
          event.stopPropagation();
        }

        const isPressed = event.type === 'keydown';
        setIsKeyPressed(isPressed);

        // Call callback based on event type and options
        const shouldCallCallback = (isPressed && enableKeydownCallback) || (!isPressed && enableKeyupCallback);

        if (shouldCallCallback) {
          callback(event);
        }
      }
    },
    [callback, keyCombination, preventDefault, stopPropagation, repeat, enableKeydownCallback, enableKeyupCallback],
  );

  useEffect(() => {
    globalThis.addEventListener('keydown', handler);
    globalThis.addEventListener('keyup', handler);

    return () => {
      globalThis.removeEventListener('keydown', handler);
      globalThis.removeEventListener('keyup', handler);
    };
  }, [handler]);

  const formattedKeyCombination = useMemo(() => formatKeyCombination(keyCombination), [keyCombination]);

  return {
    originalKeyCombination: keyCombination,
    formattedKeyCombination,
    isKeyPressed,
  };
}
