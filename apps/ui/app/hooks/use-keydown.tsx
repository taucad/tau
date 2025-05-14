import { useEffect, useCallback, useMemo } from 'react';
import { formatKeyCombination } from '~/utils/keys.js';
import type { KeyCombination } from '~/utils/keys.js';

type KeydownOptions = {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  repeat?: boolean;
};

/**
 * Hook to handle keyboard shortcuts
 */
export const useKeydown = (
  combo: KeyCombination,
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
} => {
  const { preventDefault = true, stopPropagation = true, repeat = false } = options;

  const handler = useCallback(
    (event: KeyboardEvent) => {
      if (!repeat && event.repeat) return;

      const matches =
        event.key.toLowerCase() === combo.key.toLowerCase() &&
        Boolean(event.metaKey) === Boolean(combo.metaKey) &&
        Boolean(event.ctrlKey) === Boolean(combo.ctrlKey) &&
        Boolean(event.altKey) === Boolean(combo.altKey) &&
        Boolean(event.shiftKey) === Boolean(combo.shiftKey);

      if (matches) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        callback(event);
      }
    },
    [callback, combo, preventDefault, stopPropagation, repeat],
  );

  useEffect(() => {
    globalThis.addEventListener('keydown', handler);
    return () => {
      globalThis.removeEventListener('keydown', handler);
    };
  }, [handler]);

  const formattedKeyCombination = useMemo(() => formatKeyCombination(combo), [combo]);

  return {
    originalKeyCombination: combo,
    formattedKeyCombination,
  };
};
