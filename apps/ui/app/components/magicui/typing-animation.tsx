import type { MotionProps } from 'motion/react';
import { motion } from 'motion/react';
import { createElement, useEffect, useState } from 'react';
import { cn } from '@taucad/ui/utils/cn';

type TypingAnimationProps = {
  readonly children: string;
  readonly className?: string;
  readonly duration?: number;
  readonly startDelay?: number;
  readonly as?: React.ElementType;
  readonly shouldStartOnView?: boolean;
} & MotionProps;

const motionComponentCache = new Map<React.ElementType, ReturnType<typeof motion.create>>();

const getMotionComponent = (component: React.ElementType): ReturnType<typeof motion.create> => {
  const cached = motionComponentCache.get(component);
  if (cached) {
    return cached;
  }

  const created = motion.create(component, { forwardMotionProps: true });
  motionComponentCache.set(component, created);
  return created;
};

export function TypingAnimation({
  children,
  className,
  duration = 100,
  startDelay = 0,
  as: Component = 'div',
  shouldStartOnView = false,
  ...props
}: TypingAnimationProps): React.JSX.Element {
  const MotionComponent = getMotionComponent(Component);

  const [displayedText, setDisplayedText] = useState<string>('');
  const [started, setStarted] = useState(false);
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!shouldStartOnView) {
      const startTimeout = setTimeout(() => {
        setStarted(true);
      }, startDelay);
      return () => {
        clearTimeout(startTimeout);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setTimeout(() => {
            setStarted(true);
          }, startDelay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (element) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, [element, startDelay, shouldStartOnView]);

  useEffect(() => {
    if (!started) {
      return;
    }

    let i = 0;
    const typingEffect = setInterval(() => {
      if (i < children.length) {
        setDisplayedText(children.slice(0, Math.max(0, i + 1)));
        i++;
      } else {
        clearInterval(typingEffect);
      }
    }, duration);

    return () => {
      clearInterval(typingEffect);
    };
  }, [children, duration, started]);

  return createElement(
    MotionComponent as React.ElementType,
    {
      ref: setElement,
      className: cn('text-4xl leading-[5rem] font-bold tracking-[-0.02em]', className),
      ...props,
    },
    displayedText,
  );
}
