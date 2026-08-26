import { BadRequestException } from '@nestjs/common';
import { isAnyToolPart } from '@taucad/chat';
import type { MyUIMessage } from '@taucad/chat';

const hasApprovalLifecycle = (part: MyUIMessage['parts'][number]): boolean => {
  if (!isAnyToolPart(part)) {
    return false;
  }

  if (part.state === 'approval-requested' || part.state === 'approval-responded' || part.state === 'output-denied') {
    return true;
  }

  return 'approval' in part && part.approval !== undefined;
};

/**
 * Blocks tool approval histories before provider replay until the LangChain
 * adapter path preserves AI SDK approval request/response model parts.
 */
export const assertSupportedApprovalReplay = (messages: readonly MyUIMessage[]): void => {
  for (const message of messages) {
    for (const part of message.parts) {
      if (!hasApprovalLifecycle(part)) {
        continue;
      }

      throw new BadRequestException({
        message:
          'Tool approval replay is not supported yet. The approval lifecycle was preserved, but the provider adapter cannot safely replay it.',
        code: 'UNSUPPORTED_TOOL_APPROVAL_REPLAY',
      });
    }
  }
};
