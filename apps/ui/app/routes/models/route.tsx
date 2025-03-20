import { Button } from '@/components/ui/button';
import { Link } from '@remix-run/react';
import { ComingSoon } from '@/components/ui/coming-soon';
import { Handle } from '@/types/matches';

export const handle: Handle = {
  breadcrumb: () => {
    return (
      <Link to="/models" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Models
        </Button>
      </Link>
    );
  },
};

// We want to redirect to the new build page if the user navigates to the builds route
export default function Builds() {
  return (
    <div className="container h-full px-4 py-8 gap-4 flex flex-col items-center justify-center">
      <h1 className="text-6xl font-medium tracking-tight">Models</h1>
      <ComingSoon size="landing" />
    </div>
  );
}
