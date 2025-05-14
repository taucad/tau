import type { JSX } from 'react';

export function Angle(properties: React.SVGProps<SVGSVGElement>): JSX.Element {
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
      {...properties}
    >
      <path d="M11 21a10 10 0 0 0-4-8" />
      <path d="M14.5 3 3.4 17.8A2 2 0 0 0 5 21h16" />
    </svg>
  );
}
