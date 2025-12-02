import type { MyMetadata } from '@taucad/chat';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import { Badge } from '#components/ui/badge.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter, Table } from '#components/ui/table.js';
import { useModels } from '#hooks/use-models.js';
import { formatCurrency } from '#utils/currency.utils.js';
import { formatNumber } from '#utils/number.utils.js';

// Single metadata usage component
export function ChatMessageMetadataUsage({
  metadata,
}: {
  readonly metadata: MyMetadata;
}): React.JSX.Element | undefined {
  const { data: models } = useModels();

  if (!metadata.usageCost) {
    return undefined;
  }

  const usage = metadata.usageCost;
  const model = models?.find((m) => m.id === metadata.model);

  // Calculate total cost from usage data
  const totalTokens = usage.inputTokens + usage.outputTokens + usage.cachedReadTokens + (usage.cachedWriteTokens ?? 0);
  const totalCost = usage.usageCost ?? 0;

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild className="flex flex-row items-center" tabIndex={0}>
        <Badge variant="outline" className="h-7 cursor-help font-medium text-inherit outline-none hover:bg-neutral/20">
          {formatCurrency(totalCost, { significantFigures: 2 })}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto p-2 pt-1">
        <div className="flex flex-col space-y-1">
          <div className="flex flex-row items-baseline justify-between gap-4 p-2 pb-0">
            <h4 className="font-medium">Usage Details</h4>
            {model ? (
              <div className="flex items-baseline gap-2 text-xs">
                <SvgIcon id={model.provider.id} className="size-4 translate-y-[0.25em] text-muted-foreground" />
                <span className="font-mono">{model.name}</span>
              </div>
            ) : null}
          </div>
          <Table className="overflow-clip rounded-md">
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="flex flex-row items-center gap-1">
                  <span>Input</span>
                  <InfoTooltip>
                    The number of tokens in the input prompt. This includes the user prompt, system message, and any
                    previous messages.
                  </InfoTooltip>
                </TableCell>
                <TableCell>{formatNumber(usage.inputTokens)}</TableCell>
                <TableCell>{formatCurrency(0, { significantFigures: 2 })}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="flex flex-row items-center gap-1">
                  <span>Output</span>
                  <InfoTooltip>The number of tokens in the output response.</InfoTooltip>
                </TableCell>
                <TableCell>{formatNumber(usage.outputTokens)}</TableCell>
                <TableCell>{formatCurrency(0, { significantFigures: 2 })}</TableCell>
              </TableRow>
              {usage.cachedReadTokens > 0 && (
                <TableRow>
                  <TableCell className="flex flex-row items-center gap-1">
                    <span>Cached Read</span>
                    <InfoTooltip>
                      The number of tokens read from the prompt cache. This improves performance by avoiding
                      re-processing the same prompt.
                    </InfoTooltip>
                  </TableCell>
                  <TableCell>{formatNumber(usage.cachedReadTokens)}</TableCell>
                  <TableCell>{formatCurrency(0, { significantFigures: 2 })}</TableCell>
                </TableRow>
              )}
              {usage.cachedWriteTokens !== undefined && usage.cachedWriteTokens > 0 ? (
                <TableRow>
                  <TableCell className="flex flex-row items-center gap-1">
                    <span>Cached Write</span>
                    <InfoTooltip>
                      The number of tokens written to the prompt cache. This improves performance by avoiding
                      re-processing the same prompt.
                    </InfoTooltip>
                  </TableCell>
                  <TableCell>{formatNumber(usage.cachedWriteTokens)}</TableCell>
                  <TableCell>{formatCurrency(0, { significantFigures: 2 })}</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            <TableFooter className="overflow-clip rounded-b-md">
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell>{formatNumber(totalTokens)}</TableCell>
                <TableCell>{formatCurrency(totalCost, { significantFigures: 2 })}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
