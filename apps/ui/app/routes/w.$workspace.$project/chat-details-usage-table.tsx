import { Heading } from '@taucad/ui/components/heading';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { InfoTooltip } from '@taucad/ui/components/info-tooltip';
import { formatNumberAbbreviation } from '@taucad/ui-core/utils/number.utils';
import { useProjectChatUsage } from '#hooks/use-chats.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useProject } from '#hooks/use-project.js';
import { cn } from '@taucad/ui/utils/cn';

/*
 * The four-row table's own elements, styled as `@taucad/ui/components/table` styles them. That module is shared by
 * the Home route's data table, and a second importer here would split it into a chunk of its own on Home's critical
 * path (gate G1); the classes are the whole of what it adds.
 */
const Table = ({ className, ...properties }: React.ComponentProps<'table'>): React.JSX.Element => (
  <div className='relative w-full overflow-x-auto'>
    <table className={cn('w-full caption-bottom text-sm', className)} {...properties} />
  </div>
);
const TableHeader = (properties: React.ComponentProps<'thead'>): React.JSX.Element => (
  <thead className='[&_tr]:border-b' {...properties} />
);
const TableBody = (properties: React.ComponentProps<'tbody'>): React.JSX.Element => (
  <tbody className='[&_tr:last-child]:border-0' {...properties} />
);
const TableFooter = (properties: React.ComponentProps<'tfoot'>): React.JSX.Element => (
  <tfoot className='border-t bg-muted/50 font-medium [&>tr]:last:border-b-0' {...properties} />
);
const TableRow = (properties: React.ComponentProps<'tr'>): React.JSX.Element => (
  <tr className='border-b transition-colors hover:bg-muted/50' {...properties} />
);
const TableHead = ({ className, ...properties }: React.ComponentProps<'th'>): React.JSX.Element => (
  <th
    className={cn('h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground', className)}
    {...properties}
  />
);
const TableCell = ({ className, ...properties }: React.ComponentProps<'td'>): React.JSX.Element => (
  <td className={cn('p-2 align-middle whitespace-nowrap', className)} {...properties} />
);

type UsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  parts: number;
};

/**
 * Project-wide chat usage: provider token counts aggregated locally, with the
 * caller's credits line beneath (the Cloud receipt leaf). Core in every ceiling;
 * no amount here is derived from a local price (B4 R2/R3).
 *
 * @param props - Whether the chat records are read, and the credits line.
 * @returns The usage panel, or nothing when the project has no recorded usage.
 */
export function ChatDetailsUsageTable({
  isEnabled = true,
  credits,
}: {
  readonly isEnabled?: boolean;
  /** The charged total beneath the table, from the project's funded operations. */
  readonly credits: (operationIds: readonly string[]) => ReactNode;
}): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const { chats } = useChatRecords(projectId, { enabled: isEnabled });
  const chatIds = useMemo(() => chats.map((chat) => chat.id), [chats]);
  const history = useProjectChatUsage(projectId, chatIds, isEnabled);

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
      const summary = history.get(chat.id);
      if (summary === undefined) {
        continue;
      }
      usage.parts += summary.parts;
      usage.inputTokens += summary.inputTokens;
      usage.outputTokens += summary.outputTokens;
      usage.cacheReadTokens += summary.cacheReadTokens;
      usage.cacheWriteTokens += summary.cacheWriteTokens;
      for (const id of summary.operationIds) {
        ids.add(id);
      }
    }

    return { tokens: usage, operationIds: [...ids].sort() };
  }, [chats, history]);

  if (tokens.parts === 0) {
    return undefined;
  }

  const totalTokens = tokens.inputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;

  return (
    <section aria-label='Chat usage' className='@container overflow-hidden rounded-xl border border-border bg-card'>
      <Heading level={2} variant='label' className='border-b px-3 py-2 text-foreground'>
        Chat usage
      </Heading>
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
      {credits(operationIds)}
    </section>
  );
}
