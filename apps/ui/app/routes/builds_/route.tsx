import { Button } from '@/components/ui/button';
import { Link, Outlet, redirect, useLocation } from '@remix-run/react';
import { useEffect } from 'react';
import { useNavigate } from '@remix-run/react';
import { LoaderFunctionArgs } from '@remix-run/node';
import { Handle } from '@/types/matches';

export const handle: Handle = {
  breadcrumb: () => {
    return (
      <Link to="/builds/library" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Builds
        </Button>
      </Link>
    );
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname === '/builds') {
    return redirect('/');
  }
  // `undefined` is not allowed in the loader
  // eslint-disable-next-line unicorn/no-null
  return null;
};

// We want to redirect to the new build page if the user navigates to the builds route
export default function Builds() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/builds') {
      navigate('/');
    }
  }, [navigate, location.pathname]);

  return <Outlet />;
}
