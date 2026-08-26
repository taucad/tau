import process from 'node:process';
import { Logger } from '@nestjs/common';
import { isExpectedChatCancellationRejection } from '#api/chat/utils/chat-abort.js';

const handleApiUnhandledRejection = (reason: unknown): void => {
  if (isExpectedChatCancellationRejection(reason)) {
    return;
  }

  // Defense in depth against route-registration races. Vite dev serializes
  // init in Tau's custom adapter; standalone initializes before listening.
  if (reason instanceof Error && 'code' in reason && reason.code === 'FST_ERR_DUPLICATED_ROUTE') {
    Logger.error(
      `Suppressed Fastify duplicate-route registration: ${reason.message}. ` +
        `This indicates an unexpected concurrent app.init() - investigate.`,
      reason.stack,
      'Bootstrap',
    );
    return;
  }

  // Re-throw non-abort rejections so Node.js treats them as uncaught exceptions,
  // preserving the default crash-on-unhandled-rejection behavior.
  if (reason instanceof Error) {
    throw reason;
  }

  throw new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection');
};

export const installApiUnhandledRejectionHandler = (): (() => void) => {
  process.on('unhandledRejection', handleApiUnhandledRejection);

  return () => {
    process.off('unhandledRejection', handleApiUnhandledRejection);
  };
};
