import { useMemo } from 'react';
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import { TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter, Table } from '#components/ui/table.js';
import { formatCurrency } from '#utils/currency.utils.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokensCost: number;
  outputTokensCost: number;
  cacheReadTokensCost: number;
  cacheWriteTokensCost: number;
  totalCost: number;
};

/**
 * Component for displaying total usage data across all chats in a project.
 * Self-contained component that extracts its own state from the project context.
 */
export function ChatDetailsUsage(): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const { chats } = useChats(projectId);

  // Calculate total usage across all chats in the project
  const totals = useMemo(() => {
    const usage: UsageTotals = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      inputTokensCost: 0,
      outputTokensCost: 0,
      cacheReadTokensCost: 0,
      cacheWriteTokensCost: 0,
      totalCost: 0,
    };

    for (const chat of chats) {
      for (const message of chat.messages) {
        for (const part of message.parts) {
          if (part.type === 'data-usage') {
            usage.inputTokens += part.data.inputTokens;
            usage.outputTokens += part.data.outputTokens;
            usage.cacheReadTokens += part.data.cacheReadTokens;
            usage.cacheWriteTokens += part.data.cacheWriteTokens;
            usage.inputTokensCost += part.data.inputTokensCost;
            usage.outputTokensCost += part.data.outputTokensCost;
            usage.cacheReadTokensCost += part.data.cacheReadTokensCost;
            usage.cacheWriteTokensCost += part.data.cacheWriteTokensCost;
            usage.totalCost += part.data.totalCost;
          }
        }
      }
    }

    return usage;
  }, [chats]);

  if (totals.totalCost === 0) {
    return undefined;
  }

  const totalTokens = totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;

  return (
    <div className='@container border-t pt-3'>
      <div className='flex items-center gap-1.5 text-sm font-medium text-foreground'>
        <span>Chat Usage</span>
      </div>

      <Table className='-mx-2 overflow-clip rounded-md'>
        <TableHeader>
          <TableRow>
            <TableHead className=''>Metric</TableHead>
            <TableHead className='text-right'>Tokens</TableHead>
            <TableHead className='text-right'>Cost</TableHead>
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
            <TableCell className='text-right font-mono'>{formatNumberAbbreviation(totals.inputTokens)}</TableCell>
            <TableCell className='text-right font-mono'>
              {formatCurrency(totals.inputTokensCost, { significantFigures: 2 })}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className='flex flex-row items-center gap-1'>
              <span className='@[16rem]:hidden'>OUT</span>
              <span className='hidden @[16rem]:inline'>Output</span>
              <InfoTooltip>The number of tokens in output responses across all chats.</InfoTooltip>
            </TableCell>
            <TableCell className='text-right font-mono'>{formatNumberAbbreviation(totals.outputTokens)}</TableCell>
            <TableCell className='text-right font-mono'>
              {formatCurrency(totals.outputTokensCost, { significantFigures: 2 })}
            </TableCell>
          </TableRow>
          {totals.cacheReadTokens > 0 && (
            <TableRow>
              <TableCell className='flex flex-row items-center gap-1'>
                <span className='@[16rem]:hidden'>CR</span>
                <span className='hidden @[16rem]:inline'>Cache Read</span>
                <InfoTooltip>
                  The number of tokens read from the prompt cache. This improves performance by avoiding re-processing
                  the same prompt.
                </InfoTooltip>
              </TableCell>
              <TableCell className='text-right font-mono'>{formatNumberAbbreviation(totals.cacheReadTokens)}</TableCell>
              <TableCell className='text-right font-mono'>
                {formatCurrency(totals.cacheReadTokensCost, { significantFigures: 2 })}
              </TableCell>
            </TableRow>
          )}
          {totals.cacheWriteTokens > 0 ? (
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
                {formatNumberAbbreviation(totals.cacheWriteTokens)}
              </TableCell>
              <TableCell className='text-right font-mono'>
                {formatCurrency(totals.cacheWriteTokensCost, { significantFigures: 2 })}
              </TableCell>
            </TableRow>
          ) : undefined}
        </TableBody>
        <TableFooter className='overflow-clip rounded-b-md'>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell className='text-right font-mono'>{formatNumberAbbreviation(totalTokens)}</TableCell>
            <TableCell className='text-right font-mono'>
              {formatCurrency(totals.totalCost, { significantFigures: 2 })}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
