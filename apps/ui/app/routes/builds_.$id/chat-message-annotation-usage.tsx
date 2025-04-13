import { SvgIcon } from '@/components/icons/svg-icon.js';
import { InfoTooltip } from '@/components/info-tooltip.js';
import { Badge } from '@/components/ui/badge.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter, Table } from '@/components/ui/table.js';
import { useModels } from '@/hooks/use-models.js';
import type { ModelProvider } from '@/types/cad.js';
import type { MessageAnnotation } from '@/types/chat.js';
import { formatCurrency } from '@/utils/currency.js';
import { formatNumber } from '@/utils/number.js';

export function ChatMessageAnnotationUsage({ annotation }: { readonly annotation: MessageAnnotation }) {
  const { data: models } = useModels();

  switch (annotation.type) {
    case 'usage': {
      const model = models?.find((model) => model.id === annotation.model);
      return (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild className="flex flex-row items-center" tabIndex={0}>
            <Badge variant="outline" className="cursor-help font-medium text-inherit outline-none hover:bg-neutral/20">
              {formatCurrency(annotation.usageCost.totalCost)}
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="w-auto p-2">
            <div className="flex flex-col space-y-1">
              <div className="flex flex-row items-baseline justify-between gap-4 p-2 pb-0">
                <h4 className="font-medium">Usage Details</h4>
                {model ? (
                  <div className="flex items-baseline gap-2 text-xs">
                    <SvgIcon
                      id={model.provider as ModelProvider}
                      className="size-4 translate-y-[0.25em] text-muted-foreground"
                    />
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
                      <InfoTooltip tooltip="The number of tokens in the input prompt. This includes the user prompt, system message, and any previous messages." />
                    </TableCell>
                    <TableCell>{formatNumber(annotation.usageTokens.inputTokens)}</TableCell>
                    <TableCell>{formatCurrency(annotation.usageCost.inputTokensCost)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="flex flex-row items-center gap-1">
                      <span>Output</span>
                      <InfoTooltip tooltip="The number of tokens in the output response." />
                    </TableCell>
                    <TableCell>{formatNumber(annotation.usageTokens.outputTokens)}</TableCell>
                    <TableCell>{formatCurrency(annotation.usageCost.outputTokensCost)}</TableCell>
                  </TableRow>
                  {annotation.usageTokens.cachedReadTokens > 0 && (
                    <TableRow>
                      <TableCell className="flex flex-row items-center gap-1">
                        <span>Cached Read</span>
                        <InfoTooltip tooltip="The number of tokens read from the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                      </TableCell>
                      <TableCell>{formatNumber(annotation.usageTokens.cachedReadTokens)}</TableCell>
                      <TableCell>{formatCurrency(annotation.usageCost.cachedReadTokensCost)}</TableCell>
                    </TableRow>
                  )}
                  {annotation.usageTokens.cachedWriteTokens > 0 && (
                    <TableRow>
                      <TableCell className="flex flex-row items-center gap-1">
                        <span>Cached Write</span>
                        <InfoTooltip tooltip="The number of tokens written to the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                      </TableCell>
                      <TableCell>{formatNumber(annotation.usageTokens.cachedWriteTokens)}</TableCell>
                      <TableCell>{formatCurrency(annotation.usageCost.cachedWriteTokensCost)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter className="overflow-clip rounded-b-md">
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell>
                      {formatNumber(
                        annotation.usageTokens.inputTokens +
                          annotation.usageTokens.outputTokens +
                          annotation.usageTokens.cachedReadTokens +
                          annotation.usageTokens.cachedWriteTokens,
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(annotation.usageCost.totalCost)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check
    default: {
      const exhaustiveCheck: never = annotation.type;
      throw new Error(`Unknown annotation type: ${String(exhaustiveCheck)}`);
    }
  }
}
