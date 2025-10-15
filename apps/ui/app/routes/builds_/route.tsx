import { Link, Outlet, redirect, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import type { LoaderFunction } from 'react-router';
import { Button } from '#components/ui/button.js';
import type { Handle } from '#types/matches.types.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost">
            <Link to="/builds/library">Builds</Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2 align-baseline">
          View all builds{` `}
          <KeyShortcut variant="tooltip">{formatKeyCombination({ key: 'b', ctrlKey: true })}</KeyShortcut>
        </TooltipContent>
      </Tooltip>
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
export default function Builds(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/builds') {
      void navigate('/');
    }
  }, [navigate, location.pathname]);

  return <Outlet />;
}
