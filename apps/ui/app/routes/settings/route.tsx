import { Button } from '@/components/ui/button';
import { Link } from '@remix-run/react';
import { ComingSoon } from '@/components/ui/coming-soon';

export const handle = {
  breadcrumb: () => {
    return (
      <Link to="/workflows" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Settings
        </Button>
      </Link>
    );
  },
};

// We want to redirect to the new build page if the user navigates to the builds route
export default function Builds() {
  return (
    <div className="container h-full px-4 py-8 gap-4 flex flex-col items-center justify-center">
      <h1 className="text-6xl font-medium tracking-tight">Settings</h1>
      <ComingSoon size="landing" />
    </div>
  );
}
