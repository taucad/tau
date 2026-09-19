import { useMemo } from 'react';
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import {
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableFooter,
  Table,
} from '@taucad/ui/components/table';
import { formatCreditAtoms } from '@taucad/billing';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { sumReceiptCredits, useReceiptCredits } from '#routes/w.$workspace.$project/chat-message-data-usage.js';

type UsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  parts: number;
};

/**
 * Project-wide chat usage: provider token counts aggregated locally, and Tau
 * credits taken from the funded operations' own receipts. No amount here is
 * derived from a local price (B4 R2/R3).
 *
 * @returns The usage panel, or nothing when the project has no recorded usage.
 */
export function ChatDetailsUsage(): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const { chats } = useChats(projectId);

  const { tokens, operationIds } = useMemo(() => {
    const usage: UsageTokens = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      parts: 0,
    };
    const ids = new Set<string>();

    for (const chat of chats) {
      for (const message of chat.messages) {
        for (const part of message.parts) {
          if (part.type !== 'data-usage') {
            continue;
          }
          usage.parts += 1;
          usage.inputTokens += part.data.inputTokens;
          usage.outputTokens += part.data.outputTokens;
          usage.cacheReadTokens += part.data.cacheReadTokens;
          usage.cacheWriteTokens += part.data.cacheWriteTokens;
          if (part.data.operationId !== undefined) {
            ids.add(part.data.operationId);
          }
        }
      }
    }

    return { tokens: usage, operationIds: [...ids].sort() };
  }, [chats]);

  const credits = useReceiptCredits(operationIds);
  const total = sumReceiptCredits(operationIds, credits);

  if (tokens.parts === 0) {
    return undefined;
  }

  const totalTokens = tokens.inputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;

  return (
    <section aria-label='Chat usage' className='@container overflow-hidden rounded-xl border border-border bg-card'>
      <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Chat usage</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className=''>Metric</TableHead>
            <TableHead className='text-right'>Tokens</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className='flex flex-row items-center gap-1'>
              <span className='@[16rem]:hidden'>IN</span>
              <span className='hidden @[16rem]:inline'>Input</span>
              <InfoTooltip>
                The number of tokens in input prompts across all chats. This includes user prompts, system messages, and
                conversation history.
              </InfoTooltip>
            </TableCell>
            <TableCell className='text-right font-mono'>{formatNumberAbbreviation(tokens.inputTokens)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className='flex flex-row items-center gap-1'>
              <span className='@[16rem]:hidden'>OUT</span>
              <span className='hidden @[16rem]:inline'>Output</span>
              <InfoTooltip>The number of tokens in output responses across all chats.</InfoTooltip>
            </TableCell>
            <TableCell className='text-right font-mono'>{formatNumberAbbreviation(tokens.outputTokens)}</TableCell>
          </TableRow>
          {tokens.cacheReadTokens > 0 && (
            <TableRow>
              <TableCell className='flex flex-row items-center gap-1'>
                <span className='@[16rem]:hidden'>CR</span>
                <span className='hidden @[16rem]:inline'>Cache Read</span>
                <InfoTooltip>
                  The number of tokens read from the prompt cache. This improves performance by avoiding re-processing
                  the same prompt.
                </InfoTooltip>
              </TableCell>
              <TableCell className='text-right font-mono'>{formatNumberAbbreviation(tokens.cacheReadTokens)}</TableCell>
            </TableRow>
          )}
          {tokens.cacheWriteTokens > 0 ? (
            <TableRow>
              <TableCell className='flex flex-row items-center gap-1'>
                <span className='@[16rem]:hidden'>CW</span>
                <span className='hidden @[16rem]:inline'>Cache Write</span>
                <InfoTooltip>
                  The number of tokens written to the prompt cache. This improves performance by avoiding re-processing
                  the same prompt.
                </InfoTooltip>
              </TableCell>
              <TableCell className='text-right font-mono'>
                {formatNumberAbbreviation(tokens.cacheWriteTokens)}
              </TableCell>
            </TableRow>
          ) : undefined}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell className='text-right font-mono'>{formatNumberAbbreviation(totalTokens)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className='border-t px-3 py-2 text-xs text-muted-foreground'>
        {operationIds.length === 0 ? (
          'No Tau-funded turns in this project.'
        ) : (
          <>
            <span className='font-mono text-foreground'>{formatCreditAtoms(total.creditAtoms)}</span> credits charged
            {total.pending > 0 ? ` · ${String(total.pending)} pending` : ''}
          </>
        )}
      </p>
    </section>
  );
}
