import { Link } from 'react-router';
import { Tau } from '#components/icons/tau.js';

const navigationLinks = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
  { label: 'Contact', href: 'mailto:sales@tau.new' },
];

export function PageFooter(): React.JSX.Element {
  return (
    <footer className="shrink-0 border-t border-neutral/20 bg-background">
      <div className="container mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
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
      </div>
    </footer>
  );
}
