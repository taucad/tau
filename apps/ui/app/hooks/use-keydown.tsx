import * as React from 'react';

type KeydownOptions = {
  key: string;
  callback: (event: KeyboardEvent) => void;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** If true, requires all specified modifiers. If false, any of the specified modifiers will trigger the callback. */
  requireAllModifiers?: boolean;
};

/**
 * A hook that listens for keyboard events and executes a callback when the specified key is pressed.
 * @param options The options for the keydown event
 * @param options.key The key to listen for
 * @param options.callback The callback to execute when the key is pressed
 * @param options.metaKey Whether the meta key (Command on Mac, Windows key on Windows) must be pressed
 * @param options.ctrlKey Whether the control key must be pressed
 * @param options.altKey Whether the alt key must be pressed
 * @param options.shiftKey Whether the shift key must be pressed
 * @param options.requireAllModifiers If true, requires all specified modifiers. If false, any of the specified modifiers will trigger the callback.
 */
export function useKeydown({
  key,
  callback,
  metaKey,
  ctrlKey,
  altKey,
  shiftKey,
  requireAllModifiers = false,
}: KeydownOptions) {
  // Keep a reference to the callback to avoid recreating the handler on every render
  const callbackReference = React.useRef(callback);
  React.useEffect(() => {
    callbackReference.current = callback;
  }, [callback]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if any modifiers are specified
      const hasModifiers = metaKey || ctrlKey || altKey || shiftKey;

      // If no modifiers are specified, just check the key
      if (!hasModifiers) {
        if (event.key === key) {
          event.preventDefault();
          callbackReference.current(event);
        }
        return;
      }

      // Check modifiers based on requireAllModifiers flag
      const modifiersMatch = requireAllModifiers
        ? (!metaKey || event.metaKey) &&
          (!ctrlKey || event.ctrlKey) &&
          (!altKey || event.altKey) &&
          (!shiftKey || event.shiftKey)
        : (metaKey && event.metaKey) ||
          (ctrlKey && event.ctrlKey) ||
          (altKey && event.altKey) ||
          (shiftKey && event.shiftKey);

      if (event.key === key && modifiersMatch) {
        event.preventDefault();
        callbackReference.current(event);
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [key, metaKey, ctrlKey, altKey, shiftKey, requireAllModifiers]);
}
