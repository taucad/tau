import { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ClassValue } from 'clsx';
import { cn } from '#utils/ui.js';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { useChatSelector } from '#components/chat/ai-chat-provider.js';

type ChatStatusProperties = {
  readonly className?: ClassValue;
};

export const ChatStatus = memo(function ({ className }: ChatStatusProperties) {
  const status = useChatSelector((state) => state.context.status);
  const isVisible = status === 'streaming';

  return (
    <div className={cn(className)}>
      <AnimatePresence>
        {isVisible ? (
          <motion.div
            className="absolute inset-x-0 mx-3.5 flex items-center justify-between overflow-clip rounded-t-md border bg-background text-sm text-muted-foreground pl-2 pr-1 py-1 select-none"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex w-full items-center gap-2">
              <HammerAnimation className="size-5" />
              <AnimatedShinyText className="italic">Building...</AnimatedShinyText>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
