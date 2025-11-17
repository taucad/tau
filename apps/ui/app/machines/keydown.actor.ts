import { fromCallback } from 'xstate';

/**
 * Keydown Listener Actor
 * Listens to keyboard events and sends back key state changes
 */
export const keydownListener = fromCallback<
  { type: 'keyStateChanged'; key: string; isPressed: boolean },
  { key: string }
>(({ sendBack, input }) => {
  const { key } = input;

  // Track current key state to avoid redundant events
  let isPressed = false;

  /**
   * Handle keydown events
   */
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === key && !isPressed) {
      isPressed = true;
      sendBack({
        type: 'keyStateChanged',
        key,
        isPressed: true,
      });
    }
  };

  /**
   * Handle keyup events
   */
  const handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key === key && isPressed) {
      isPressed = false;
      sendBack({
        type: 'keyStateChanged',
        key,
        isPressed: false,
      });
    }
  };

  // Add event listeners
  globalThis.addEventListener('keydown', handleKeyDown);
  globalThis.addEventListener('keyup', handleKeyUp);

  // Cleanup function - remove listeners when actor stops
  return () => {
    globalThis.removeEventListener('keydown', handleKeyDown);
    globalThis.removeEventListener('keyup', handleKeyUp);
  };
});
