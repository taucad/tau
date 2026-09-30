import { forwardRef } from 'react';
import { Icon } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

/** Machined flange glyph for Parts navigation. */
export const PartsIcon = forwardRef<SVGSVGElement, LucideProps>((properties, reference) => (
  <Icon ref={reference} iconNode={[]} aria-hidden='true' {...properties}>
    <use href='#parts' width='24' height='24' />
  </Icon>
));
