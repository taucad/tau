import { useSyncExternalStore } from 'react';

/*
 * The visitor's reduced-motion preference, as the app's liquid-metal playback gates read it: the server assumes
 * reduced motion, so the first client paint is a still frame rather than a jump.
 */

const motionQuery = '(prefers-reduced-motion: reduce)';

const subscribeMotion = (callback: () => void): (() => void) => {
  const query = globalThis.matchMedia(motionQuery);
  query.addEventListener('change', callback);
  return () => {
    query.removeEventListener('change', callback);
  };
};
const getMotion = (): boolean => globalThis.matchMedia(motionQuery).matches;
const serverMotion = (): boolean => true;

/**
 * True while the visitor asks for reduced motion.
 *
 * @returns Whether reduced motion is requested.
 */
export const useReducedMotion = (): boolean => useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
