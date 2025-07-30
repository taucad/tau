import type { MotionProps } from 'motion/react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '#utils/ui.js';

type TypingAnimationProps = {
  readonly children: string;
  readonly className?: string;
  readonly duration?: number;
  readonly delay?: number;
  readonly as?: React.ElementType;
  readonly shouldStartOnView?: boolean;
} & MotionProps;

export function TypingAnimation({
  children,
  className,
  duration = 100,
  delay = 0,
  as: Component = 'div',
  shouldStartOnView = false,
  ...props
}: TypingAnimationProps): React.JSX.Element {
  const MotionComponent = motion.create(Component, {
    forwardMotionProps: true,
  });

  const [displayedText, setDisplayedText] = useState<string>('');
  const [started, setStarted] = useState(false);
  const elementRef = useRef<HTMLElement | undefined>(null);

  useEffect(() => {
    if (!shouldStartOnView) {
      const startTimeout = setTimeout(() => {
        setStarted(true);
      }, delay);
      return () => {
        clearTimeout(startTimeout);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setTimeout(() => {
            setStarted(true);
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [delay, shouldStartOnView]);

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

  return (
    <MotionComponent
      ref={elementRef}
      className={cn('text-4xl leading-[5rem] font-bold tracking-[-0.02em]', className)}
      {...props}
    >
      {displayedText}
    </MotionComponent>
  );
}
