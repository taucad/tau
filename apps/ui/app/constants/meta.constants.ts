import { version } from 'package.json';

/**
 * Meta config. Contains infrequently changing information about the app.
 */
export const metaConfig = {
  /**
   * The name of the app. Used for SEO and other metadata such as PWA and app store naming.
   */
  name: 'Tau',
  /**
   * The prefix for all database tables.
   */
  databasePrefix: 'tau-',
  /**
   * The prefix for all cookies.
   *
   * WARNING: changing this value will cause existing cookies not to be read and result in poor UX.
   */
  cookiePrefix: 'tau-',
  /**
   * The owner of the GitHub repository.
   */
  githubOwner: 'taucad',
  /**
   * The repository of the GitHub repository.
   */
  githubRepo: 'tau',
  /**
   * The URL to the GitHub repository.
   */
  githubUrl: 'https://github.com/taucad/tau',
  /**
   * The description of the app. Used for SEO and other metadata such as PWA and app store descriptions.
   */
  description: 'Tau: The multi-kernel CAD framework for the web.',
  /**
   * The directory of the docs relative to the root of the repository.
   */
  docsDir: 'apps/ui/content/docs',
  /**
   * The version of the app.
   */
  version,
  /**
   * The user agent of the app.
   */
  userAgent: `TauCAD/${version}`,
  /**
   * The sales email address.
   */
  salesEmail: 'sales@tau.new',
} as const;
