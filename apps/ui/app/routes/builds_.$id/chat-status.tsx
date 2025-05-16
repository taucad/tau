import { memo } from 'react';
import type { useChat } from '@ai-sdk/react';
import { motion, AnimatePresence } from 'motion/react';
import type { ClassValue } from 'clsx';
import { cn } from '~/utils/ui.js';
import { AnimatedShinyText } from '~/components/magicui/animated-shiny-text.js';
import { HammerAnimation } from '~/components/hammer-animation.js';

type ChatStatusProperties = {
  readonly status: ReturnType<typeof useChat>['status'];
  readonly className?: ClassValue;
};

export const ChatStatus = memo(function ({ status, className }: ChatStatusProperties) {
  const isVisible = status === 'streaming';

  return (
    <div className={cn(className)}>
      <AnimatePresence>
        {isVisible ? (
          <motion.div
            className="absolute inset-x-0 mx-3.5 flex items-center justify-start overflow-clip rounded-2xl border bg-background text-sm text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex w-full items-center gap-1.5 bg-neutral/10 px-3 pt-2 pb-5">
              <HammerAnimation className="h-6 w-6" />
              <AnimatedShinyText>Generating...</AnimatedShinyText>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
