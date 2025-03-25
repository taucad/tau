import { Button } from '@/components/ui/button';
import { Link } from '@remix-run/react';
import { ComingSoon } from '@/components/ui/coming-soon';
import { Handle } from '@/types/matches';

export const handle: Handle = {
  breadcrumb: () => {
    return (
      <Link to="/docs" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Docs
        </Button>
      </Link>
    );
  },
};

// We want to redirect to the new build page if the user navigates to the builds route
export default function Builds() {
  return (
    <div className="container flex h-full flex-col items-center justify-center gap-4 px-4 py-8">
      <h1 className="text-6xl font-medium tracking-tight">Docs</h1>
      <ComingSoon size="landing" />
    </div>
  );
}
