import { fromCallback } from 'xstate';

/**
 * Arrow Key Listener Actor
 * Listens to arrow key presses on a specific element and sends back arrow key events.
 */
export const arrowKeyListener = fromCallback<
  { type: 'arrowKeyPressed'; direction: 'up' | 'down' },
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- ref can be null.
  { elementRef: React.RefObject<HTMLElement | null> }
>(({ sendBack, input }) => {
  const { elementRef } = input;

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Prevent default behavior (cursor movement)
      event.preventDefault();

      sendBack({
        type: 'arrowKeyPressed',
        direction: event.key === 'ArrowUp' ? 'up' : 'down',
      });
    }
  };

  // Add event listener to the element if it exists
  const element = elementRef.current;
  if (!element) {
    return () => {
      // No-op cleanup
    };
  }

  element.addEventListener('keydown', handleKeyDown);

  // Cleanup function - remove listener when actor stops
  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
});
