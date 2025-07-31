import { SvgIcon } from '#components/icons/svg-icon.js';
import { InfoTooltip } from '#components/info-tooltip.js';
import { Badge } from '#components/ui/badge.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter, Table } from '#components/ui/table.js';
import { useModels } from '#hooks/use-models.js';
import type { ModelProvider } from '#types/cad.types.js';
import type { MessageAnnotation } from '#types/chat.types.js';
import { formatCurrency } from '#utils/currency.js';
import { formatNumber } from '#utils/number.js';

// Single annotation component
export function ChatMessageAnnotationUsage({
  annotation,
}: {
  readonly annotation: MessageAnnotation;
}): React.JSX.Element {
  const { data: models } = useModels();

  switch (annotation.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- supporting future types
    case 'usage': {
      const model = models?.find((model) => model.id === annotation.model);
      return (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild className="flex flex-row items-center" tabIndex={0}>
            <Badge
              variant="outline"
              className="h-7 cursor-help font-medium text-inherit outline-none hover:bg-neutral/20"
            >
              {formatCurrency(annotation.usageCost.totalCost, { significantFigures: 2 })}
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="w-auto p-2 pt-1">
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
                    <TableCell>
                      {formatCurrency(annotation.usageCost.inputTokensCost, { significantFigures: 2 })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="flex flex-row items-center gap-1">
                      <span>Output</span>
                      <InfoTooltip tooltip="The number of tokens in the output response." />
                    </TableCell>
                    <TableCell>{formatNumber(annotation.usageTokens.outputTokens)}</TableCell>
                    <TableCell>
                      {formatCurrency(annotation.usageCost.outputTokensCost, { significantFigures: 2 })}
                    </TableCell>
                  </TableRow>
                  {annotation.usageTokens.cachedReadTokens > 0 && (
                    <TableRow>
                      <TableCell className="flex flex-row items-center gap-1">
                        <span>Cached Read</span>
                        <InfoTooltip tooltip="The number of tokens read from the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                      </TableCell>
                      <TableCell>{formatNumber(annotation.usageTokens.cachedReadTokens)}</TableCell>
                      <TableCell>
                        {formatCurrency(annotation.usageCost.cachedReadTokensCost, { significantFigures: 2 })}
                      </TableCell>
                    </TableRow>
                  )}
                  {annotation.usageTokens.cachedWriteTokens > 0 && (
                    <TableRow>
                      <TableCell className="flex flex-row items-center gap-1">
                        <span>Cached Write</span>
                        <InfoTooltip tooltip="The number of tokens written to the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                      </TableCell>
                      <TableCell>{formatNumber(annotation.usageTokens.cachedWriteTokens)}</TableCell>
                      <TableCell>
                        {formatCurrency(annotation.usageCost.cachedWriteTokensCost, { significantFigures: 2 })}
                      </TableCell>
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
                    <TableCell>{formatCurrency(annotation.usageCost.totalCost, { significantFigures: 2 })}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }

    default: {
      const exhaustiveCheck: never = annotation.type;
      throw new Error(`Unknown annotation type: ${String(exhaustiveCheck)}`);
    }
  }
}

// Aggregated annotations component
export function ChatMessageAnnotationUsageAggregated({
  annotations,
}: {
  readonly annotations: MessageAnnotation[];
}): React.JSX.Element {
  const { data: models } = useModels();

  // Filter for usage annotations only
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- supporting future types
  const usageAnnotations = annotations.filter((annotation) => annotation.type === 'usage');

  // If only one usage annotation, use the single component
  if (usageAnnotations.length === 1) {
    return <ChatMessageAnnotationUsage annotation={usageAnnotations[0]!} />;
  }

  // Calculate totals across all annotations
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cachedReadTokens: 0,
    cachedWriteTokens: 0,
    inputTokensCost: 0,
    outputTokensCost: 0,
    cachedReadTokensCost: 0,
    cachedWriteTokensCost: 0,
    totalCost: 0,
  };

  for (const annotation of usageAnnotations) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- supporting future types
    if (annotation.type === 'usage') {
      totals.inputTokens += annotation.usageTokens.inputTokens;
      totals.outputTokens += annotation.usageTokens.outputTokens;
      totals.cachedReadTokens += annotation.usageTokens.cachedReadTokens;
      totals.cachedWriteTokens += annotation.usageTokens.cachedWriteTokens;
      totals.inputTokensCost += annotation.usageCost.inputTokensCost;
      totals.outputTokensCost += annotation.usageCost.outputTokensCost;
      totals.cachedReadTokensCost += annotation.usageCost.cachedReadTokensCost;
      totals.cachedWriteTokensCost += annotation.usageCost.cachedWriteTokensCost;
      totals.totalCost += annotation.usageCost.totalCost;
    }
  }

  // Get unique models used
  const uniqueModels = [...new Set(usageAnnotations.map((annotation) => annotation.model))];
  const modelInfo = uniqueModels.map((modelId) => models?.find((model) => model.id === modelId)).filter(Boolean);

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild className="flex flex-row items-center" tabIndex={0}>
        <Badge variant="outline" className="h-7 cursor-help font-medium text-inherit outline-none hover:bg-neutral/20">
          {formatCurrency(totals.totalCost, { significantFigures: 2 })}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto min-w-[400px] p-2 pt-1">
        <div className="flex flex-col space-y-1">
          <div className="flex flex-row items-baseline justify-between gap-4 p-2 pb-0">
            <h4 className="font-medium">Usage Details ({usageAnnotations.length} x tools)</h4>
            {modelInfo.length === 1 ? (
              <div className="flex items-baseline gap-2 text-xs">
                <SvgIcon
                  id={modelInfo[0]!.provider as ModelProvider}
                  className="size-4 translate-y-[0.25em] text-muted-foreground"
                />
                <span className="font-mono">{modelInfo[0]!.name}</span>
              </div>
            ) : modelInfo.length > 1 ? (
              <div className="flex items-baseline gap-1 text-xs">
                <span className="text-muted-foreground">Multiple models</span>
              </div>
            ) : null}
          </div>
          <Table className="overflow-clip rounded-md">
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                {usageAnnotations.map((_, index) => (
                  // eslint-disable-next-line react/no-array-index-key -- no part key
                  <TableHead key={index} className="text-center">
                    {index + 1}
                  </TableHead>
                ))}
                <TableHead className="text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="flex flex-row items-center gap-1">
                  <span>Input</span>
                  <InfoTooltip tooltip="The number of tokens in the input prompt. This includes the user prompt, system message, and any previous messages." />
                </TableCell>
                {usageAnnotations.map((annotation, index) => (
                  // eslint-disable-next-line react/no-array-index-key -- no part key
                  <TableCell key={index} className="text-center text-xs">
                    <div>{formatNumber(annotation.usageTokens.inputTokens)}</div>
                    <div className="text-muted-foreground">
                      {formatCurrency(annotation.usageCost.inputTokensCost, { significantFigures: 2 })}
                    </div>
                  </TableCell>
                ))}
                <TableCell className="text-right text-xs">
                  <div>{formatNumber(totals.inputTokens)}</div>
                  <div className="text-muted-foreground">
                    {formatCurrency(totals.inputTokensCost, { significantFigures: 2 })}
                  </div>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="flex flex-row items-center gap-1">
                  <span>Output</span>
                  <InfoTooltip tooltip="The number of tokens in the output response." />
                </TableCell>
                {usageAnnotations.map((annotation, index) => (
                  // eslint-disable-next-line react/no-array-index-key -- no part key
                  <TableCell key={index} className="text-center text-xs">
                    <div>{formatNumber(annotation.usageTokens.outputTokens)}</div>
                    <div className="text-muted-foreground">
                      {formatCurrency(annotation.usageCost.outputTokensCost, { significantFigures: 2 })}
                    </div>
                  </TableCell>
                ))}
                <TableCell className="text-right text-xs">
                  <div>{formatNumber(totals.outputTokens)}</div>
                  <div className="text-muted-foreground">
                    {formatCurrency(totals.outputTokensCost, { significantFigures: 2 })}
                  </div>
                </TableCell>
              </TableRow>
              {totals.cachedReadTokens > 0 && (
                <TableRow>
                  <TableCell className="flex flex-row items-center gap-1">
                    <span>Cached Read</span>
                    <InfoTooltip tooltip="The number of tokens read from the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                  </TableCell>
                  {usageAnnotations.map((annotation, index) => (
                    // eslint-disable-next-line react/no-array-index-key -- no part key
                    <TableCell key={index} className="text-center text-xs">
                      <div>{formatNumber(annotation.usageTokens.cachedReadTokens)}</div>
                      <div className="text-muted-foreground">
                        {formatCurrency(annotation.usageCost.cachedReadTokensCost, { significantFigures: 2 })}
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-xs">
                    <div>{formatNumber(totals.cachedReadTokens)}</div>
                    <div className="text-muted-foreground">
                      {formatCurrency(totals.cachedReadTokensCost, { significantFigures: 2 })}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {totals.cachedWriteTokens > 0 && (
                <TableRow>
                  <TableCell className="flex flex-row items-center gap-1">
                    <span>Cached Write</span>
                    <InfoTooltip tooltip="The number of tokens written to the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                  </TableCell>
                  {usageAnnotations.map((annotation, index) => (
                    // eslint-disable-next-line react/no-array-index-key -- no part key
                    <TableCell key={index} className="text-center text-xs">
                      <div>{formatNumber(annotation.usageTokens.cachedWriteTokens)}</div>
                      <div className="text-muted-foreground">
                        {formatCurrency(annotation.usageCost.cachedWriteTokensCost, { significantFigures: 2 })}
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-xs">
                    <div>{formatNumber(totals.cachedWriteTokens)}</div>
                    <div className="text-muted-foreground">
                      {formatCurrency(totals.cachedWriteTokensCost, { significantFigures: 2 })}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter className="overflow-clip rounded-b-md">
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                {usageAnnotations.map((annotation, index) => (
                  // eslint-disable-next-line react/no-array-index-key -- no part key
                  <TableCell key={index} className="text-center text-xs">
                    <div>
                      {formatNumber(
                        annotation.usageTokens.inputTokens +
                          annotation.usageTokens.outputTokens +
                          annotation.usageTokens.cachedReadTokens +
                          annotation.usageTokens.cachedWriteTokens,
                      )}
                    </div>
                    <div className="font-semibold text-muted-foreground">
                      {formatCurrency(annotation.usageCost.totalCost, { significantFigures: 2 })}
                    </div>
                  </TableCell>
                ))}
                <TableCell className="text-right text-xs font-bold">
                  <div>
                    {formatNumber(
                      totals.inputTokens + totals.outputTokens + totals.cachedReadTokens + totals.cachedWriteTokens,
                    )}
                  </div>
                  <div className="font-semibold">{formatCurrency(totals.totalCost, { significantFigures: 2 })}</div>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
