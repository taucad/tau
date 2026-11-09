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
      <path d='M10.7879 3.9879C10.8687 4.0058 10.9496 4.0255 11.0304 4.0472C11.5403 4.1838 12.0148 4.3867 12.4469 4.6442C12.7629 4.8325 13.0563 5.0499 13.3244 5.2919' />
      <path d='M10.7879 3.9879C11.8522 2.4335 13.8178 1.6415 15.7412 2.1568C18.0127 2.7653 19.4234 4.9821 19.0761 7.2533' />
      <path d='M10.7879 3.9879C7.8872 3.346 4.9682 5.0973 4.1917 7.9946C3.3935 10.9726 5.1612 14.0337 8.14 14.8316L8.3905 14.8927C8.8639 16.2901 10.0046 17.4327 11.537 17.8432C13.4609 18.3586 15.427 17.5662 16.4911 16.011' />
      <path d='M16.4911 16.011C16.503 15.9937 16.5148 15.9762 16.5264 15.9587L16.4911 16.011Z' />
      <path d='M19.0722 7.2783C21.228 8.1053 22.4541 10.4439 21.8432 12.7231C21.2119 15.0787 18.8496 16.5084 16.4911 16.011' />
      <circle cx='5' cy='19' r='2' />
    </svg>
  );
}
