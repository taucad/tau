/** Public route metadata, shared by SSR loaders and the sitemap. */
export const pages: Array<{ path: string; title: string; description: string; error?: boolean }> = [
  {
    path: '/',
    title: 'Tau — Design. Verify. Make.',
    description:
      'Design a useful part, verify its geometry and export for machining, 3D printing or fabrication. Editable parametric CAD, open source and free in your browser.',
  },
  {
    path: '/product/',
    title: 'Product — Design, verify and make with Tau',
    description:
      'Design editable parametric parts, verify geometric requirements with GeoSpec and export STEP, STL or 3MF for your machining and fabrication workflow.',
  },
  {
    path: '/use-cases/',
    title: 'Use cases — Make useful parts with Tau',
    description:
      'Design, verify and make prototypes, engineering parts and workshop projects with editable CAD and files for machining and 3D printing.',
  },
  {
    path: '/use-cases/prototyping/',
    title: 'For makers & product designers · Tau',
    description:
      'Design an enclosure, a custom mount or a replacement component around a real need. Check the fit in CAD, make a prototype and learn from using it.',
  },
  {
    path: '/use-cases/engineering/',
    title: 'For engineers & technical teams · Tau',
    description:
      'Develop parts around the interfaces, clearances and dimensions they need in use. Keep requirements beside the CAD source and carry the design into your manufacturing workflow.',
  },
  {
    path: '/use-cases/learning/',
    title: 'For students & curious minds · Tau',
    description:
      'Explore a mechanism, change its dimensions and check what happens. Connect the model on screen to a part you can make, assemble and learn from.',
  },
  {
    path: '/vision/',
    title: 'Vision — Give ideas physical form · Tau',
    description:
      'Design. Verify. Make. Tau connects editable CAD and geometric evidence to the tools and processes that turn a model into a useful physical part.',
  },
  {
    path: '/pricing/',
    title: 'Pricing — Free, Pro US$20 and Enterprise · Tau',
    description:
      'Start free in your browser. Pro is US$20 per month plus applicable tax, with 2,000 monthly credits and 10 GB of Tau Cloud backup and sync.',
  },
  {
    path: '/contact/',
    title: 'Contact — Talk to the Tau team',
    description:
      'Talk to Tau about the parts you want to make, your design and manufacturing workflow or a product question.',
  },
  {
    path: '/download/',
    title: 'Get Tau — In your browser today · Tau',
    description: 'Tau runs in your browser today. Tau Desktop is in development; no installer is published yet.',
  },
  {
    path: '/blog/',
    title: 'Blog — Notes from Tau',
    description:
      'Product notes and engineering stories from the people building Tau. Human-authored articles appear here after editorial review.',
  },
  {
    path: '/privacy/',
    title: 'Privacy on this site · Tau',
    description: 'How the Tau marketing site handles optional analytics, browser storage and links to the Tau app.',
  },
  {
    path: '/404.html',
    title: 'Page not found · Tau',
    description: 'This page is not available. Return to the Tau homepage or open the workspace.',
    error: true,
  },
];
