import { legalDocuments } from '#www/legal.js';

/** Public route metadata, shared by SSR loaders and the sitemap. */
export const pages: Array<{ path: string; title: string; description: string; error?: boolean }> = [
  {
    path: '/',
    title: 'Tau — Open-source, AI-native CAD',
    description:
      'Describe a part and get editable parametric CAD, checked against your requirements and ready to export for machining or 3D printing. Open source and free to start.',
  },
  {
    path: '/product/',
    title: 'Product — Code-based CAD with an AI agent · Tau',
    description:
      'Design editable parametric parts, verify geometric requirements with GeoSpec and export STEP, STL or 3MF for your machining and fabrication workflow.',
  },
  {
    path: '/use-cases/',
    title: 'Use cases · Tau',
    description:
      'Use Tau to prototype mounts and enclosures, design engineering parts and learn how mechanisms work, then export for machining or 3D printing.',
  },
  {
    path: '/use-cases/prototyping/',
    title: 'Prototyping · Tau',
    description:
      'Design enclosures, mounts and replacement parts around measurements you already have. Check the fit in CAD, then print or machine a prototype.',
  },
  {
    path: '/use-cases/engineering/',
    title: 'Engineering · Tau',
    description:
      'Design parts around their interfaces, clearances and envelope. Keep the requirements next to the CAD source and export STEP for your manufacturing workflow.',
  },
  {
    path: '/use-cases/learning/',
    title: 'Learning · Tau',
    description:
      'Open an example model, change its dimensions and see what happens. Then make the part and compare it with the model.',
  },
  {
    path: '/vision/',
    title: 'Vision · Tau',
    description:
      'We’re building open-source tools that take a design from an idea to a physical part: editable CAD, geometry checks and exports for manufacturing.',
  },
  {
    path: '/pricing/',
    title: 'Pricing — Free, Pro US$20 and Enterprise · Tau',
    description:
      'Start free in your browser. Pro is US$20 per month plus applicable tax, with 2,000 monthly credits and 10 GB of Tau Cloud backup and sync.',
  },
  {
    path: '/contact/',
    title: 'Contact · Tau',
    description: 'Contact the Tau team about enterprise plans, ask the community on Discord or report a bug on GitHub.',
  },
  {
    path: '/download/',
    title: 'Download · Tau',
    description: 'Download Tau Desktop for macOS, Windows and Linux, or use Tau in your browser.',
  },
  {
    path: '/blog/',
    title: 'Blog · Tau',
    description: 'Product updates and engineering posts from the Tau team.',
  },
  {
    path: '/privacy/',
    title: 'Privacy on this site · Tau',
    description: 'How the Tau website handles optional analytics and browser storage.',
  },
  {
    path: '/legal/',
    title: 'Legal · Tau',
    description: 'Terms, privacy, cookies, acceptable use, sub-processors and open-source notices for Tau.',
  },
  ...legalDocuments.map(({ slug, title, description }) => ({
    path: `/legal/${slug}/`,
    title: `${title} · Tau`,
    description,
  })),
  {
    path: '/404.html',
    title: 'Page not found · Tau',
    description: 'This page may have moved or no longer exists.',
    error: true,
  },
];
