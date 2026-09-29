import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { clampVisionTime, visionDuration } from '#routes/vision/vision-story.js';

/** A presentation clock; the scene reads its ref without rerendering the page every frame. */
export const useVisionPlayback = (): {
  clock: RefObject<number>;
  // oxlint-disable-next-line typescript/no-restricted-types -- React's DOM ref contract uses null before mount and after unmount.
  container: RefObject<HTMLElement | null>;
  time: number;
  isPlaying: boolean;
  isRunning: boolean;
  hasReducedMotion: boolean;
  seek: (time: number) => void;
  toggle: () => void;
} => {
  const clock = useRef(0);
  const container = useRef<HTMLElement>(null);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isHidden, setIsHidden] = useState(true);
  const [hasReducedMotion, setHasReducedMotion] = useState(true);
  const isRunning = isPlaying && isVisible && !isHidden && !hasReducedMotion;

  useEffect(() => {
    const query = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => {
      setHasReducedMotion(query.matches);
      if (query.matches) {
        setIsPlaying(false);
      }
    };
    const updateVisibility = () => {
      setIsHidden(document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry?.isIntersecting ?? false);
    });
    if (container.current) {
      observer.observe(container.current);
    }
    updateMotion();
    updateVisibility();
    query.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      observer.disconnect();
      query.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    let frame = 0;
    let last = performance.now();
    let lastPublished = last;
    const advance = (now: number) => {
      clock.current = clampVisionTime(clock.current + Math.min(now - last, 100) / 1000);
      last = now;
      // Prose and transport update at 10 Hz; Three reads the same clock at display rate.
      if (now - lastPublished >= 100 || clock.current === visionDuration) {
        setTime(clock.current);
        lastPublished = now;
      }
      if (clock.current === visionDuration) {
        setIsPlaying(false);
      } else {
        frame = requestAnimationFrame(advance);
      }
    };
    frame = requestAnimationFrame(advance);
    return () => {
      cancelAnimationFrame(frame);
      setTime(clock.current);
    };
  }, [isRunning]);

  const seek = useCallback((next: number) => {
    clock.current = clampVisionTime(next);
    setTime(clock.current);
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (hasReducedMotion) {
      return;
    }
    if (clock.current === visionDuration) {
      clock.current = 0;
      setTime(0);
    }
    setIsPlaying((value) => !value);
  }, [hasReducedMotion]);

  return { clock, container, time, isPlaying, isRunning, hasReducedMotion, seek, toggle };
};
