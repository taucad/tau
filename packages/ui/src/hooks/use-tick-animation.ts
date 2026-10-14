import { useCallback, useEffect, useState } from 'react';

/**
 * Manages a transient "ticked" state that auto-resets after a timeout.
 * Useful for action-confirmation animations (e.g. showing a checkmark
 * after copying or resetting).
 * @public
 */
export function useTickAnimation(duration = 2000): {
  ticked: boolean;
  trigger: () => void;
} {
  const [ticked, setTicked] = useState(false);

  useEffect(() => {
    if (!ticked) {
      return;
    }

    const timer = setTimeout(() => {
      setTicked(false);
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [ticked, duration]);

  const trigger = useCallback(() => {
    setTicked(true);
  }, []);

  return { ticked, trigger };
}
