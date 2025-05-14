import { Link, Outlet, redirect, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import type { LoaderFunction } from 'react-router';
import type { JSX } from 'react';
import { Button } from '~/components/ui/button.js';
import type { Handle } from '~/types/matches.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Link to="/builds/library" tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          Builds
        </Button>
      </Link>
    );
  },
};

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  if (url.pathname === '/builds') {
    return redirect('/');
  }

  return null;
};

// We want to redirect to the new build page if the user navigates to the builds route
export default function Builds(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/builds') {
      void navigate('/');
    }
  }, [navigate, location.pathname]);

  return <Outlet />;
}
