import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';

/** Keep application destinations as document navigations across the two router applications. */
export function SiteLink({
  href = '/',
  className = '',
  children,
  ...properties
}: ComponentProps<'a'>): React.JSX.Element {
  const isButton = className.split(' ').includes('button');
  const linkClass = isButton ? undefined : className;
  const link =
    href.startsWith('/') && !href.startsWith('/_www/') ? (
      <Link to={href} prefetch='intent' className={linkClass} {...properties}>
        {children}
      </Link>
    ) : (
      <a href={href} className={linkClass} {...properties} rel='noreferrer'>
        {children}
      </a>
    );
  return isButton ? (
    <Button asChild variant={className.includes('primary') ? 'default' : 'outline'} size='lg'>
      {link}
    </Button>
  ) : (
    link
  );
}
