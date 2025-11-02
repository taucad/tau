import React from 'react';
import { cn } from '#utils/ui.utils.js';

type SvgPathIconProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** URL string resolved via Vite (e.g., import iconUrl from './icon.svg?url') */
  readonly src: string;
  /** Optional accessible title; when omitted the icon is decorative */
  readonly title?: string;
};

export function SvgPathIcon({ src, className, title, alt, ...rest }: SvgPathIconProps): React.JSX.Element {
  const isDecorative = !title && !alt;
  return (
    <img
      src={src}
      alt={alt ?? ''}
      role={isDecorative ? 'presentation' : 'img'}
      aria-hidden={isDecorative ? true : undefined}
      className={cn('inline-block h-4 w-4 align-middle', className)}
      {...rest}
    />
  );
}
