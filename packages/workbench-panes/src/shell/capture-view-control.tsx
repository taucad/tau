import { useCallback } from 'react';
import { Camera, Check } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';
import { useGraphicsSelector } from '@taucad/viewer/hooks/use-graphics';

/**
 * Props for {@link CaptureViewControl}.
 *
 * @public
 */
export type CaptureViewControlProps = Readonly<{
  /** Capture the view and hand it on; resolves `true` when it landed, and the button ticks. */
  onCapture: () => Promise<boolean>;
  /** What a click does, as the button's name and tooltip, such as "Capture view to chat". */
  label: string;
  /** The tooltip while the button ticks, such as "Added to chat". */
  doneLabel: string;
}>;

/**
 * The viewer bar's Capture button, shared by the Tau app and the agent plugin viewer: it mirrors Fit view, is
 * available once a model is drawn, and ticks when the host says the capture landed. Where the capture goes (the chat
 * draft, the project's `exports/`) is the host's `onCapture`. Pass it as `ViewerControls`' `capture`.
 *
 * @param props - What a click does and what the button says.
 * @returns The button.
 * @public
 */
export function CaptureViewControl({ onCapture, label, doneLabel }: CaptureViewControlProps): React.JSX.Element {
  const { ticked, trigger } = useTickAnimation();
  const canCapture = useGraphicsSelector((state) => state.context.artifact !== undefined);
  const capture = useCallback(async () => {
    if (await onCapture()) {
      trigger();
    }
  }, [onCapture, trigger]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={label}
          aria-disabled={!canCapture}
          onClick={canCapture ? capture : undefined}
        >
          {ticked ? <Check className='size-4 text-success' /> : <Camera className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {canCapture ? (ticked ? doneLabel : label) : 'Available when a model is displayed'}
      </TooltipContent>
    </Tooltip>
  );
}
