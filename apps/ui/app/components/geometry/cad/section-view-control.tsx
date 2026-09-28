import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { FlipHorizontal } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useCameraRig, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

type ToolToggleProps = Readonly<{
  /** Names this toggle (`data-tool`) after the tool whose row it opens (`data-tool-bar`). */
  tool: 'section' | 'measure';
  /** The fixed accessible name. */
  name: string;
  /** The visible label, shown from 520 px of viewer width. */
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  /** The formatted shortcut the tooltip shows. */
  shortcut?: string;
  onToggle: () => void;
}>;

/**
 * A tool's toggle in the viewer bar: a glyph, a label that gives way to the glyph below 520 px of viewer width, a
 * fixed name and `aria-pressed`. While the tool runs, its glyph turns teal on the accent surface.
 */
export function ToolToggle({
  tool,
  name,
  label,
  icon,
  isActive,
  shortcut,
  onToggle,
}: ToolToggleProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={name}
          aria-pressed={isActive}
          data-active={isActive}
          data-tool={tool}
          className='gap-1 text-xs data-[active=true]:bg-accent @min-[520px]/viewer:w-auto @min-[520px]/viewer:px-2 data-[active=true]:[&_svg]:text-viewer-tool-active'
          onClick={onToggle}
        >
          {icon}
          <span className='hidden @min-[520px]/viewer:inline'>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isActive ? `Stop ${label.toLowerCase()}` : name}
        {shortcut ? (
          <KeyShortcut variant='tooltip' className='ml-1'>
            {shortcut}
          </KeyShortcut>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

type SectionViewControlProps = Readonly<{
  /** The formatted shortcut the tooltip shows. */
  shortcut?: string;
  /** Runs once the toggle has started the section and its row is on screen. */
  onStart?: () => void;
}>;

/** Starts and stops the section view. A first cut removes the side of the model facing the camera. */
export function SectionViewControl({ shortcut, onStart }: SectionViewControlProps): React.JSX.Element {
  const graphicsRef = useGraphics();
  const cameraRig = useCameraRig();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);

  const handleToggle = useCallback(() => {
    // Synchronous, so the section row exists when `onStart` moves focus into it.
    flushSync(() => {
      graphicsRef.send({
        type: 'setSectionViewActive',
        payload: !isSectionViewActive,
        viewDirection: cameraRig.actorRef.getSnapshot().context.view.direction,
      });
    });
    if (!isSectionViewActive) {
      onStart?.();
    }
  }, [cameraRig, graphicsRef, isSectionViewActive, onStart]);

  return (
    <ToolToggle
      tool='section'
      name='Section view'
      label='Section'
      icon={<FlipHorizontal className='size-4' />}
      isActive={isSectionViewActive}
      shortcut={shortcut}
      onToggle={handleToggle}
    />
  );
}
