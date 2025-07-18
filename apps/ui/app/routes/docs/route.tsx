import type { JSX } from 'react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button.js';
import { ComingSoon } from '~/components/ui/coming-soon.js';
import type { Handle } from '~/types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Link to="/docs" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Docs
        </Button>
      </Link>
    );
  },
};

export default function Docs(): JSX.Element {
  return (
    <div className="container flex h-full flex-col items-center justify-center gap-4 px-4 py-8">
      <h1 className="text-6xl font-medium tracking-tight">Docs</h1>
      <ComingSoon size="landing" />
    </div>
  );
}
