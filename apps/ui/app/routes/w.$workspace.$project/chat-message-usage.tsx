import React from 'react';
import type { UsageData } from '@taucad/chat';
import { Sparkles } from 'lucide-react';
import { SvgIcon, unknownIconId } from '#components/icons/svg-icon.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { Button } from '@taucad/ui/components/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { formatNumberAbbreviation } from '#utils/number.utils.js';

/** Provider token counts summed over a message's usage parts. @public */
export type UsageTotals = {
  readonly input: number;
  readonly output: number;
  readonly reasoning: number | undefined;
  readonly cacheRead: number;
  readonly cacheWrite: number;
};

/** @public */
export const sumUsageTokens = (usageParts: readonly UsageData[]): UsageTotals => {
  let input = 0;
  let output = 0;
  let reasoning: number | undefined;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const usage of usageParts) {
    input += usage.inputTokens;
    output += usage.outputTokens;
    cacheRead += usage.cacheReadTokens;
    cacheWrite += usage.cacheWriteTokens;
    if (usage.reasoningTokens !== undefined) {
      reasoning = (reasoning ?? 0) + usage.reasoningTokens;
    }
  }
  return { input, output, reasoning, cacheRead, cacheWrite };
};

/** The model's brand glyph, or a generic mark when the catalog does not know the model. */
function ModelGlyph({
  model,
  isMono,
  className,
}: {
  readonly model: ResolvedModel;
  readonly isMono?: boolean;
  readonly className?: string;
}): React.JSX.Element {
  if (model.family === unknownIconId) {
    return <Sparkles aria-hidden='true' className={className} />;
  }
  // ponytail: the row is monochrome. Only Claude ships a `-mono` symbol; the
  // brand glyphs that paint with a gradient are desaturated instead. Add
  // `<family>-mono` sprites (regen-sprite) if grayscale ever reads muddy.
  return <SvgIcon id={isMono && model.family === 'claude' ? 'claude-mono' : model.family} className={className} />;
}

const totalOf = (totals: UsageTotals): number => totals.input + totals.output + totals.cacheRead + totals.cacheWrite;

/**
 * The usage control beside Copy under an assistant message: a Copy-sized
 * ghost button carrying the model's monochrome glyph, whose hover card names
 * the model (and the external agent that ran it), the tokens, and — when the
 * caller passes them — Tau credits. Cloud and self-host share this surface;
 * only the credits line differs.
 *
 * @param props - The resolved model, agent, summed tokens, turn count and credit summary.
 * @returns The usage button and its hover card.
 */
export function ChatMessageUsage({
  model,
  agent,
  totals,
  turns,
  credits,
  reference,
}: {
  readonly model: ResolvedModel;
  /** Display name of the external agent that produced the turn, if any. */
  readonly agent?: string | undefined;
  readonly totals: UsageTotals;
  readonly turns: number;
  /** Credit summary line; omitted entirely on self-host or when the user hides costs. */
  readonly credits?: string | undefined;
  readonly reference?: string | undefined;
}): React.JSX.Element {
  const tokens = formatNumberAbbreviation(totalOf(totals));
  const modelLabel = agent === undefined ? model.name : `${agent} · ${model.name}`;
  const label = [
    `Usage: ${modelLabel}`,
    `${tokens} tokens`,
    credits === undefined ? undefined : `Tau credits: ${credits}`,
  ]
    .filter(Boolean)
    .join(', ');
  const rows: Array<[string, string]> = [['Tokens', tokens]];
  if (credits !== undefined) {
    rows.push(['Credits', credits]);
  }
  if (turns > 1) {
    rows.push(['Turns', String(turns)]);
  }
  const breakdown = [
    `${formatNumberAbbreviation(totals.input)} in`,
    `${formatNumberAbbreviation(totals.output)} out`,
    totals.reasoning === undefined ? undefined : `${formatNumberAbbreviation(totals.reasoning)} reasoning`,
    totals.cacheRead > 0 ? `${formatNumberAbbreviation(totals.cacheRead)} cache read` : undefined,
    totals.cacheWrite > 0 ? `${formatNumberAbbreviation(totals.cacheWrite)} cache write` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button size='icon-sm' variant='ghost' aria-label={label} className='cursor-help text-muted-foreground'>
          <ModelGlyph model={model} isMono className='size-3.5 grayscale' />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side='bottom' align='start' className='w-auto min-w-52 p-3 text-xs'>
        <div className='flex items-center gap-2'>
          <ModelGlyph model={model} className='size-4' />
          <span className='font-mono text-foreground'>{model.name}</span>
          {agent === undefined ? undefined : <span className='text-muted-foreground'>via {agent}</span>}
        </div>
        <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1'>
          {rows.map(([name, value]) => (
            <React.Fragment key={name}>
              <dt className='text-muted-foreground'>{name}</dt>
              <dd className='text-right font-mono text-foreground'>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
        <p className='mt-2 text-[11px] text-muted-foreground'>{breakdown}</p>
        {reference === undefined ? undefined : (
          <p className='mt-1 font-mono text-[11px] text-muted-foreground'>Reference {reference}</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
