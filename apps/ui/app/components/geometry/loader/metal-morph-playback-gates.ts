import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * The conditions under which a liquid-metal surface is allowed to animate, shared by the dedicated loader and
 * the spinners that draw from the shared service so both obey the same rules: hold a still frame under
 * reduced motion, and stop entirely while the tab is hidden or the surface has scrolled out of view.
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
/** The server assumes reduced motion, so the first client paint is a still frame rather than a jump. */
const serverMotion = (): boolean => true;

const subscribeDocumentVisibility = (callback: () => void): (() => void) => {
  document.addEventListener('visibilitychange', callback);
  return () => {
    document.removeEventListener('visibilitychange', callback);
  };
};
const getDocumentHidden = (): boolean => document.hidden;
const serverDocumentHidden = (): boolean => false;

/** True while the visitor asks for reduced motion. */
export const useReducedMotion = (): boolean => useSyncExternalStore(subscribeMotion, getMotion, serverMotion);

/** True while the tab is in the background. */
export const useDocumentHidden = (): boolean =>
  useSyncExternalStore(subscribeDocumentVisibility, getDocumentHidden, serverDocumentHidden);

/**
 * True while `element` is within the viewport; false until the observer has reported once.
 *
 * It takes the element rather than a ref so the observer attaches on the commit that produced it, which a
 * caller supplies from a callback ref.
 */
export const useIsIntersecting = (element: Element | undefined): boolean => {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);

  return isIntersecting;
};
