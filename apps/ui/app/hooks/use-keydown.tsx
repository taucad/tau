import { useEffect, useCallback, useMemo } from 'react';
import { formatKeyCombination, type KeyCombination } from '@/utils/keys';

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
        !!event.metaKey === !!combo.metaKey &&
        !!event.ctrlKey === !!combo.ctrlKey &&
        !!event.altKey === !!combo.altKey &&
        !!event.shiftKey === !!combo.shiftKey;

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
    return () => globalThis.removeEventListener('keydown', handler);
  }, [handler]);

  const formattedKeyCombination = useMemo(() => formatKeyCombination(combo), [combo]);

  return {
    originalKeyCombination: combo,
    formattedKeyCombination,
  };
};
