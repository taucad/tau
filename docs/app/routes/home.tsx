import type { Route } from './+types/home';
import { Outlet, redirect, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';

export async function loader({ request }: Route.LoaderArgs) {
  return redirect('/docs')
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/builds') {
      void navigate('/');
    }
  }, [navigate, location.pathname]);

  return <Outlet />;
}
