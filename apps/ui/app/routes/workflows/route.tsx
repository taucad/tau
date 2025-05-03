import { Link } from 'react-router';
import { Button } from '@/components/ui/button.js';
import { ComingSoon } from '@/components/ui/coming-soon.js';
import type { Handle } from '@/types/matches.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Link to="/workflows" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Workflows
        </Button>
      </Link>
    );
  },
};

// We want to redirect to the new build page if the user navigates to the builds route
export default function Builds() {
  return (
    <div className="container flex h-full flex-col items-center justify-center gap-4 px-4 py-8">
      <h1 className="text-6xl font-medium tracking-tight">Workflows</h1>
      <ComingSoon size="landing" />
    </div>
  );
}
