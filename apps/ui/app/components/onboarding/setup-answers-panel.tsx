import { Bot, House, Mouse } from 'lucide-react';
import { Heading } from '@taucad/ui/components/heading';
import { cn } from '@taucad/ui/utils/cn';
import { answersPanelCopy } from '#components/onboarding/setup-copy.js';
import type { AnswerRow } from '#components/onboarding/setup-model.js';

const rowIcons = { agent: Bot, viewer: Mouse, home: House } as const;

/**
 * "What your answers change": each row says what an answer moves, as the person answers. Only the
 * rows an answer changed are announced, so a screen-reader user hears one line per answer, not the whole list.
 *
 * @param properties - The rows and the announcement for the last answer.
 * @returns The panel.
 */
export function SetupAnswersPanel({
  rows,
  announcement,
}: {
  readonly rows: readonly AnswerRow[];
  readonly announcement: string;
}): React.JSX.Element {
  return (
    <aside
      className='flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4'
      aria-labelledby='setup-answers-title'
      data-testid='setup-answers-panel'
    >
      <Heading id='setup-answers-title' level={3} variant='overline' className='text-muted-foreground'>
        {answersPanelCopy.title}
      </Heading>
      <ul className='flex flex-col gap-3'>
        {rows.map((row) => {
          const Icon = rowIcons[row.id];
          return (
            <li key={row.id} className='flex items-start gap-2.5' data-testid={`setup-answers-row-${row.id}`}>
              <Icon className='mt-0.5 size-3.5 shrink-0 text-muted-foreground' aria-hidden='true' />
              <span className='flex min-w-0 flex-col gap-0.5'>
                <span className='text-xs font-medium'>{row.label}</span>
                <span className={cn('text-xs', row.isPending ? 'text-muted-foreground' : 'text-foreground')}>
                  {row.text}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className='text-xs text-muted-foreground'>{answersPanelCopy.storage}</p>
      <p className='sr-only' role='status' data-testid='setup-answers-announcement'>
        {announcement}
      </p>
    </aside>
  );
}
