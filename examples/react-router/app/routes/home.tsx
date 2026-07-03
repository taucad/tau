import type { MetaFunction } from 'react-router';
import type { ReactElement } from 'react';
import { RuntimeDemo } from '../components/runtime-demo';

export const meta: MetaFunction = () => [
  { title: 'Tau Runtime React Router Example' },
  {
    name: 'description',
    content: 'React Router + Vite example for @taucad/runtime with a web worker.',
  },
];

export default function Home(): ReactElement {
  return <RuntimeDemo />;
}
