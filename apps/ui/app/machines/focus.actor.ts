import { fromCallback } from 'xstate';

/**
 * Focus Listener Actor
 * Listens to focus/blur events on an element and sends back focusStateChanged events.
 */
export const focusListener = fromCallback<
  { type: 'focusStateChanged'; isFocused: boolean },
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- ref can be null.
  { elementRef: React.RefObject<HTMLElement | null> }
>(({ sendBack, input }) => {
  const { elementRef } = input;

  const handleFocus = (): void => {
    sendBack({
      type: 'focusStateChanged',
      isFocused: true,
    });
  };

  const handleBlur = (): void => {
    sendBack({
      type: 'focusStateChanged',
      isFocused: false,
    });
  };

  // Add event listeners to the element if it exists
  const element = elementRef.current;
  if (!element) {
    return () => {
      // No-op cleanup
    };
  }

  element.addEventListener('focus', handleFocus);
  element.addEventListener('blur', handleBlur);

  // Cleanup function - remove listeners when actor stops
  return () => {
    element.removeEventListener('focus', handleFocus);
    element.removeEventListener('blur', handleBlur);
  };
});
