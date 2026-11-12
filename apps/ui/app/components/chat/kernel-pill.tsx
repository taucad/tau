import { ChevronDown, Route } from 'lucide-react';
import { SvgIcon } from '@taucad/ui-kit/icons/svg-icon';
import { cn } from '@taucad/ui/utils/cn';
import { triggerStyles } from '#components/filesystem/workspace-selector.js';
import type { KernelPillFace } from '#components/chat/kernel-picker-layout.js';

/**
 * The kernel pill's finish: the location pill's own (ghost, glyph, label, chevron), so the two read as one row of
 * choices and leave the bar together when it needs the room.
 */
export const kernelPillStyles = triggerStyles.toolbar;

/** Auto's glyph: Lucide Route, in the pill's colour like every other glyph in the bar. */
export function AutoKernelGlyph({ className }: { readonly className?: string }): React.JSX.Element {
  return <Route aria-hidden className={cn('size-4 shrink-0', className)} />;
}

/** The pill's face: glyph, text, the quiet mismatch mark and the chevron. */
export function KernelPillContent({ face }: { readonly face: KernelPillFace }): React.JSX.Element {
  return (
    <>
      {face.glyph === 'auto' ? (
        <AutoKernelGlyph className={kernelPillStyles.icon} />
      ) : (
        <SvgIcon id={face.glyph} aria-hidden className={cn(kernelPillStyles.icon, 'grayscale')} />
      )}
      <span className={cn('truncate', kernelPillStyles.label)}>{face.text}</span>
      {face.isMismatch ? (
        <span aria-hidden data-slot='kernel-mismatch' className='size-2 shrink-0 rounded-full bg-muted-foreground' />
      ) : null}
      <ChevronDown aria-hidden className={kernelPillStyles.chevron} />
    </>
  );
}
