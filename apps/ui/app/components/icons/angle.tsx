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
      <path d="M11 20a10 10 0 0 0-3.986-7.99" />
      <path d="M13 4 3.4 16.8A2 2 0 0 0 5 20h16" />
    </svg>
  );
}
