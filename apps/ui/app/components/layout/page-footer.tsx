import { Link } from 'react-router';
import { Tau } from '#components/icons/tau.js';

const navigationLinks = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
  { label: 'Contact', href: '/contact' },
];

export function PageFooter(): React.JSX.Element {
  return (
    <footer className="border-t border-neutral/20 bg-background">
      <div className="container mx-auto flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-foreground transition-colors hover:text-foreground/80">
            <Tau className="size-6 text-primary" />
          </Link>
          <nav className="flex items-center gap-4">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="bg-emerald-500 size-2 rounded-full" />
          <span>All systems normal.</span>
        </div>
      </div>
    </footer>
  );
}
