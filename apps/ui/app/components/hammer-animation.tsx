import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { motion } from 'motion/react';
import { Tau } from '~/components/icons/tau.js';

// Inner component that handles the animation and triggers particles
export function HammerAnimation({ className }: { readonly className?: string }): JSX.Element {
  const hammerRef = useRef<HTMLDivElement>(null);
  const [isHitting, setIsHitting] = useState(false);

  // Hammer animation
  useEffect(() => {
    const interval = setInterval(() => {
      // Start the hammer animation
      setIsHitting(true);

      // Reset hammer position after hit animation
      setTimeout(() => {
        setIsHitting(false);
      }, 400);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <motion.div
      ref={hammerRef}
      className={className}
      style={{
        width: 24,
        height: 24,
        transformOrigin: '50% 80%',
        zIndex: 10,
      }}
      animate={
        isHitting
          ? {
              rotate: 30,
              y: -2,
            }
          : {
              rotate: 0,
              y: 0,
            }
      }
      transition={{
        type: 'spring',
        damping: 8,
        stiffness: 400,
      }}
    >
      <Tau className="size-6 [&_path]:fill-primary [&_rect]:fill-transparent" />
    </motion.div>
  );
}
