import { cn } from '@taucad/ui/utils/cn';

/** Lucide-style thought bubble proposed for reasoning activity. */
export function ThoughtBubble({ className, ...properties }: React.SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...properties}
      className={cn('lucide lucide-thought-bubble', className)}
    >
      <path d='M10.632 2a3.8 3.8 0 0 1 3.395 2.066 2.86 2.86 0 0 1 2.289-1.137c1.57 0 2.842 1.247 2.842 2.785a2.7 2.7 0 0 1-.165.929h.165C20.728 6.643 22 7.89 22 9.429s-1.273 2.785-2.842 2.785h-.244a4.26 4.26 0 0 1-6.942 1.647A2.85 2.85 0 0 1 9.684 15c-1.57 0-2.842-1.247-2.842-2.786l-.146-.003C5.194 12.136 4 10.919 4 9.429 4 7.89 5.273 6.643 6.842 6.643h.12a3.7 3.7 0 0 1-.12-.929C6.842 3.663 8.54 2 10.632 2' />
      <path d='M3 22h.01' />
      <circle cx='5.5' cy='18.5' r='.5' fill='currentColor' />
    </svg>
  );
}
