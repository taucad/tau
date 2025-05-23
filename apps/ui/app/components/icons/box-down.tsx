import type { JSX } from 'react';
import { cn } from '~/utils/ui.js';

export function BoxDown(properties: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide lucide-box-down', properties.className)}
      {...properties}
    >
      <path d="M12 15v-3" />
      <path d="m14 18 3 3v-5.5" />
      <path d="m17 21 3-3" />
      <path d="M21 14.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 1.5.198" />
      <path d="m3.3 7 8.7 5 8.7-5" />
    </svg>
  );
}
