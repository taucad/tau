import { useEffect } from 'react';
import { Outlet, redirect, useLocation, useNavigate } from 'react-router';
import type { LoaderFunction } from 'react-router';
import type { Handle } from '~/types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return <span className="p-2 text-sm font-medium">Settings</span>;
  },
};

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  if (url.pathname === '/settings') {
    return redirect('/settings/account');
  }

  return null;
};

export default function SettingsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/settings') {
      void navigate('/settings/account');
    }
  }, [navigate, location.pathname]);

  return <Outlet />;
}
