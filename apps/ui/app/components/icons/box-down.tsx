import { cn } from '@/utils/ui.js';

export function BoxDown(properties: React.SVGProps<SVGSVGElement>) {
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
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
      <path d="m14 19 3 3v-5.5" strokeWidth="8" className="stroke-muted group-hover:stroke-accent" />
      <path d="m17 22 3-3" strokeWidth="8" className="stroke-muted group-hover:stroke-accent" />
      <path d="m14 19 3 3v-5.5" />
      <path d="m17 22 3-3" />
    </svg>
  );
}
