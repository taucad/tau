/** Legal documents published at `/legal/<slug>/`. The Tau app, desktop app and emails link to these paths. */
export const legalDocuments = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    description: 'The terms that govern your use of Tau and its services.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'How TauCAD Limited collects, uses, stores and protects your personal information.',
  },
  {
    slug: 'cookies',
    title: 'Storage and Cookie Policy',
    description: 'How Tau uses cookies and browser storage, and how to manage your analytics choice.',
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    description: 'Guidelines for appropriate use of Tau and its content standards.',
  },
  {
    slug: 'subprocessors',
    title: 'Sub-processors',
    description: 'The third-party service providers that process data on behalf of Tau.',
  },
  {
    slug: 'open-source',
    title: 'Open-Source Notices',
    description: 'The open-source software in Tau, including Open CASCADE Technology, and its licenses.',
  },
] as const;

export type LegalSlug = (typeof legalDocuments)[number]['slug'];
